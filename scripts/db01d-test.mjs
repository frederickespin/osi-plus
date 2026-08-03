/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import {
  COMMERCIAL_AUDIT_VIEW_PERMISSION,
  appendCommercialAudit,
  appendOperationalAuditWithRetry,
  executeCriticalAuditedMutation,
  listCommercialAudit,
} from "../api/_lib/commercialAuditLog.js";
import { createDb01dPrisma } from "./db01d-lib.mjs";

const prisma = createDb01dPrisma();
const results = [];

function check(name, condition, details = undefined) {
  if (!condition) throw new Error(`Falló: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true, ...(details ? { details } : {}) });
}

async function expectRejected(name, work, expectedCode) {
  try {
    await work();
    throw new Error(`${name}: la operación fue aceptada`);
  } catch (error) {
    if (String(error?.message || "").includes("la operación fue aceptada")) throw error;
    if (expectedCode) check(name, error?.code === expectedCode, `code=${error?.code || "DATABASE"}`);
    else check(name, true, `code=${error?.code || "DATABASE"}`);
  }
}

function context(tenantId, actorMembershipId, permissions = [COMMERCIAL_AUDIT_VIEW_PERMISSION]) {
  return { tenantId, actorKind: "MEMBERSHIP", actorMembershipId, permissions };
}

try {
  const tenantOne = await prisma.tenant.findUniqueOrThrow({ where: { code: "IPACKERS-DO" } });
  const membershipOne = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenantOne.id, status: "ACTIVE" },
  });
  const tenantTwo = await prisma.tenant.create({
    data: {
      id: "db01d-tenant-two",
      code: "DB01D-TWO",
      name: "DB-01D Synthetic Tenant Two",
      legalName: "DB-01D Synthetic Tenant Two",
      provisioningSource: "MANUAL",
    },
  });
  const membershipTwo = await prisma.tenantMembership.create({
    data: {
      id: "db01d-membership-two",
      tenantId: tenantTwo.id,
      userId: membershipOne.userId,
      role: "V",
      status: "ACTIVE",
      isDefault: false,
    },
  });

  const actorContext = context(tenantOne.id, membershipOne.id);
  const secondContext = context(tenantTwo.id, membershipTwo.id);

  const valid = await appendCommercialAudit(prisma, actorContext, {
    action: "CASE_VIEWED",
    entity: "CASE",
    entityId: "case-valid-1",
    source: "DB01D_TEST",
    requestId: "req-valid-1",
    beforeJson: { status: "NEW" },
    afterJson: { status: "OPEN" },
  });
  check("actor válido dentro del tenant", valid.actorMembershipId === membershipOne.id && valid.tenantId === tenantOne.id);
  check("snapshots antes/después", valid.beforeJson.status === "NEW" && valid.afterJson.status === "OPEN");

  await expectRejected(
    "rechazo de membresía cruzada en servicio",
    () => appendCommercialAudit(prisma, context(tenantOne.id, membershipTwo.id), {
      action: "CASE_VIEWED",
      entity: "CASE",
      entityId: "case-cross-tenant",
      source: "DB01D_TEST",
    }),
    "AUDIT_CROSS_TENANT_ACTOR",
  );

  await expectRejected(
    "rechazo de membresía cruzada por FK compuesta",
    () => prisma.$executeRawUnsafe(
      `INSERT INTO "osi"."commercial_audit_logs"
       ("id","tenant_id","actor_user_id","actor_membership_id","role_snapshot","action","entity","entity_id","source","correlation_id")
       VALUES ($1,$2,$3,$4,'V','DIRECT_CROSS_TENANT','CASE','case-direct-cross','DB01D_TEST','corr-direct-cross')`,
      "db01d-direct-cross",
      tenantOne.id,
      membershipTwo.userId,
      membershipTwo.id,
    ),
  );

  const systemAudit = await appendCommercialAudit(prisma, {
    tenantId: tenantOne.id,
    actorKind: "SYSTEM",
  }, {
    action: "BACKGROUND_CHECK_COMPLETED",
    entity: "CASE",
    entityId: "case-system-1",
    source: "SYSTEM_JOB",
    requestId: "req-system-1",
  });
  check("actor del sistema", systemAudit.actorUserId === null && systemAudit.roleSnapshot === "SYSTEM");

  const roleBefore = membershipOne.role;
  const snapshotAudit = await appendCommercialAudit(prisma, actorContext, {
    action: "CASE_OPENED",
    entity: "CASE",
    entityId: "case-role-snapshot",
    source: "DB01D_TEST",
    requestId: "req-role-snapshot",
  });
  await prisma.tenantMembership.update({ where: { id: membershipOne.id }, data: { role: roleBefore === "V" ? "A" : "V" } });
  const snapshotRows = await prisma.$queryRawUnsafe(
    `SELECT "role_snapshot" FROM "osi"."commercial_audit_logs" WHERE "id" = $1`,
    snapshotAudit.id,
  );
  check("roleSnapshot sobrevive cambio de rol", snapshotRows[0]?.role_snapshot === String(roleBefore));
  await prisma.tenantMembership.update({ where: { id: membershipOne.id }, data: { role: roleBefore } });

  const sanitized = await appendCommercialAudit(prisma, actorContext, {
    action: "FORM_SAVED",
    entity: "CASE",
    entityId: "case-sensitive",
    source: "DB01D_TEST",
    requestId: "req-sensitive",
    afterJson: {
      password: "must-not-persist",
      nested: { accessToken: "must-not-persist", safe: "visible" },
    },
    metadataJson: { authorization: "Bearer secret", safe: true },
  });
  check(
    "sanitización de secretos",
    sanitized.afterJson.password === "[REDACTED]" &&
      sanitized.afterJson.nested.accessToken === "[REDACTED]" &&
      sanitized.afterJson.nested.safe === "visible" &&
      sanitized.metadataJson.authorization === "[REDACTED]",
  );

  const sameEvent = {
    action: "CASE_SYNCED",
    entity: "CASE",
    entityId: "case-idempotent",
    source: "DB01D_TEST",
    requestId: "req-idempotent",
    correlationId: "corr-idempotent",
  };
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => appendCommercialAudit(prisma, actorContext, sameEvent)),
  );
  check("idempotencia concurrente por requestId", new Set(concurrent.map((row) => row.id)).size === 1);
  await expectRejected(
    "requestId no admite payload divergente",
    () => appendCommercialAudit(prisma, actorContext, { ...sameEvent, afterJson: { changed: true } }),
    "AUDIT_IDEMPOTENCY_CONFLICT",
  );

  for (let index = 0; index < 7; index += 1) {
    await appendOperationalAuditWithRetry(prisma, actorContext, {
      action: "CASE_VIEWED",
      entity: "CASE",
      entityId: `case-page-${index}`,
      source: "DB01D_TEST",
      requestId: `req-page-${index}`,
    });
  }
  const pageOne = await listCommercialAudit(prisma, actorContext, { entity: "CASE", limit: 3 });
  const pageTwo = await listCommercialAudit(prisma, actorContext, {
    entity: "CASE",
    limit: 3,
    cursor: pageOne.nextCursor,
  });
  check("paginación obligatoria", pageOne.data.length === 3 && pageTwo.data.length === 3 && Boolean(pageOne.nextCursor));
  check("paginación sin duplicados", pageOne.data.every((row) => !pageTwo.data.some((next) => next.id === row.id)));

  const filtered = await listCommercialAudit(prisma, actorContext, { action: "CASE_SYNCED", entityId: "case-idempotent", limit: 10 });
  check("filtros por acción y entidad", filtered.data.length === 1 && filtered.data[0].requestId === "req-idempotent");
  await expectRejected(
    "RBAC sin permiso",
    () => listCommercialAudit(prisma, context(tenantOne.id, membershipOne.id, []), {}),
    "AUDIT_FORBIDDEN",
  );
  await expectRejected(
    "RBAC permiso denegado prevalece",
    () => listCommercialAudit(prisma, {
      ...actorContext,
      deniedPermissions: [COMMERCIAL_AUDIT_VIEW_PERMISSION],
    }, {}),
    "AUDIT_FORBIDDEN",
  );

  await appendCommercialAudit(prisma, secondContext, {
    action: "CASE_VIEWED",
    entity: "CASE",
    entityId: "tenant-two-case",
    source: "DB01D_TEST",
    requestId: "tenant-two-request",
  });
  const tenantTwoPage = await listCommercialAudit(prisma, secondContext, { limit: 100 });
  check("aislamiento entre dos tenants", tenantTwoPage.data.length === 1 && tenantTwoPage.data[0].tenantId === tenantTwo.id);

  const legalNameBefore = tenantOne.legalName;
  const committed = await executeCriticalAuditedMutation(prisma, {
    context: actorContext,
    event: {
      action: "APPROVAL_GRANTED",
      entity: "TENANT_TEST_PROBE",
      entityId: tenantOne.id,
      source: "DB01D_TEST",
      requestId: "req-critical-commit",
      beforeJson: { legalName: legalNameBefore },
      afterJson: (result) => ({ legalName: result.legalName }),
    },
    mutate: (tx) => tx.tenant.update({
      where: { id: tenantOne.id },
      data: { legalName: "DB-01D Critical Commit" },
    }),
  });
  check("auditoría crítica en misma transacción", committed.audit.critical === true && committed.result.legalName === "DB-01D Critical Commit");

  await expectRejected(
    "fallo crítico explícito",
    () => executeCriticalAuditedMutation(prisma, {
      context: context(tenantOne.id, membershipTwo.id),
      event: {
        action: "APPROVAL_REJECTED",
        entity: "TENANT_TEST_PROBE",
        entityId: tenantOne.id,
        source: "DB01D_TEST",
        requestId: "req-critical-rollback",
      },
      mutate: (tx) => tx.tenant.update({
        where: { id: tenantOne.id },
        data: { legalName: "SHOULD ROLLBACK" },
      }),
    }),
    "AUDIT_CROSS_TENANT_ACTOR",
  );
  const rolledBackTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantOne.id } });
  check("fallo de auditoría crítica revierte negocio", rolledBackTenant.legalName === "DB-01D Critical Commit");

  await expectRejected(
    "tabla append-only rechaza UPDATE",
    () => prisma.$executeRawUnsafe(`UPDATE "osi"."commercial_audit_logs" SET "source"='MUTATED' WHERE "id"=$1`, valid.id),
  );
  await expectRejected(
    "tabla append-only rechaza DELETE",
    () => prisma.$executeRawUnsafe(`DELETE FROM "osi"."commercial_audit_logs" WHERE "id"=$1`, valid.id),
  );

  const syntheticRows = 25_000;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "osi"."commercial_audit_logs"
      ("id","tenant_id","role_snapshot","action","entity","entity_id","source","correlation_id","critical","created_at")
     SELECT
      'db01d-perf-' || gs::text, $1, 'SYSTEM', 'PERFORMANCE_SAMPLE', 'CASE',
      'perf-case-' || gs::text, 'DB01D_PERF', 'perf-corr-' || gs::text, false,
      CURRENT_TIMESTAMP - (gs || ' milliseconds')::interval
     FROM generate_series(1, $2::integer) AS gs`,
    tenantOne.id,
    syntheticRows,
  );
  const started = performance.now();
  const performancePage = await listCommercialAudit(prisma, actorContext, {
    action: "PERFORMANCE_SAMPLE",
    limit: 100,
  });
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  check("rendimiento con volumen sintético", performancePage.data.length === 100 && elapsedMs < 2_000, `${syntheticRows} filas; ${elapsedMs} ms`);

  const countRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::integer AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1`,
    tenantOne.id,
  );
  console.log(JSON.stringify({
    ok: true,
    productionUsed: false,
    results,
    syntheticPerformanceRows: syntheticRows,
    tenantOneAuditRows: countRows[0]?.count,
    paginatedQueryMs: elapsedMs,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
