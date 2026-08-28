import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  ADMIN_MEMBERSHIP_PERMISSIONS,
  AdminMembershipError,
  getTenantMembership,
  listTenantMemberships,
  updateTenantMembership,
} from "../api/_lib/adminMembershipDomain.js";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const suffix = randomUUID().slice(0, 8);
const results = [];
function check(name, condition, detail) { results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) }); if (!condition) throw new Error(name); }
async function expectCode(name, fn, code) { try { await fn(); check(name, false, "no error"); } catch (error) { check(name, error?.code === code, `expected ${code}; received ${error?.code || error?.message}`); } }
async function expectFailure(name, fn) { try { await fn(); check(name, false, "no error"); } catch { check(name, true); } }

async function user(label, role = "A") {
  return prisma.user.create({ data: { id: randomUUID(), code: `ADM-${suffix}-${label}`.toUpperCase(), name: `Persona ${label}`, email: `${suffix}-${label}@example.invalid`, phone: "0000000000", role, status: "active", department: "QA", joinDate: "2026-08-26", passwordHash: "synthetic-not-login" } });
}

async function membership(tenantId, userId, role, grants = [], isDefault = true) {
  return prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId, userId, role, status: "ACTIVE", grantedPermissions: grants, deniedPermissions: [], isDefault } });
}

