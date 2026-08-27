import { readFileSync } from "node:fs";
import { validateAdminTenantMembershipGuard } from "./validate-v17-admin-tenant-memberships-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
const cases = [
  ["tenant ausente", "api/_lib/adminMembershipDomain.js", (s) => s.replace('WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)', 'WHERE tm."public_ref"=CAST(${ref} AS uuid)')],
  ["publicRef ausente", "api/_lib/adminMembershipDomain.js", (s) => s.replace('WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)', 'WHERE tm."tenant_id"=${tenantId}')],
  ["actor no revalidado", "api/_lib/adminMembershipDomain.js", (s) => s.replace('const actor = await revalidateActor(tx, context);', 'const actor = { membershipId: context.membershipId, effective: new Set(context.permissions), row: { denied_permissions: [] } };')],
  ["rol A backend eliminado", "api/_lib/adminMembershipDomain.js", (s) => s.replace('String(actor.role) !== "A" || ', "")],
  ["permiso explícito eliminado", "api/_lib/rbac.js", (s) => s.replace('MEMBERSHIP_VIEW: "membership:view",', "")],
  ["control de versión eliminado", "api/_lib/adminMembershipDomain.js", (s) => s.replace('if (Number(before.authorization_version) !== expectedVersion)', "if (false)")],
  ["gate después de auth", "api/_lib/adminMembershipHttp.js", (s) => s.replace('requireAdminTenantMembershipAccess(req, env);', '').replace('const context = await resolveContext(req, { prisma, env });', 'const context = await resolveContext(req, { prisma, env }); requireAdminTenantMembershipAccess(req, env);')],
  ["rol A concede permisos", "api/_lib/rbac.js", (s) => s.replace('&& !EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS.has(permission)', "")],
  ["último A sin protección", "api/_lib/adminMembershipDomain.js", (s) => s.replace('(beforeAdmins >= 2 && afterAdmins < 2)', "false")],
  ["publicRef mutable", "prisma/migrations/20260827010000_v17_tenant_membership_public_ref/migration.sql", (s) => s.replace('BEFORE UPDATE OF "public_ref"', 'AFTER INSERT')],
  ["UI histórica", "src/admin-tenant/AdminTenantMembershipModule.tsx", (s) => `${s}\nconst unsafe = localStorage.getItem("users");`],
  ["bootstrap crea hash", "scripts/v17-admin-membership-bootstrap.mjs", (s) => `${s}\nconst passwordHash = await hashPassword("unsafe");`],
];

let assertions = 0;
for (const [name, path, mutate] of cases) {
  let failed = false;
  try { validateAdminTenantMembershipGuard({ [path]: mutate(read(path)) }); } catch { failed = true; }
  if (!failed) throw new Error(`guardia negativa no detectó: ${name}`);
  assertions += 1;
}
if (!validateAdminTenantMembershipGuard().ok) throw new Error("guardia positiva falló");
assertions += 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions, negatives: cases.length })}\n`);
