import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";
import { runInitialAdminPermissionsBootstrap } from "./v17-admin-initial-permissions-bootstrap.mjs";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const root = await mkdtemp(join(tmpdir(), "v17-admin-bootstrap-test-"));
const results = [];
function check(name, value) { results.push({ name, passed: Boolean(value) }); if (!value) throw new Error(name); }
async function expectCode(name, fn, code) { let error; try { await fn(); } catch (caught) { error = caught; } check(name, error?.message === code); }

try {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `BOOT-${suffix}`.toUpperCase(), name: `Bootstrap ${suffix}` } });
  const user = await prisma.user.create({ data: { id: randomUUID(), code: `BOOT-U-${suffix}`.toUpperCase(), name: "Administradora inicial", email: `${suffix}@example.invalid`, normalizedEmail: `${suffix}@example.invalid`, phone: "", role: "A", status: "active", joinDate: "2026-08-27", passwordHash: await bcrypt.hash("Bootstrap-Synthetic-1!", 10) } });
  const membership = await prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId: tenant.id, userId: user.id, role: "A", status: "ACTIVE", grantedPermissions: ["pipeline:view"], deniedPermissions: [], isDefault: true, authorizationVersion: 7 } });
  const sessionId = randomUUID();
  await prisma.authSession.create({ data: { id: sessionId, tenantId: tenant.id, membershipId: membership.id, userId: user.id, authorizationVersionSnapshot: 7, fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  await prisma.authRefreshToken.create({ data: { id: randomUUID(), tenantId: tenant.id, sessionId, version: 1, tokenHash: createHash("sha256").update(suffix).digest("hex"), fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  const manifestFile = join(root, "manifest.json");
  const authorizationFile = join(root, "authorization.json");
  const command = { apply: false, tenantCode: tenant.code, membershipRef: membership.publicRef, expectedVersion: 7, expectedBranchId: "local-admin-bootstrap", manifestFile, authorizationFile: null };
  const dry = await runInitialAdminPermissionsBootstrap({ prisma, command, env: { V17_ADMIN_INITIAL_PERMISSIONS_LOCAL_BRANCH_ID: "local-admin-bootstrap" } });
  const afterDry = await prisma.tenantMembership.findUnique({ where: { id: membership.id } });
  check("dry-run is read-only", dry.mode === "DRY_RUN" && dry.wouldUpdate && afterDry.authorizationVersion === 7 && afterDry.grantedPermissions.length === 1);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  check("manifest is canonical and scoped", manifest.manifestHash === dry.manifestHash && manifest.membershipRef === membership.publicRef && manifest.before.role === "A" && manifest.after.grantedPermissions.length === ADMIN_MEMBERSHIP_PERMISSIONS.length + 1);
  await writeFile(authorizationFile, `${JSON.stringify({ batch: manifest.batch, executionAuthorized: true, tenantCode: tenant.code, membershipRef: membership.publicRef, expectedVersion: 7, expectedBranchId: "local-admin-bootstrap", manifestHash: "0".repeat(64), authorizationId: randomUUID(), targetEnvironment: "REHEARSAL", expiresAt: new Date(Date.now() + 60_000).toISOString() })}\n`, "utf8");
  const applyCommand = { ...command, apply: true, authorizationFile };
  await expectCode("incorrect receipt blocked", () => runInitialAdminPermissionsBootstrap({ prisma, command: applyCommand, env: { V17_ADMIN_INITIAL_PERMISSIONS_LOCAL_BRANCH_ID: "local-admin-bootstrap", V17_ADMIN_INITIAL_PERMISSIONS_CONFIRM: "APPLY_AUTHORIZED_INITIAL_PERMISSIONS" } }), "AUTHORIZATION_RECEIPT_INVALID");
  const authorizationId = randomUUID();
  await writeFile(authorizationFile, `${JSON.stringify({ batch: manifest.batch, executionAuthorized: true, tenantCode: tenant.code, membershipRef: membership.publicRef, expectedVersion: 7, expectedBranchId: "local-admin-bootstrap", manifestHash: manifest.manifestHash, authorizationId, targetEnvironment: "REHEARSAL", expiresAt: new Date(Date.now() + 60_000).toISOString() })}\n`, "utf8");
  const env = { V17_ADMIN_INITIAL_PERMISSIONS_LOCAL_BRANCH_ID: "local-admin-bootstrap", V17_ADMIN_INITIAL_PERMISSIONS_CONFIRM: "APPLY_AUTHORIZED_INITIAL_PERMISSIONS" };
  const applied = await runInitialAdminPermissionsBootstrap({ prisma, command: applyCommand, env });
  const afterApply = await prisma.tenantMembership.findUnique({ where: { id: membership.id } });
  check("apply grants only four admin permissions", applied.updated && afterApply.authorizationVersion === 8 && afterApply.role === "A" && ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => afterApply.grantedPermissions.includes(permission)));
  check("sessions and refresh revoked", (await prisma.authSession.findUnique({ where: { id: sessionId } }))?.status === "REVOKED" && (await prisma.authRefreshToken.findFirst({ where: { sessionId } }))?.status === "REVOKED");
  check("audit exactly one", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: authorizationId, action: "MEMBERSHIP_INITIAL_ADMIN_PERMISSIONS_GRANTED" } }) === 1);
  const repeated = await runInitialAdminPermissionsBootstrap({ prisma, command: applyCommand, env });
  check("apply retry is idempotent", repeated.idempotent && !repeated.updated && await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: authorizationId } }) === 1);
  check("email password role and tenant untouched", (await prisma.user.findUnique({ where: { id: user.id } }))?.email === `${suffix}@example.invalid` && afterApply.tenantId === tenant.id && afterApply.userId === user.id);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
}
