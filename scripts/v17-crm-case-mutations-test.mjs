import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createCrmPipelineCase, hashCrmCaseMutation, updateCrmPipelineCase } from "../api/_lib/crmCaseMutationDomain.js";
import { findCrmPipelineCase, listCrmPipelineCases, parsePipelineListQuery } from "../api/_lib/crmPipelineRead.js";

const url = new URL(process.env.V17_CRM_CASE_MUTATIONS_TEST_DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/osi_v17_crm_case_mutations_local" || url.searchParams.get("schema") !== "osi") {
  throw new Error("V17_CRM_CASE_MUTATIONS_LOCAL_TARGET_REQUIRED");
}
const prisma = new PrismaClient({ datasourceUrl: url.href });
const results = [];
function check(name, value, detail) {
  results.push({ name, passed: Boolean(value), ...(detail === undefined ? {} : { detail }) });
  if (!value) throw new Error(name);
}
async function rejects(name, code, action) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(name, code === "ANY" ? Boolean(error) : error?.code === code, { expected: code, actual: error?.code || null });
}
function userData(id, role) {
  return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.invalid`, phone: "0000000000", role, status: "active", joinDate: "2026-08-24", passwordHash: "synthetic-not-login-capable" };
}
function fields(overrides = {}) {
  return { clientRef: null, mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", estimatedCbm: 12.5,
    requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Synthetic origin", destinationLocation: "Synthetic destination",
    destinationContracted: true, ...overrides };
}
function command(operation, values, requestId = `req-${randomUUID()}`, expectedVersion) {
  const payload = { operation, requestId, ...values, ...(operation === "UPDATE" ? { expectedVersion } : {}) };
  const { operation: _operation, ...body } = payload;
  return { ...body, payloadHash: hashCrmCaseMutation(payload) };
}
function context(tenantId, membershipId, userIdOverride) {
  const actorUsers = {
    "crm04a-member-a": "crm04a-admin",
    "crm04a-member-v1": "crm04a-sales-1",
    "crm04a-member-v2": "crm04a-sales-2",
    "crm04a-member-deny": "crm04a-deny",
    "crm04a-member-baseline": "crm04a-baseline",
  };
  return { tenantId, membershipId, userId: userIdOverride || actorUsers[membershipId] };
}

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database,current_schema() AS schema,inet_server_addr()::text AS address,inet_server_port() AS port,current_setting('neon.branch_id',true) AS neon");
  check("destino PostgreSQL 18 local exacto", identity[0].database === "osi_v17_crm_case_mutations_local" && identity[0].schema === "osi" && String(identity[0].address).split("/")[0] === "127.0.0.1" && Number(identity[0].port) === 55439 && !identity[0].neon);
  const tenant1 = await prisma.tenant.create({ data: { id: "crm04a-tenant-1", code: "CRM04A-T1", name: "Synthetic tenant one" } });
  const tenant2 = await prisma.tenant.create({ data: { id: "crm04a-tenant-2", code: "CRM04A-T2", name: "Synthetic tenant two" } });
  const users = await Promise.all([
    prisma.user.create({ data: userData("crm04a-admin", "A") }),
    prisma.user.create({ data: userData("crm04a-sales-1", "V") }),
    prisma.user.create({ data: userData("crm04a-sales-2", "V") }),
    prisma.user.create({ data: userData("crm04a-deny", "V") }),
    prisma.user.create({ data: userData("crm04a-baseline", "A") }),
  ]);
  const [admin, sales1, sales2, deny, baseline] = await Promise.all([
    prisma.tenantMembership.create({ data: { id: "crm04a-member-a", tenantId: tenant1.id, userId: users[0].id, role: "A", grantedPermissions: ["pipeline:view", "pipeline:create", "pipeline:update:any"] } }),
    prisma.tenantMembership.create({ data: { id: "crm04a-member-v1", tenantId: tenant1.id, userId: users[1].id, role: "V", grantedPermissions: ["pipeline:view", "pipeline:create", "pipeline:update:own"] } }),
    prisma.tenantMembership.create({ data: { id: "crm04a-member-v2", tenantId: tenant1.id, userId: users[2].id, role: "V", grantedPermissions: ["pipeline:view", "pipeline:create", "pipeline:update:own"] } }),
    prisma.tenantMembership.create({ data: { id: "crm04a-member-deny", tenantId: tenant1.id, userId: users[3].id, role: "V", grantedPermissions: ["pipeline:view"], deniedPermissions: ["pipeline:create", "pipeline:update:own"] } }),
    prisma.tenantMembership.create({ data: { id: "crm04a-member-baseline", tenantId: tenant1.id, userId: users[4].id, role: "A", grantedPermissions: ["pipeline:view"] } }),
  ]);
  const clientData = (id, tenantId, publicRef) => ({ id, tenantId, publicRef, code: id.toUpperCase(), name: id, email: "synthetic@example.invalid", phone: "000", address: "Synthetic", type: "PERSON", status: "ACTIVE", createdAt: "2026-08-24" });
  const client1 = await prisma.client.create({ data: clientData("crm04a-client-1", tenant1.id, randomUUID()) });
  const client2 = await prisma.client.create({ data: clientData("crm04a-client-2", tenant2.id, client1.publicRef) });
  const crossTenantClient = await prisma.client.create({ data: clientData("crm04a-client-cross", tenant2.id, randomUUID()) });
  check("Client.publicRef UUID v4 e independiente", /^[0-9a-f-]{36}$/.test(client1.publicRef) && client1.publicRef !== client1.id);
  check("mismo Client.publicRef lógico puede existir en tenants distintos", client2.publicRef === client1.publicRef);
  await rejects("Client.publicRef duplicado dentro del tenant se rechaza", "ANY", async () => prisma.client.create({ data: clientData("crm04a-client-duplicate", tenant1.id, client1.publicRef) }));
  await rejects("Client.publicRef inmutable", "ANY", async () => prisma.client.update({ where: { id: client1.id }, data: { publicRef: randomUUID() } }));
  const invalidHash = command("CREATE", fields());
  invalidHash.payloadHash = "0".repeat(64);
  await rejects("payloadHash recibido se compara con el cálculo canónico del servidor", "CRM_PIPELINE_PAYLOAD_HASH_INVALID", () => createCrmPipelineCase(context(tenant1.id, admin.id), invalidHash, prisma));

  await rejects("rol A baseline no recibe create automáticamente", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => createCrmPipelineCase(context(tenant1.id, baseline.id), command("CREATE", fields()), prisma));
  await rejects("actor exige User y Membership coincidentes dentro del Tenant", "CRM_PIPELINE_RESOURCE_NOT_FOUND", () => createCrmPipelineCase(context(tenant1.id, admin.id, users[1].id), command("CREATE", fields()), prisma));
  await rejects("deniedPermissions prevalece en create", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => createCrmPipelineCase(context(tenant1.id, deny.id), command("CREATE", fields()), prisma));
  await rejects("Client cross-tenant produce 404", "CRM_PIPELINE_RESOURCE_NOT_FOUND", () => createCrmPipelineCase(context(tenant1.id, admin.id), command("CREATE", fields({ clientRef: crossTenantClient.publicRef })), prisma));

  const adminRequest = `create-${randomUUID()}`;
  const adminCommand = command("CREATE", fields({ clientRef: client1.publicRef }), adminRequest);
  const createdA = await createCrmPipelineCase(context(tenant1.id, admin.id), adminCommand, prisma);
  check("A crea NEW_INBOX sin owner", createdA.case.status === "NEW_INBOX" && createdA.case.version === 1 && (await prisma.pipelineCase.findFirst({ where: { publicRef: createdA.case.caseRef } })).ownerMembershipId === null);
  const tenantScopedCode = await prisma.pipelineCase.create({ data: {
    id: "crm04a-tenant2-same-code", tenantId: tenant2.id, caseCode: createdA.case.caseCode, clientName: null,
    mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "Sin asignar",
    originLocation: "Synthetic origin", destinationLocation: "Synthetic destination",
  } });
  check("caseCode queda restringido tenant-first", tenantScopedCode.caseCode === createdA.case.caseCode);
  const replayA = await createCrmPipelineCase(context(tenant1.id, admin.id), adminCommand, prisma);
  check("create idempotente devuelve mismo caso", replayA.replayed === true && replayA.case.caseRef === createdA.case.caseRef);
  await rejects("requestId con payload distinto entra en conflicto", "CRM_PIPELINE_IDEMPOTENCY_CONFLICT", () => createCrmPipelineCase(context(tenant1.id, admin.id), command("CREATE", fields({ serviceType: "OTHER" }), adminRequest), prisma));

  const concurrentIdempotencyRequest = `create-concurrent-${randomUUID()}`;
  const concurrentIdempotencyCommand = command("CREATE", fields(), concurrentIdempotencyRequest);
  const duplicateSubmissions = await Promise.allSettled([
    createCrmPipelineCase(context(tenant1.id, admin.id), concurrentIdempotencyCommand, prisma),
    createCrmPipelineCase(context(tenant1.id, admin.id), concurrentIdempotencyCommand, prisma),
  ]);
  check("doble envío concurrente admite un resultado o replay y nunca dos escrituras", duplicateSubmissions.some((item) => item.status === "fulfilled")
    && duplicateSubmissions.filter((item) => item.status === "rejected").every((item) => item.reason?.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS"));
  const duplicateReplay = await createCrmPipelineCase(context(tenant1.id, admin.id), concurrentIdempotencyCommand, prisma);
  const duplicateCase = await prisma.pipelineCase.findFirstOrThrow({ where: { tenantId: tenant1.id, publicRef: duplicateReplay.case.caseRef } });
  check("mismo request/payload conserva un caso, comando y auditoría", duplicateReplay.replayed === true
    && await prisma.pipelineCase.count({ where: { id: duplicateCase.id } }) === 1
    && await prisma.pipelineCaseCommand.count({ where: { tenantId: tenant1.id, requestId: concurrentIdempotencyRequest } }) === 1
    && await prisma.commercialAuditLog.count({ where: { tenant_id: tenant1.id, request_id: concurrentIdempotencyRequest } }) === 1);

  const concurrentCreateCommands = Array.from({ length: 12 }, (_, index) => command("CREATE", fields({ serviceType: `CONCURRENT-${index}` }), `create-race-${randomUUID()}`));
  const concurrentCreates = await Promise.all(concurrentCreateCommands.map((item) => createCrmPipelineCase(context(tenant1.id, admin.id), item, prisma)));
  check("creaciones concurrentes generan caseCode únicos tenant-first", new Set(concurrentCreates.map((item) => item.case.caseCode)).size === concurrentCreates.length
    && new Set(concurrentCreates.map((item) => item.case.caseRef)).size === concurrentCreates.length
    && await prisma.pipelineCaseCommand.count({ where: { tenantId: tenant1.id, requestId: { in: concurrentCreateCommands.map((item) => item.requestId) } } }) === concurrentCreates.length);

  const createdV = await createCrmPipelineCase(context(tenant1.id, sales1.id), command("CREATE", fields()), prisma);
  const owned = await prisma.pipelineCase.findFirstOrThrow({ where: { publicRef: createdV.case.caseRef } });
  check("V crea con autoasignación completa", owned.ownerMembershipId === sales1.id && owned.ownerUserId === users[1].id);
  const updatedV = await updateCrmPipelineCase(context(tenant1.id, sales1.id), createdV.case.caseRef, command("UPDATE", fields({ destinationLocation: "Synthetic destination updated" }), undefined, 1), prisma);
  check("V actualiza caso propio y aumenta versión", updatedV.case.version === 2 && updatedV.case.destinationLocation.endsWith("updated"));
  await rejects("V no actualiza caso sin owner", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => updateCrmPipelineCase(context(tenant1.id, sales1.id), createdA.case.caseRef, command("UPDATE", fields(), undefined, 1), prisma));
  await rejects("V no actualiza caso ajeno", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => updateCrmPipelineCase(context(tenant1.id, sales2.id), createdV.case.caseRef, command("UPDATE", fields(), undefined, 2), prisma));
  await rejects("deny no actualiza aun siendo owner lógico", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () => updateCrmPipelineCase(context(tenant1.id, deny.id), createdV.case.caseRef, command("UPDATE", fields(), undefined, 2), prisma));
  await rejects("CUID o ID interno se rechaza como ruta", "CRM_PIPELINE_RESOURCE_NOT_FOUND", () => updateCrmPipelineCase(context(tenant1.id, admin.id), owned.id, command("UPDATE", fields(), undefined, 2), prisma));
  await rejects("expectedVersion obsoleto produce 409 estable", "CRM_PIPELINE_VERSION_CONFLICT", () => updateCrmPipelineCase(context(tenant1.id, admin.id), createdV.case.caseRef, command("UPDATE", fields(), undefined, 1), prisma));

  const currentA = await findCrmPipelineCase(prisma, { tenantId: tenant1.id, role: "A", membershipId: admin.id, userId: users[0].id, caseRef: createdA.case.caseRef });
  const updateA = await updateCrmPipelineCase(context(tenant1.id, admin.id), createdA.case.caseRef, command("UPDATE", fields({ clientRef: null, mode: "EXPORT" }), undefined, currentA.version), prisma);
  check("A actualiza cualquier caso del tenant", updateA.case.mode === "EXPORT" && updateA.case.client === null);
  const concurrentVersion = updateA.case.version;
  const race = await Promise.allSettled([
    updateCrmPipelineCase(context(tenant1.id, admin.id), createdA.case.caseRef, command("UPDATE", fields({ mode: "IMPORT" }), undefined, concurrentVersion), prisma),
    updateCrmPipelineCase(context(tenant1.id, admin.id), createdA.case.caseRef, command("UPDATE", fields({ mode: "LOCAL" }), undefined, concurrentVersion), prisma),
  ]);
  const raceFailures = race.filter((item) => item.status === "rejected").map((item) => item.reason?.code);
  check("concurrencia optimista admite exactamente un ganador", race.filter((item) => item.status === "fulfilled").length === 1
    && raceFailures.length === 1 && ["CRM_PIPELINE_VERSION_CONFLICT", "CRM_PIPELINE_COMMAND_IN_PROGRESS"].includes(raceFailures[0]), { raceFailures });

  const beforeReads = { commands: await prisma.pipelineCaseCommand.count(), audits: await prisma.commercialAuditLog.count() };
  const expectedTenantCaseCount = await prisma.pipelineCase.count({ where: { tenantId: tenant1.id } });
  const list = await listCrmPipelineCases(prisma, { tenantId: tenant1.id, role: "A", membershipId: admin.id, userId: users[0].id, filters: parsePipelineListQuery({ page: "1", pageSize: "20" }) });
  await findCrmPipelineCase(prisma, { tenantId: tenant1.id, role: "A", membershipId: admin.id, userId: users[0].id, caseRef: createdA.case.caseRef });
  const afterReads = { commands: await prisma.pipelineCaseCommand.count(), audits: await prisma.commercialAuditLog.count() };
  check("GET/list/detail no generan escrituras", JSON.stringify(beforeReads) === JSON.stringify(afterReads) && list.total === expectedTenantCaseCount);
  const journals = await prisma.pipelineCaseCommand.groupBy({ by: ["commandType"], _count: true });
  check("journal CREATE/UPDATE persistido", journals.some((row) => row.commandType === "CREATE" && row._count >= 2) && journals.some((row) => row.commandType === "UPDATE" && row._count >= 3));
  check("auditoría append-only acompaña cada comando", await prisma.commercialAuditLog.count() === await prisma.pipelineCaseCommand.count());

  const explain = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT "id" FROM "osi"."osi_pipeline_cases" WHERE "tenant_id"=$1 AND "public_ref"=$2::uuid`, tenant1.id, createdA.case.caseRef);
  const executionMs = Number(explain[0]["QUERY PLAN"][0]["Execution Time"]);
  check("lookup tenant-first usa latencia local acotada", executionMs < 50, { executionMs });
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, executionMs, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: { name: error.name, code: error.code || "CRM04A_TEST_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
