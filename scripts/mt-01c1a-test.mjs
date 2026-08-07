import { createHash, randomUUID } from "node:crypto";
import {
  applyEmployeeProfileBackfill,
  canonicalEmployeeCode,
  createMt01c1aPrisma,
  dryRunEmployeeProfiles,
  mapLegacyEmployeeProfile,
  normalizeEmployeeCode,
  rollbackEmployeeProfileBackfill,
} from "./mt-01c1a-lib.mjs";

const prisma = createMt01c1aPrisma();
const results = [];
const TEST_TENANT_CODE = "MT01C1A-TEST-A";
const TEST_TENANT_B_CODE = "MT01C1A-TEST-B";

function record(name, passed, details = {}) {
  results.push({ name, passed, ...details });
}

function expect(name, condition, details = {}) {
  record(name, Boolean(condition), details);
  if (!condition) throw new Error(`MT-01C1A_TEST_FAILED: ${name}`);
}

async function expectRejected(name, operation) {
  try {
    await operation();
    record(name, false, { reason: "La base aceptó una operación inválida" });
    throw new Error(`MT-01C1A_TEST_FAILED: ${name}`);
  } catch (error) {
    if (String(error?.message || "").startsWith("MT-01C1A_TEST_FAILED")) throw error;
    record(name, true, { databaseCode: error?.code || "DATABASE_REJECTED" });
  }
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function legacyProfile(overrides = {}) {
  return {
    employmentStatus: "ACTIVO",
    availabilityStatus: "DISPONIBLE",
    contractType: "Planta",
    departmentCode: "Operaciones",
    jobTitle: "Operativo de prueba",
    hiredAt: "2026-01-01",
    ...overrides,
  };
}

async function createUserMembership({ tenantId, code, role = "V", profile = null }) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      code,
      name: `Synthetic ${code}`,
      email: `${code.toLowerCase()}@mt01c1a.test`,
      phone: `000-${code}`,
      role,
      status: "Activo",
      department: "Operaciones",
      joinDate: "2026-01-01",
      passwordHash: "not-a-login-secret",
      employeeProfile: profile,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: membershipId,
      tenantId,
      userId,
      role,
      status: "ACTIVE",
      isDefault: true,
      provisioningSource: "MANUAL",
    },
  });
  return { tenantId, userId, membershipId, code };
}

function profileData(member, overrides = {}) {
  const employeeCode = overrides.employeeCode || canonicalEmployeeCode(member.code);
  return {
    id: randomUUID(),
    tenantId: member.tenantId,
    membershipId: member.membershipId,
    userId: member.userId,
    employeeCode,
    normalizedEmployeeCode: normalizeEmployeeCode(employeeCode),
    employmentStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    provisioningSource: "MANUAL",
    ...overrides,
  };
}

