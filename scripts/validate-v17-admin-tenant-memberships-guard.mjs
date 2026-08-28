import { readFileSync } from "node:fs";

function read(path) { return readFileSync(path, "utf8"); }
function invariant(value, message) { if (!value) throw new Error(message); }

export function validateAdminTenantMembershipGuard(overrides = {}) {
  const source = (path) => overrides[path] ?? read(path);
  const migration = source("prisma/migrations/20260827010000_v17_tenant_membership_public_ref/migration.sql");
  const schema = source("prisma/schema.prisma");
  const rbac = source("api/_lib/rbac.js");
  const access = source("api/_lib/adminMembershipAccess.js");
  const domain = source("api/_lib/adminMembershipDomain.js");
  const http = source("api/_lib/adminMembershipHttp.js");
  const catalog = source("src/hub/appCatalog.ts");
  const hub = source("src/hub/HubWorkspace.tsx");
  const ui = `${source("src/admin-tenant/adminApi.ts")}\n${source("src/admin-tenant/AdminTenantMembershipModule.tsx")}`;
  const bootstrap = source("scripts/v17-admin-membership-bootstrap.mjs");

  invariant(/ADD COLUMN "public_ref" UUID[\s\S]*SET "public_ref" = gen_random_uuid\(\)[\s\S]*SET NOT NULL[\s\S]*UNIQUE \("tenant_id", "public_ref"\)/u.test(migration), "migración publicRef incompleta");
  invariant(/publicRef is immutable/u.test(migration) && /BEFORE UPDATE OF "public_ref"/u.test(migration), "publicRef no es inmutable");
  invariant(/publicRef[\s\S]*@db\.Uuid[\s\S]*@@unique\(\[tenantId, publicRef\]/u.test(schema), "schema no publica unique tenant-first");
  for (const permission of ["membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status"]) invariant(rbac.includes(permission), `permiso ausente ${permission}`);
  invariant(/EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS[\s\S]*!EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS\.has/u.test(rbac), "rol A concede administración automáticamente");
  invariant(/DISABLED: "DISABLED"[\s\S]*LOCAL_ONLY: "LOCAL_ONLY"/u.test(access) && !/PRODUCTION|PREVIEW/u.test(access), "compuerta administrativa amplió entornos");
  invariant(/requireAdminTenantMembershipAccess\(req, env\)/u.test(http), "HTTP no ejecuta compuerta");
  const handler = http.slice(http.indexOf("return withPrivateApiHeaders"));
  invariant(handler.length > 0, "wrapper privado administrativo ausente");
  invariant(handler.indexOf("requireAdminTenantMembershipAccess(req, env)") < handler.indexOf("resolveContext(req"), "auth ocurre antes de gate");
  invariant(handler.indexOf("resolveContext(req") < handler.indexOf("readJsonObject(req"), "body ocurre antes de auth");
  invariant(domain.includes('WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)') && /FOR UPDATE OF tm, u/u.test(domain), "mutación no resuelve tenant/publicRef con lock");
  invariant(domain.includes("const actor = await revalidateAdminActor(tx, context);"), "mutación no revalida actor");
  invariant(/String\(actor\.role\) !== "A"/u.test(domain), "backend permite administración a roles distintos de A");
  invariant(domain.includes("if (Number(before.authorization_version) !== expectedVersion)") && /authorization_version[\s\S]*ADMIN_MEMBERSHIP_VERSION_CONFLICT/u.test(domain), "concurrencia optimista ausente");
  invariant(/FROM "osi"\."tenants" WHERE "id"=\$\{tenantId\} FOR UPDATE/u.test(domain), "invariante administrativa no serializa por tenant");
  invariant(/beforeAdmins >= 2[\s\S]*afterAdmins < 2/u.test(domain) && /ADMIN_MEMBERSHIP_SELF_PROTECTION/u.test(domain), "protección de administradores ausente");
  invariant(/auth_sessions/u.test(domain) && /auth_refresh_tokens/u.test(domain) && /appendCommercialAudit/u.test(domain), "revocación o auditoría ausente");
  invariant(/membership:view[\s\S]*requiresExplicitPermissions: true/u.test(catalog), "catálogo concede Administración sin permiso explícito");
  invariant(/const AdminTenantMembershipModule = lazy/u.test(hub) && /selected\?\.appId === "administration"[\s\S]*adminEnabled/u.test(hub), "Administración no está lazy y gated");
  invariant(!/\/api\/users|mockUsers|localStorage|sessionStorage|indexedDB/u.test(ui), "UI usa autoridad histórica o storage");
  invariant(!/\b(?:tenantId|membershipId|userId|publicRef|clientId)\b/u.test(ui), "UI expone identidad interna");
  invariant(/--apply[\s\S]*AUTHORIZATION_FILE_REQUIRED[\s\S]*TARGET_USER_NOT_AUTHENTICABLE_OR_UNIQUE/u.test(bootstrap), "bootstrap no exige dry-run/autorización/User autenticable");
  invariant(!/passwordHash\s*[:=]|bcrypt\.hash|hashPassword/u.test(bootstrap), "bootstrap crea credenciales");
  return { ok: true, migration: 20, permissions: 4, routes: 2, modes: ["DISABLED", "LOCAL_ONLY"] };
}

if (process.argv[1]?.endsWith("validate-v17-admin-tenant-memberships-guard.mjs")) {
  try { process.stdout.write(`${JSON.stringify(validateAdminTenantMembershipGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
