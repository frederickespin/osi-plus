import assert from "node:assert/strict";
import { signAccessToken } from "../api/_lib/auth.js";
import { resolveCommercialContext } from "../api/_lib/commercialTenancyWrite.js";

process.env.JWT_SECRET = "P".repeat(64);

const membershipRef = "d84db4ce-bb2e-4f93-9e91-0d454c277b0d";
const token = signAccessToken({
  sub: "preview-user",
  email: "preview-user@example.invalid",
  role: "A",
});
const request = { headers: { authorization: `Bearer ${token}` } };
const prisma = {
  $queryRaw: async () => [{
    tenant_id: "preview-tenant",
    tenant_code: "V17-CONSOLIDATED-PREVIEW-10B",
    tenant_name: "Tenant Preview sintetico",
    tenant_status: "ACTIVE",
    membership_id: "preview-membership",
    membership_public_ref: membershipRef,
    membership_role: "A",
    membership_status: "ACTIVE",
    granted_permissions: ["pipeline:view"],
    denied_permissions: [],
    authorization_version: 1,
    user_id: "preview-user",
    user_email: "preview-user@example.invalid",
    user_status: "ACTIVE",
  }],
};

const context = await resolveCommercialContext(request, { prisma });
assert.equal(context.membershipRef, membershipRef);
assert.equal(context.membership.publicRef, membershipRef);
assert.equal(context.tenant.name, "Tenant Preview sintetico");
assert.ok(context.effectivePermissions.includes("pipeline:view"));

console.log(JSON.stringify({ ok: true, assertions: 4, publicIdentityExposed: true }));