async function businessTableFingerprint() {
  const tables = await prisma.$queryRaw`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'osi'
       AND tablename NOT IN ('_prisma_migrations', 'employee_profiles')
     ORDER BY tablename
  `;
  const counts = [];
  for (const { tablename } of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(tablename)) throw new Error("Nombre de tabla inesperado");
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."${tablename}"`);
    counts.push([tablename, row.count]);
  }
  return digest(counts);
}

try {
  const tenantA = await prisma.tenant.create({
    data: { id: randomUUID(), code: TEST_TENANT_CODE, name: "MT-01C1A Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { id: randomUUID(), code: TEST_TENANT_B_CODE, name: "MT-01C1A Tenant B" },
  });

  const a1 = await createUserMembership({ tenantId: tenantA.id, code: "EMP-A1", role: "A", profile: legacyProfile() });
  const a2 = await createUserMembership({
    tenantId: tenantA.id,
    code: "EMP-A2",
    profile: legacyProfile({ supervisorMembershipId: a1.membershipId, supervisorUserId: a1.userId }),
  });
  const a3 = await createUserMembership({ tenantId: tenantA.id, code: "EMP-A3", profile: legacyProfile({ contractType: "Personal Móvil" }) });
  const a4 = await createUserMembership({ tenantId: tenantA.id, code: "EMP-A4", profile: legacyProfile({ availabilityStatus: "LIMITADA" }) });

  const incomplete = mapLegacyEmployeeProfile({
    id: "m-incomplete", tenantId: tenantA.id, userId: "u-incomplete",
    user: { code: "INC-1", department: "Operaciones", joinDate: "2026-01-01", employeeProfile: { contractType: "Planta" } },
  });
  expect("missing employment and availability stop conversion", incomplete.issues.filter((x) => x.kind === "INCOMPLETE").length === 2);
  const ambiguous = mapLegacyEmployeeProfile({
    id: "m-ambiguous", tenantId: tenantA.id, userId: "u-ambiguous",
    user: { code: "AMB-1", department: "Operaciones", joinDate: "2026-01-01", employeeProfile: legacyProfile({ contractType: "Contrato inventado", departmentCode: "Departamento inventado" }) },
  });
  expect("unknown contract and department are ambiguous", ambiguous.issues.filter((x) => x.kind === "AMBIGUOUS").length === 2);

  const userBefore = digest(await prisma.user.findMany({ orderBy: { id: "asc" } }));
  const membershipBefore = digest(await prisma.tenantMembership.findMany({ orderBy: { id: "asc" } }));
  const businessBefore = await businessTableFingerprint();

  const dryRun = await dryRunEmployeeProfiles(prisma, TEST_TENANT_CODE);
  expect("dry-run classifies all complete fixtures", dryRun.counts.convertible === 4 && dryRun.memberships === 4, { counts: dryRun.counts });
  const first = await applyEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  expect("first backfill creates four profiles", first.created === 4 && first.finalCount === 4, first);
  const second = await applyEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  expect("second backfill is idempotent", second.created === 0 && second.existing === 4 && second.finalCount === 4, second);
  expect("User rows remain unchanged by backfill", digest(await prisma.user.findMany({ orderBy: { id: "asc" } })) === userBefore);
  expect("TenantMembership rows remain unchanged by backfill", digest(await prisma.tenantMembership.findMany({ orderBy: { id: "asc" } })) === membershipBefore);
  expect("all other osi tables remain unchanged by backfill", await businessTableFingerprint() === businessBefore);

  const rollback = await rollbackEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  expect("rollback removes only the four unchanged batch rows", rollback.deleted === 4 && rollback.preservedModified === 0, rollback);
  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => applyEmployeeProfileBackfill(prisma, TEST_TENANT_CODE)),
  );
  expect(
    "twenty concurrent backfills serialize without duplicates or failures",
    concurrent.reduce((sum, row) => sum + row.created, 0) === 4
      && concurrent.every((row) => row.finalCount === 4)
      && await prisma.employeeProfile.count({ where: { tenantId: tenantA.id } }) === 4,
  );
  await rollbackEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  const reapplied = await applyEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  expect("backfill reapplies after rollback", reapplied.created === 4 && reapplied.finalCount === 4, reapplied);

  const retained = await prisma.employeeProfile.findUniqueOrThrow({
    where: { tenantId_membershipId: { tenantId: tenantA.id, membershipId: a1.membershipId } },
  });
  await prisma.employeeProfile.update({ where: { id: retained.id }, data: { jobTitle: "Cambio posterior protegido" } });
  const selectiveRollback = await rollbackEmployeeProfileBackfill(prisma, TEST_TENANT_CODE);
  expect("rollback preserves a batch row modified later", selectiveRollback.deleted === 3 && selectiveRollback.preservedModified === 1, selectiveRollback);
  expect("modified profile remains present", await prisma.employeeProfile.count({ where: { id: retained.id } }) === 1);

  const a5 = await createUserMembership({ tenantId: tenantA.id, code: "EMP-A5" });
  const b1 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B1" });
  const b2 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B2" });
  const b3 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B3" });
  const b4 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B4" });
  const b5 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B5" });
  const b6 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B6" });
  const b7 = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B7" });

  await prisma.employeeProfile.create({ data: profileData(b1, { employeeCode: "EMP-A1", normalizedEmployeeCode: "EMP-A1" }) });
  expect("same employee code is allowed in another tenant", await prisma.employeeProfile.count({ where: { normalizedEmployeeCode: "EMP-A1" } }) === 2);
  await expectRejected("duplicate employee code is rejected inside tenant", () => prisma.employeeProfile.create({
    data: profileData(a5, { employeeCode: "EMP-A1", normalizedEmployeeCode: "EMP-A1" }),
  }));
  await expectRejected("employeeCode itself must be trimmed and uppercase", () => prisma.employeeProfile.create({
    data: profileData(a5, { employeeCode: " emp-a5 ", normalizedEmployeeCode: "EMP-A5" }),
  }));

  await prisma.employeeProfile.create({ data: profileData(b2) });
  await expectRejected("one profile maximum per membership", () => prisma.employeeProfile.create({ data: profileData(b2, { employeeCode: "EMP-B2-ALT" }) }));
  await expectRejected("cross-tenant supervisor is rejected", () => prisma.employeeProfile.create({
    data: profileData(b3, { supervisorMembershipId: a1.membershipId, supervisorUserId: a1.userId }),
  }));
  await expectRejected("self-supervision is rejected", () => prisma.employeeProfile.create({
    data: profileData(b4, { supervisorMembershipId: b4.membershipId, supervisorUserId: b4.userId }),
  }));
  await expectRejected("supervisor pair must be complete", () => prisma.employeeProfile.create({
    data: profileData(b4, { supervisorMembershipId: b2.membershipId }),
  }));
  await expectRejected("invalid contract date order is rejected", () => prisma.employeeProfile.create({
    data: profileData(b5, { contractStartsAt: new Date("2026-06-02"), contractEndsAt: new Date("2026-06-01") }),
  }));
  await expectRejected("TERMINATED requires terminatedAt", () => prisma.employeeProfile.create({
    data: profileData(b6, { employmentStatus: "TERMINATED" }),
  }));
  await expectRejected("active employment cannot carry terminatedAt", () => prisma.employeeProfile.create({
    data: profileData(b6, { terminatedAt: new Date("2026-06-01") }),
  }));
  await expectRejected("employee code normalization is enforced", () => prisma.employeeProfile.create({
    data: profileData(b7, { normalizedEmployeeCode: "wrong" }),
  }));
  await expectRejected("tenant and membership identity are immutable", () => prisma.employeeProfile.update({
    where: { id: retained.id }, data: { membershipId: a5.membershipId, userId: a5.userId },
  }));
  await expectRejected("membership deletion is restricted while profile exists", () => prisma.tenantMembership.delete({
    where: { id: b2.membershipId },
  }));
  await expectRejected("tenant deletion is restricted while profiles exist", () => prisma.tenant.delete({ where: { id: tenantB.id } }));

  const protectedManual = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B8", profile: legacyProfile() });
  const protectedManualRow = await prisma.employeeProfile.create({ data: profileData(protectedManual) });
  const protectedBefore = digest(protectedManualRow);
  const protectedReport = await dryRunEmployeeProfiles(prisma, TEST_TENANT_B_CODE);
  expect("manual profile is classified as protected existing", protectedReport.counts.protected_existing >= 1);
  await expectRejected("incomplete tenant batch remains blocked without touching manual profile", () => applyEmployeeProfileBackfill(prisma, TEST_TENANT_B_CODE));
  expect(
    "manual profile is never adopted or overwritten by backfill",
    digest(await prisma.employeeProfile.findUniqueOrThrow({ where: { id: protectedManualRow.id } })) === protectedBefore,
  );

  const foreignBatchMember = await createUserMembership({ tenantId: tenantB.id, code: "EMP-B9" });
  const foreignBatchRow = await prisma.employeeProfile.create({
    data: profileData(foreignBatchMember, { provisioningSource: "BACKFILL", provisioningBatchId: "OTHER-BATCH" }),
  });
  const foreignRollback = await rollbackEmployeeProfileBackfill(prisma, TEST_TENANT_B_CODE);
  expect("rollback never deletes another provisioning batch", foreignRollback.deleted === 0
    && await prisma.employeeProfile.count({ where: { id: foreignBatchRow.id } }) === 1);

  const passed = results.every((result) => result.passed);
  process.stdout.write(`${JSON.stringify({ ok: passed, assertions: results.length, results }, null, 2)}\n`);
  if (!passed) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
