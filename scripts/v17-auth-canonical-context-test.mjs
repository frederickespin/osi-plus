import assert from "node:assert/strict";
import { signMembershipAccessToken } from "../api/_lib/auth.js";
import { createAuthorizationContext, hasEffectivePermission } from "../api/_lib/authorizationContext.js";
import { resolveAuthContext, resolveLegacyAuthorizationContext } from "../api/_lib/authContext.js";
import { isCanonicalLegacyPassword } from "../api/_lib/passwordPolicy.js";
import { PERMS } from "../api/_lib/rbac.js";

const base = Object.freeze({
  user_id: "user-canonical",
  user_email: "actor@example.invalid",
  user_status: "active",
  tenant_id: "tenant-canonical",
  tenant_code: "TENANT-CANONICAL",
  tenant_status: "ACTIVE",
  membership_id: "membership-canonical",
  membership_public_ref: "11111111-1111-4111-8111-111111111111",
  membership_role: "V",
  membership_status: "ACTIVE",
  authorization_version: 7,
  granted_permissions: ["custom:read", PERMS.CLIENTS_VIEW],
  denied_permissions: [PERMS.CLIENTS_VIEW],
  is_default: true,
});

const results = [];
async function test(name, operation) {
  await operation();
  results.push({ name, passed: true });
}
async function rejects(name, operation, code) {
  await assert.rejects(operation, (error) => error?.code === code);
  results.push({ name, passed: true });
}
function prismaRows(rows) {
  return { $queryRaw: async () => rows.map((row) => ({ ...row })) };
}

await rejects("anonymous falla cerrado", () => resolveAuthContext({ headers: {} }, {
  prisma: prismaRows([]),
  env: { MT01B_AUTH_MODE: "LEGACY" },
}), "MT01B_TOKEN_REQUIRED");

await test("LEGACY produce AuthorizationContext tenant-first", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([base]), { sub: base.user_id, role: "A" });
  assert.equal(context.sessionKind, "LEGACY");
  assert.equal(context.user.id, base.user_id);
  assert.equal(context.membership.id, base.membership_id);
  assert.equal(context.tenant.id, base.tenant_id);
  assert.equal(context.role, "V");
  assert.equal(context.authorizationVersion, 7);
  assert.equal(context.sessionId, null);
});

await test("grant se agrega y deny prevalece sobre baseline y grant", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([base]), { sub: base.user_id, role: "A" });
  assert.equal(hasEffectivePermission(context, "custom:read"), true);
  assert.equal(hasEffectivePermission(context, PERMS.CLIENTS_VIEW), false);
});

await test("baseline de rol permite únicamente permisos registrados", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([{ ...base, granted_permissions: [], denied_permissions: [] }]), { sub: base.user_id });
  assert.equal(hasEffectivePermission(context, PERMS.PIPELINE_VIEW), true);
  assert.equal(hasEffectivePermission(context, PERMS.MEMBERSHIP_VIEW), false);
});

await test("contexto y estructuras internas son inmutables", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([base]), { sub: base.user_id });
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.user), true);
  assert.equal(Object.isFrozen(context.membership), true);
  assert.equal(Object.isFrozen(context.tenant), true);
  assert.equal(Object.isFrozen(context.effectivePermissions), true);
});

await test("V2 usa el mismo contrato conceptual", async () => {
  const context = createAuthorizationContext({
    sessionKind: "V2",
    sessionId: "session-canonical",
    user: { id: base.user_id, email: base.user_email, status: base.user_status },
    membership: {
      id: base.membership_id,
      role: base.membership_role,
      status: base.membership_status,
      grantedPermissions: base.granted_permissions,
      deniedPermissions: base.denied_permissions,
      authorizationVersion: base.authorization_version,
    },
    tenant: { id: base.tenant_id, code: base.tenant_code, status: base.tenant_status },
  });
  assert.deepEqual(Object.keys(context).sort(), Object.keys(await resolveLegacyAuthorizationContext(prismaRows([base]), { sub: base.user_id })).sort());
  assert.equal(context.sessionKind, "V2");
});

await rejects("authorizationVersion stale invalida la sesión V2", async () => {
  const token = signMembershipAccessToken({
    userId: base.user_id,
    membershipId: base.membership_id,
    tenantId: base.tenant_id,
    role: base.membership_role,
    authorizationVersion: base.authorization_version,
    sessionId: "session-stale",
  }, { env: { MT01B_AUTH_MODE: "MEMBERSHIP_ONLY" } });
  const staleRow = {
    ...base,
    session_id: "session-stale",
    session_status: "ACTIVE",
    expires_at: new Date(Date.now() + 60_000),
    authorization_version: base.authorization_version + 1,
    authorization_version_snapshot: base.authorization_version,
  };
  await resolveAuthContext({ headers: { authorization: `Bearer ${token}` } }, {
    prisma: prismaRows([staleRow]),
    env: { MT01B_AUTH_MODE: "MEMBERSHIP_ONLY" },
  });
}, "MT01B_AUTHORIZATION_INVALID");

await rejects("default es sólo preferencia y no selecciona silenciosamente", async () => {
  const other = { ...base, membership_id: "membership-other", tenant_id: "tenant-other", tenant_code: "TENANT-OTHER", is_default: false };
  await resolveLegacyAuthorizationContext(prismaRows([base, other]), { sub: base.user_id });
}, "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED");

await test("membership única sin default puede seleccionarse sin asumir unicidad global", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([{ ...base, is_default: false }]), { sub: base.user_id });
  assert.equal(context.membershipId, base.membership_id);
});

await rejects("múltiples memberships sin selección fallan cerradas", () => resolveLegacyAuthorizationContext(prismaRows([
  { ...base, is_default: false },
  { ...base, membership_id: "membership-other", tenant_id: "tenant-other", tenant_code: "TENANT-OTHER", is_default: false },
]), { sub: base.user_id }), "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED");

await rejects("User inactivo", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, user_status: "SUSPENDED" }]), { sub: base.user_id }), "MT01B_AUTHORIZATION_INVALID");
await rejects("Membership inactiva", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, membership_status: "SUSPENDED" }]), { sub: base.user_id }, base.membership_public_ref), "MT01B_MEMBERSHIP_INACTIVE");
await rejects("Tenant inactivo", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, tenant_status: "SUSPENDED" }]), { sub: base.user_id }, base.membership_public_ref), "MT01B_TENANT_INACTIVE");
await rejects("Membership ausente", () => resolveLegacyAuthorizationContext(prismaRows([{
  user_id: base.user_id, user_email: base.user_email, user_status: "ACTIVE",
  membership_id: null, tenant_id: null,
}]), { sub: base.user_id }), "MT01B_MEMBERSHIP_NOT_FOUND");

await test("claims y autoridad del cliente no sustituyen Membership", async () => {
  const context = await resolveLegacyAuthorizationContext(prismaRows([base]), {
    sub: base.user_id,
    role: "A",
    tenantId: "forged-tenant",
    membershipId: "forged-membership",
  });
  assert.equal(context.role, "V");
  assert.equal(context.tenantId, base.tenant_id);
  assert.equal(context.membershipId, base.membership_id);
});

await test("política LEGACY exige credencial explícita fuerte", async () => {
  assert.equal(isCanonicalLegacyPassword(undefined), false);
  assert.equal(isCanonicalLegacyPassword("short"), false);
  assert.equal(isCanonicalLegacyPassword("ValidSynthetic1!Pass"), true);
});

process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
