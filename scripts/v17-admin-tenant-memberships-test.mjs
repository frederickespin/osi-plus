import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { effectivePermissionsFor, permsForRole } from "../api/_lib/rbac.js";
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

  const coordinatorUser = await user("coordinator", "K");
  const coordinator = await membership(tenant.id, coordinatorUser.id, "K", ["pipeline:view", "legacy:retained"]);
  await prisma.tenantMembership.update({ where: { id: coordinator.id }, data: { deniedPermissions: ["legacy:blocked", "osi:view"] } });
  const coordinators = await listTenantMemberships(prisma, context, { role: "K" });
  check("filtro admite rol K con DTO público", coordinators.total === 1 && coordinators.data[0].role === "K" && coordinators.data[0].membershipRef === coordinator.publicRef);
  let operational = await updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `role-pc-${suffix}`, expectedVersion: 1, role: "PC" });
  check("rol operativo PC se guarda y conserva permisos históricos", operational.role === "PC" && operational.authorizationVersion === 2
    && operational.grantedPermissions.includes("legacy:retained") && operational.deniedPermissions.includes("legacy:blocked"));
  await expectCode("rol fuera del enum rechazado", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `role-invalid-${suffix}`, expectedVersion: 2, role: "RB" }), "ADMIN_MEMBERSHIP_INPUT_INVALID");
  await expectCode("grant desconocido nuevo rechazado", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `unknown-${suffix}`, expectedVersion: 2, grantedPermissions: [...operational.grantedPermissions, "unknown:new"] }), "ADMIN_MEMBERSHIP_PERMISSION_UNKNOWN");
  await expectCode("deny desconocido nuevo rechazado", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `unknown-deny-${suffix}`, expectedVersion: 2, deniedPermissions: [...operational.deniedPermissions, "unknown:new"] }), "ADMIN_MEMBERSHIP_PERMISSION_UNKNOWN");
  await expectCode("desconocido no cambia de deny a grant", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `move-unknown-${suffix}`, expectedVersion: 2, grantedPermissions: [...operational.grantedPermissions, "legacy:blocked"], deniedPermissions: [] }), "ADMIN_MEMBERSHIP_PERMISSION_UNKNOWN");
  await expectCode("array de permisos exige strings", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `object-permission-${suffix}`, expectedVersion: 2, grantedPermissions: [{}] }), "ADMIN_MEMBERSHIP_INPUT_INVALID");
  await expectCode("intersección nueva grant/deny rechazada", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `new-overlap-${suffix}`, expectedVersion: 2, deniedPermissions: [...operational.deniedPermissions, "pipeline:view"] }), "ADMIN_MEMBERSHIP_INPUT_INVALID");
  const permissionsUpdated = await updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `known-with-legacy-${suffix}`, expectedVersion: 2, grantedPermissions: [...operational.grantedPermissions, "logistics:plan:view"] });
  check("editar permiso conocido conserva desconocidos existentes", permissionsUpdated.authorizationVersion === 3
    && permissionsUpdated.grantedPermissions.includes("logistics:plan:view") && permissionsUpdated.grantedPermissions.includes("legacy:retained")
    && permissionsUpdated.deniedPermissions.includes("legacy:blocked"));
  operational = permissionsUpdated;

  const partialUser = await user("partial-admin");
  const partial = await membership(tenant.id, partialUser.id, "A", ["membership:view", "membership:update:status"]);
  const partialContext = { ...context, membershipId: partial.id, userId: partialUser.id, effectivePermissions: ["membership:view", "membership:update:status"], permissions: ["membership:view", "membership:update:status"] };
  operational = await updateTenantMembership(prisma, partialContext, coordinator.publicRef, { requestId: `partial-status-${suffix}`, expectedVersion: operational.authorizationVersion, status: "SUSPENDED" });
  check("administrador parcial cambia sólo estado", operational.status === "SUSPENDED" && operational.role === "PC"
    && operational.grantedPermissions.includes("legacy:retained") && operational.deniedPermissions.includes("legacy:blocked"));
  check("cambiar estado conserva denegación sobre permiso heredado", permsForRole(operational.role).includes("osi:view")
    && operational.deniedPermissions.includes("osi:view") && !effectivePermissionsFor(operational.role, operational.grantedPermissions, operational.deniedPermissions).includes("osi:view"));
  await expectCode("administrador parcial no cambia rol", () => updateTenantMembership(prisma, partialContext, coordinator.publicRef, { requestId: `partial-role-${suffix}`, expectedVersion: operational.authorizationVersion, role: "K" }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await expectCode("PATCH exige consulta además de mutación", () => updateTenantMembership(prisma, { ...partialContext, effectivePermissions: ["membership:update:status"], permissions: ["membership:update:status"] }, coordinator.publicRef, { requestId: `no-read-${suffix}`, expectedVersion: operational.authorizationVersion, status: "ACTIVE" }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: partial.id }, data: { grantedPermissions: ["membership:update:status"] } });
  await expectCode("PATCH revalida lectura revocada del actor", () => updateTenantMembership(prisma, partialContext, coordinator.publicRef, { requestId: `revoked-read-${suffix}`, expectedVersion: operational.authorizationVersion, status: "ACTIVE" }), "ADMIN_MEMBERSHIP_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: partial.id }, data: { grantedPermissions: ["membership:view", "membership:update:status"] } });
  operational = await updateTenantMembership(prisma, partialContext, coordinator.publicRef, { requestId: `partial-reactivate-${suffix}`, expectedVersion: operational.authorizationVersion, status: "ACTIVE" });

  const noopSession = await prisma.authSession.create({ data: { id: randomUUID(), tenantId: tenant.id, membershipId: coordinator.id, userId: coordinatorUser.id, authorizationVersionSnapshot: operational.authorizationVersion, currentRefreshVersion: 0, fingerprintHash: "b".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  await prisma.authRefreshToken.create({ data: { id: randomUUID(), tenantId: tenant.id, sessionId: noopSession.id, version: 0, tokenHash: Buffer.from(`admin-noop-${suffix}`).toString("hex").padEnd(64, "0").slice(0, 64), fingerprintHash: "b".repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } });
  const noopRequestId = `noop-${suffix}`;
  const noop = await updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: noopRequestId, expectedVersion: operational.authorizationVersion, grantedPermissions: [...operational.grantedPermissions].reverse(), deniedPermissions: [...operational.deniedPermissions] });
  check("no-op conserva versión y fecha", noop.authorizationVersion === operational.authorizationVersion && noop.updatedAt === operational.updatedAt);
  check("no-op conserva denegación sobre permiso heredado", permsForRole(noop.role).includes("osi:view") && noop.deniedPermissions.includes("osi:view")
    && !effectivePermissionsFor(noop.role, noop.grantedPermissions, noop.deniedPermissions).includes("osi:view"));
  check("no-op conserva sesión y refresh activos", (await prisma.authSession.findUnique({ where: { id: noopSession.id } }))?.status === "ACTIVE"
    && (await prisma.authRefreshToken.findFirst({ where: { sessionId: noopSession.id } }))?.status === "ACTIVE");
  check("no-op no inventa auditoría", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, request_id: noopRequestId } }) === 0);
  const legacyRemoved = await updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `remove-legacy-${suffix}`, expectedVersion: operational.authorizationVersion, grantedPermissions: ["pipeline:view", "logistics:plan:view"], deniedPermissions: [] });
  check("puede retirar permisos históricos desconocidos", !legacyRemoved.grantedPermissions.includes("legacy:retained") && legacyRemoved.deniedPermissions.length === 0);
  const rollbackVersion = legacyRemoved.authorizationVersion;
  await expectFailure("fallo de auditoría revierte cambio", () => updateTenantMembership(prisma, context, coordinator.publicRef, { requestId: `audit-failure-${suffix}`, expectedVersion: rollbackVersion, status: "SUSPENDED" }, { auditWriter: async () => { throw new Error("synthetic audit failure"); } }));
  const afterFailedAudit = await getTenantMembership(prisma, context, coordinator.publicRef);
  check("estado y versión conservados tras rollback de auditoría", afterFailedAudit.status === "ACTIVE" && afterFailedAudit.authorizationVersion === rollbackVersion);

  await expectFailure("publicRef inmutable", () => prisma.tenantMembership.update({ where: { id: seller.id }, data: { publicRef: randomUUID() } }));
  const failed = results.filter((item) => !item.passed);
  process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, assertions: results.length, failed: failed.length, results }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