try {
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `ADM-${suffix}`.toUpperCase(), name: `Admin tenant ${suffix}` } });
  const foreignTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `ADM-X-${suffix}`.toUpperCase(), name: `Foreign ${suffix}` } });
  const [actorUser, adminTwoUser, adminThreeUser, sellerUser, foreignUser] = await Promise.all([user("actor"), user("admin2"), user("admin3"), user("seller", "V"), user("foreign")]);
  const actorMembership = await membership(tenant.id, actorUser.id, "A", [...ADMIN_MEMBERSHIP_PERMISSIONS]);
  const adminTwo = await membership(tenant.id, adminTwoUser.id, "A", [...ADMIN_MEMBERSHIP_PERMISSIONS]);
  const seller = await membership(tenant.id, sellerUser.id, "V", ["pipeline:view"]);
  const foreign = await membership(foreignTenant.id, foreignUser.id, "A", [...ADMIN_MEMBERSHIP_PERMISSIONS]);
  const context = { tenantId: tenant.id, membershipId: actorMembership.id, userId: actorUser.id, role: "A", effectivePermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], permissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [] };

  const listed = await listTenantMemberships(prisma, context, { page: 1, pageSize: 20 });
  check("lista sólo tenant", listed.total === 3 && listed.data.every((row) => !Object.hasOwn(row, "id") && !Object.hasOwn(row, "tenantId") && !Object.hasOwn(row, "userId")));
  check("publicRef UUID v4 único", new Set(listed.data.map((row) => row.membershipRef)).size === 3 && listed.data.every((row) => /^[0-9a-f-]{36}$/.test(row.membershipRef)));
  const detail = await getTenantMembership(prisma, context, seller.publicRef);
  check("detalle tenant/publicRef", detail.membershipRef === seller.publicRef && detail.role === "V");
  await expectCode("cross-tenant 404", () => getTenantMembership(prisma, context, foreign.publicRef), "ADMIN_MEMBERSHIP_NOT_FOUND");

  const session = await prisma.authSession.create({ data: { id: randomUUID(), tenantId: tenant.id, membershipId: seller.id, userId: sellerUser.id, authorizationVersionSnapshot: 1, currentRefreshVersion: 0, fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  const tokenHash = Buffer.from(`admin-refresh-${suffix}`).toString("hex").padEnd(64, "0").slice(0, 64);
  await prisma.authRefreshToken.create({ data: { id: randomUUID(), tenantId: tenant.id, sessionId: session.id, version: 0, tokenHash, fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  const requestId = `admin-update-${suffix}`;
  const updated = await updateTenantMembership(prisma, context, seller.publicRef, { requestId, expectedVersion: 1, grantedPermissions: ["pipeline:view", "pipeline:create"], deniedPermissions: ["pipeline:update:any"] });
  check("actualización atómica incrementa versión", updated.authorizationVersion === 2 && updated.grantedPermissions.includes("pipeline:create") && updated.deniedPermissions.includes("pipeline:update:any"));
  check("sesión y refresh revocados", (await prisma.authSession.findUnique({ where: { id: session.id } }))?.status === "REVOKED" && (await prisma.authRefreshToken.findFirst({ where: { sessionId: session.id } }))?.status === "REVOKED");
  check("auditoría 1:1", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: requestId, action: "MEMBERSHIP_AUTHORIZATION_CHANGED" } }) === 1);
  await expectCode("versión obsoleta 409", () => updateTenantMembership(prisma, context, seller.publicRef, { requestId: `stale-${suffix}`, expectedVersion: 1, status: "SUSPENDED" }), "ADMIN_MEMBERSHIP_VERSION_CONFLICT");
  await expectCode("deny prevalece", () => listTenantMemberships(prisma, { ...context, deniedPermissions: ["membership:view"], effectivePermissions: [] }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { grantedPermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS] } });
  const sellerContext = { tenantId: tenant.id, membershipId: seller.id, userId: sellerUser.id, role: "V", effectivePermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], permissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [] };
  await expectCode("V no accede aunque reciba grants administrativos", () => listTenantMemberships(prisma, sellerContext), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await expectCode("dos A no bajan a uno", () => updateTenantMembership(prisma, context, adminTwo.publicRef, { requestId: `continuity-${suffix}`, expectedVersion: 1, status: "SUSPENDED" }), "ADMIN_MEMBERSHIP_CONTINUITY_REQUIRED");
  await expectCode("autosuspensión bloqueada", () => updateTenantMembership(prisma, context, actorMembership.publicRef, { requestId: `self-${suffix}`, expectedVersion: 1, status: "SUSPENDED" }), "ADMIN_MEMBERSHIP_SELF_PROTECTION");

  const adminThree = await membership(tenant.id, adminThreeUser.id, "A", [...ADMIN_MEMBERSHIP_PERMISSIONS]);
  const concurrent = await Promise.allSettled([
    updateTenantMembership(prisma, context, adminTwo.publicRef, { requestId: `race-a-${suffix}`, expectedVersion: 1, status: "SUSPENDED" }),
    updateTenantMembership(prisma, context, adminThree.publicRef, { requestId: `race-b-${suffix}`, expectedVersion: 1, status: "SUSPENDED" }),
  ]);
  check("concurrencia conserva dos A", concurrent.filter((item) => item.status === "fulfilled").length === 1 && concurrent.filter((item) => item.status === "rejected" && item.reason?.code === "ADMIN_MEMBERSHIP_CONTINUITY_REQUIRED").length === 1);
  const activeAdmins = await prisma.tenantMembership.count({ where: { tenantId: tenant.id, role: "A", status: "ACTIVE" } });
  check("invariante final A", activeAdmins === 2);

  const soloTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `ADM-S-${suffix}`.toUpperCase(), name: `Solo ${suffix}` } });
  const soloActorUser = await user("solo-actor"); const soloSellerUser = await user("solo-seller", "V");
  const soloActor = await membership(soloTenant.id, soloActorUser.id, "A", [...ADMIN_MEMBERSHIP_PERMISSIONS]);
  const soloSeller = await membership(soloTenant.id, soloSellerUser.id, "V", ["pipeline:view"]);
  const soloContext = { tenantId: soloTenant.id, membershipId: soloActor.id, userId: soloActorUser.id, role: "A", effectivePermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], permissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [] };
  const maintained = await updateTenantMembership(prisma, soloContext, soloSeller.publicRef, { requestId: `maintain-${suffix}`, expectedVersion: 1, grantedPermissions: ["pipeline:view", "pipeline:create"] });
  check("un A permite operación que mantiene conteo", maintained.authorizationVersion === 2);
  const promoted = await updateTenantMembership(prisma, soloContext, soloSeller.publicRef, { requestId: `increase-${suffix}`, expectedVersion: 2, role: "A", grantedPermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS] });
  check("un A permite aumentar a dos", promoted.role === "A" && promoted.authorizationVersion === 3);

  await expectFailure("publicRef inmutable", () => prisma.tenantMembership.update({ where: { id: seller.id }, data: { publicRef: randomUUID() } }));
  const failed = results.filter((item) => !item.passed);
  process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, assertions: results.length, failed: failed.length, results }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
