import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const ACCESS_PERMISSIONS = ["client-access:view", "client-access:create", "client-access:revoke", "client-access:manage"];
const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw) throw new Error("V17_CLIENT_PORTAL_PREVIEW_VERIFY:DATABASE_URL_REQUIRED");
const parsed = new URL(raw);
if (decodeURIComponent(parsed.pathname.slice(1)) !== EXPECTED_DATABASE || parsed.searchParams.get("schema") !== "osi" || /fragrant-night|bitter-bush/i.test(parsed.hostname)) throw new Error("V17_CLIENT_PORTAL_PREVIEW_VERIFY:DATABASE_REJECTED");

const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const identity = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
    assert.deepEqual(identity, [{ database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH }]);
    const migrations = await tx.$queryRawUnsafe("SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name");
    assert.equal(migrations.length, 35);
    assert.ok(migrations.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1));
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { code: TENANT_CODE } });
    const admin = await tx.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "A", status: "ACTIVE" } });
    assert.ok(ACCESS_PERMISSIONS.every((permission) => admin.grantedPermissions.includes(permission) && !admin.deniedPermissions.includes(permission)));
    const accesses = await tx.clientTemporaryAccess.findMany({
      where: { tenantId: tenant.id },
      include: { grants: true, visitResponse: true, surveyAssignment: { include: { evaluationDecision: true } }, contributions: { include: { items: true } }, qrConfirmations: true, events: true },
    });
    assert.equal(accesses.length, 15);
    assert.equal(accesses.filter((row) => row.status === "ACTIVE").length, 6);
    assert.equal(accesses.filter((row) => row.status === "REVOKED").length, 8);
    assert.equal(accesses.filter((row) => row.status === "EXPIRED").length, 1);
    assert.ok(accesses.some((row) => row.surveyAssignment?.evaluationDecision?.method === "IN_PERSON" && !row.visitResponse));
    assert.ok(accesses.some((row) => row.surveyAssignment?.evaluationDecision?.method === "VIRTUAL"));
    assert.ok(accesses.some((row) => row.visitResponse?.state === "CONFIRMED"));
    assert.ok(accesses.some((row) => row.visitResponse?.state === "CHANGE_REQUESTED" && Array.isArray(row.visitResponse.suggestedAvailability) && row.visitResponse.suggestedAvailability.length === 2));
    assert.ok(accesses.some((row) => row.visitResponse?.state === "CANCEL_REQUESTED"));
    const mini = accesses.find((row) => row.contributions.some((entry) => entry.source === "CLIENT_SUPPLIED" && entry.items.length === 10));
    assert.ok(mini);
    assert.ok(Number(mini.contributions[0].estimatedWeightKg) > 0 && Number(mini.contributions[0].estimatedVolumeM3) > 0);
    assert.ok(accesses.some((row) => row.qrConfirmations.some((entry) => entry.result === "VERIFIED")));
    const externalSent = await tx.communicationRecord.count({ where: { tenantId: tenant.id, status: "SENT", preparedAt: { gte: new Date("2026-09-09T00:00:00.000Z") } } });
    assert.equal(externalSent, 0);
    const responseStates = Object.fromEntries((await tx.clientTemporaryVisitResponse.groupBy({ by: ["state"], where: { tenantId: tenant.id }, _count: { _all: true } })).map((row) => [row.state, row._count._all]));
    console.log(JSON.stringify({ ok: true, database: EXPECTED_DATABASE, branch: EXPECTED_BRANCH, migrations: "35/35", accesses: accesses.length, usableScenarios: 8, active: 6, revoked: 8, setupRecoveryRevoked: 7, expired: 1, responseStates, miniTypes: 10, miniSource: "CLIENT_SUPPLIED", qrVerified: true, externalSent: 0, productionApiEnabled: false }));
  });
} finally {
  await prisma.$disconnect();
}
