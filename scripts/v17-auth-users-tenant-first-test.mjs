import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import usersHandler from "../api/users/index.js";
import { createAuthorizationContext, hasEffectivePermission } from "../api/_lib/authorizationContext.js";
import { listLegacyMembershipOptions, resolveLegacyAuthorizationContext } from "../api/_lib/authContext.js";

const refA = randomUUID();
const refB = randomUUID();
const base = Object.freeze({
  user_id: "user-one", user_email: "one@example.invalid", user_status: "ACTIVE",
  membership_id: "membership-a", membership_public_ref: refA, membership_role: "A",
  membership_status: "ACTIVE", authorization_version: 3,
  granted_permissions: ["membership:view"], denied_permissions: [], is_default: true,
  tenant_id: "tenant-a", tenant_code: "TENANT-A", tenant_name: "Organización A", tenant_status: "ACTIVE",
});
const other = Object.freeze({
  ...base, membership_id: "membership-b", membership_public_ref: refB, membership_role: "V",
  tenant_id: "tenant-b", tenant_code: "TENANT-B", tenant_name: "Organización B", is_default: false,
  granted_permissions: ["pipeline:view"],
});

const results = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  results.push({ name, passed: true });
}
async function rejects(name, operation, code) {
  await assert.rejects(operation, (error) => error?.code === code);
  results.push({ name, passed: true });
}
function prismaRows(rows) { return { $queryRaw: async () => rows.map((row) => ({ ...row })) }; }

const single = await resolveLegacyAuthorizationContext(prismaRows([base]), { sub: base.user_id }, refA);
check("una Membership se selecciona por membershipRef", single.membershipRef === refA && single.tenant.name === "Organización A");
check("rol procede de Membership", single.role === "A");

const selectedB = await resolveLegacyAuthorizationContext(prismaRows([base, other]), { sub: base.user_id, role: "A", tenantId: "forged" }, refB);
check("selección múltiple explícita resuelve B", selectedB.membershipRef === refB && selectedB.tenantId === "tenant-b" && selectedB.role === "V");
check("claim legado no sustituye selección", selectedB.role !== "A");
await rejects("default no selecciona silenciosamente entre múltiples Memberships", () => resolveLegacyAuthorizationContext(prismaRows([base, other]), { sub: base.user_id }), "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED");

await rejects("selección ajena es 404 indistinguible", () => resolveLegacyAuthorizationContext(prismaRows([base, other]), { sub: base.user_id }, randomUUID()), "MT01B_MEMBERSHIP_NOT_FOUND");
await rejects("Membership propia inactiva falla", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, membership_status: "SUSPENDED" }]), { sub: base.user_id }, refA), "MT01B_MEMBERSHIP_INACTIVE");
await rejects("Tenant propio inactivo falla", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, tenant_status: "SUSPENDED" }]), { sub: base.user_id }, refA), "MT01B_TENANT_INACTIVE");
await rejects("cero Memberships falla", () => resolveLegacyAuthorizationContext(prismaRows([{ ...base, membership_id: null, membership_public_ref: null, tenant_id: null }]), { sub: base.user_id }), "MT01B_MEMBERSHIP_NOT_FOUND");
await rejects("publicRef ambiguo falla cerrado", () => resolveLegacyAuthorizationContext(prismaRows([base, { ...other, membership_public_ref: refA }]), { sub: base.user_id }, refA), "MT01B_MEMBERSHIP_SELECTION_AMBIGUOUS");

const options = await listLegacyMembershipOptions(prismaRows([
  { user_status: "ACTIVE", membership_public_ref: refA, membership_role: "A", is_default: true, tenant_name: "Organización A" },
  { user_status: "ACTIVE", membership_public_ref: refB, membership_role: "V", is_default: false, tenant_name: "Organización B" },
]), base.user_id);
check("selector publica lista mínima", options.length === 2 && Object.keys(options[0]).sort().join(",") === "membershipRef,preferred,role,tenantName");
check("selector no publica PK o tenantId", !JSON.stringify(options).includes("tenant_id") && !JSON.stringify(options).includes("membership_id"));

const denied = createAuthorizationContext({
  sessionKind: "LEGACY", user: { id: "u", status: "ACTIVE" },
  membership: { id: "m", publicRef: refA, role: "A", status: "ACTIVE", authorizationVersion: 1, grantedPermissions: ["membership:view"], deniedPermissions: ["membership:view"] },
  tenant: { id: "t", code: "T", name: "Tenant", status: "ACTIVE" },
});
check("deniedPermissions prevalece", !hasEffectivePermission(denied, "membership:view"));

function response() {
  const headers = new Map();
  return { statusCode: 200, body: null, setHeader(k, v) { headers.set(String(k).toLowerCase(), v); }, getHeader(k) { return headers.get(String(k).toLowerCase()); }, removeHeader(k) { headers.delete(String(k).toLowerCase()); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; }, end() { return this; }, headers };
}
for (const method of ["GET", "POST"]) {
  const res = response();
  await usersHandler({ method, headers: {} }, res);
  check(`/api/users ${method} retirado`, res.statusCode === 410 && res.body?.replacement === "/api/admin/memberships" && res.body?.identityCreation === "ADMIN_IDENTITY_INVITATION");
}

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
