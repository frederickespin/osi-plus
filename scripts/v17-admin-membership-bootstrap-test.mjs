import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";
import { runAdminMembershipBootstrap } from "./v17-admin-membership-bootstrap.mjs";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const suffix = randomUUID().slice(0, 8);
const directory = await mkdtemp(join(tmpdir(), "v17-admin-bootstrap-"));
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

async function createUser(label, email, passwordHash) {
  return prisma.user.create({ data: {
    id: randomUUID(), code: `BOOT-${suffix}-${label}`.toUpperCase(), name: `Persona ${label}`,
    email, phone: "0000000000", role: "A", status: "active", department: "QA",
    joinDate: "2026-08-27", passwordHash,
  } });
}

try {
  const tenantCode = `BOOT-${suffix}`.toUpperCase();
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: tenantCode, name: `Bootstrap ${suffix}` } });
  const actorUser = await createUser("actor", `${suffix}-actor@example.invalid`, await bcrypt.hash("synthetic-actor-password", 10));
  const targetEmail = `${suffix}-target@example.invalid`;
  const targetUser = await createUser("target", targetEmail, await bcrypt.hash("synthetic-target-password", 10));
  const actor = await prisma.tenantMembership.create({ data: {
    id: randomUUID(), tenantId: tenant.id, userId: actorUser.id, role: "A", status: "ACTIVE",
    grantedPermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [], isDefault: true,
  } });
  const baseCommand = { apply: false, tenantCode, expectedBranchId: "local-admin-bootstrap", actorMembershipRef: actor.publicRef, authorizationFile: null };
  const env = { V17_ADMIN_BOOTSTRAP_TARGET_EMAIL: targetEmail, V17_ADMIN_BOOTSTRAP_LOCAL_BRANCH_ID: "local-admin-bootstrap" };
  const before = await prisma.tenantMembership.count({ where: { tenantId: tenant.id, userId: targetUser.id } });
  const dryRun = await runAdminMembershipBootstrap({ prisma, command: baseCommand, env });
  const afterDryRun = await prisma.tenantMembership.count({ where: { tenantId: tenant.id, userId: targetUser.id } });
  check("dry-run es el modo predeterminado y no escribe", dryRun.mode === "DRY_RUN" && dryRun.wouldCreate && before === 0 && afterDryRun === 0);

  const targetEmailHash = createHash("sha256").update(targetEmail).digest("hex");
  const authorizationId = `bootstrap-auth-${suffix}`;
  const authorizationFile = join(directory, "authorization.json");
  await writeFile(authorizationFile, JSON.stringify({
    batch: "V17-ADMIN-TENANT-FIRST-04E1A", executionAuthorized: true, tenantCode,
    expectedBranchId: "local-admin-bootstrap", actorMembershipRef: actor.publicRef, targetEmailHash,
    targetEnvironment: "REHEARSAL", expiresAt: new Date(Date.now() + 60_000).toISOString(), authorizationId,
  }), { encoding: "utf8", mode: 0o600 });
  const applyCommand = { ...baseCommand, apply: true, authorizationFile };
  const applyEnv = { ...env, V17_ADMIN_BOOTSTRAP_CONFIRM: "APPLY_AUTHORIZED_MEMBERSHIP" };
  const applied = await runAdminMembershipBootstrap({ prisma, command: applyCommand, env: applyEnv });
  check("apply crea exclusivamente Membership A autorizada", applied.created && applied.auditWritten
    && await prisma.tenantMembership.count({ where: { tenantId: tenant.id, userId: targetUser.id, role: "A", status: "ACTIVE" } }) === 1);
  const repeated = await runAdminMembershipBootstrap({ prisma, command: applyCommand, env: applyEnv });
  check("repetición exacta es idempotente", repeated.idempotent && !repeated.created
    && await prisma.tenantMembership.count({ where: { tenantId: tenant.id, userId: targetUser.id } }) === 1
    && await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: authorizationId } }) === 1);

  const unauthenticable = await createUser("blocked", `${suffix}-blocked@example.invalid`, "!NOT-A-LOGIN-HASH!");
  await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant.id, userId: targetUser.id } });
  const blockedEnv = { ...env, V17_ADMIN_BOOTSTRAP_TARGET_EMAIL: unauthenticable.email };
  let blocked = false;
  try { await runAdminMembershipBootstrap({ prisma, command: baseCommand, env: blockedEnv }); } catch (error) { blocked = error?.message === "TARGET_USER_NOT_AUTHENTICABLE_OR_UNIQUE"; }
  check("User no autenticable se rechaza", blocked);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
