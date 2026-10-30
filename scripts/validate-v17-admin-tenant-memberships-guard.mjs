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
  const preview = source("api/_lib/adminMembershipPreview.js");
  const roles = source("shared/adminMembershipCatalog.js");
  const catalog = source("src/hub/appCatalog.ts");
  const hub = source("src/hub/HubWorkspace.tsx");
  const workspace = source("src/administration/AdministrationWorkspace.tsx");
  const ui = `${source("src/admin-tenant/adminApi.ts")}\n${source("src/admin-tenant/AdminTenantMembershipModule.tsx")}`;
  const bootstrap = source("scripts/v17-admin-membership-bootstrap.mjs");

  invariant(/ADD COLUMN "public_ref" UUID[\s\S]*SET "public_ref" = gen_random_uuid\(\)[\s\S]*SET NOT NULL[\s\S]*UNIQUE \("tenant_id", "public_ref"\)/u.test(migration), "migración publicRef incompleta");
  invariant(/publicRef is immutable/u.test(migration) && /BEFORE UPDATE OF "public_ref"/u.test(migration), "publicRef no es inmutable");
  invariant(/publicRef[\s\S]*@db\.Uuid[\s\S]*@@unique\(\[tenantId, publicRef\]/u.test(schema), "schema no publica unique tenant-first");
  for (const permission of ["membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status"]) invariant(rbac.includes(permission), `permiso ausente ${permission}`);
  invariant(/EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS[\s\S]*!EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS\.has/u.test(rbac), "rol A concede administración automáticamente");
  invariant(/DISABLED: "DISABLED"[\s\S]*LOCAL_ONLY: "LOCAL_ONLY"[\s\S]*PRODUCTION_PILOT/u.test(access)
    && /resolveV17ProductionPilotActivation/u.test(access), "compuerta administrativa no limita el piloto productivo");
  invariant(/PREVIEW_REHEARSAL: ADMIN_MEMBERSHIP_PREVIEW_MODE/u.test(access)
    && /assertAdminMembershipPreviewEnvironment\(env\)/u.test(access)
    && /ADMIN_IDENTITY_INVITATION_MODES = Object\.freeze/u.test(access)
    && !/ADMIN_IDENTITY_INVITATION_MODES = ADMIN_TENANT_MEMBERSHIP_MODES/u.test(access), "Preview de membresías no está separado de invitaciones");
  invariant(/env\.VERCEL_ENV !== "preview"/u.test(preview)
    && /isAdminMembershipPreviewBranch\(env\.VERCEL_GIT_COMMIT_REF\)/u.test(preview)
    && /env\.ADMIN_MEMBERSHIP_PREVIEW_BATCH !== ADMIN_MEMBERSHIP_PREVIEW_BATCH/u.test(preview)
    && /env\.MT01B_AUTH_MODE !== "LEGACY"/u.test(preview)
    && /env\.MT01B_TENANT_SWITCH_ENABLED !== "false"/u.test(preview)
    && /env\.VITE_MT01B2_CLIENT_ENABLED !== "false"/u.test(preview), "Preview administrativo carece de ambiente, rama, batch o Auth exactos");
  for (const key of ["ADMIN_MEMBERSHIP_PREVIEW_DATABASE", "ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID", "ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE"]) {
    invariant(preview.includes(`env.${key}`) && !preview.includes(`VITE_${key}`), `destino Preview servidor ausente: ${key}`);
  }
  invariant(/current_database\(\)/u.test(preview) && /current_setting\('neon\.branch_id', true\)/u.test(preview)
    && /identity\?\.database !== expected\.database/u.test(preview)
    && /identity\?\.branch !== expected\.neonBranch/u.test(preview)
    && /context\?\.tenantCode !== expected\.tenantCode/u.test(preview)
    && /context\?\.tenant\?\.code !== expected\.tenantCode/u.test(preview), "Preview no verifica destino real o empresa canónica");
  invariant(/requireAdminTenantMembershipAccess\(req, env\)/u.test(http), "HTTP no ejecuta compuerta");
  const handler = http.slice(http.indexOf("return withPrivateApiHeaders"));
  invariant(handler.length > 0, "wrapper privado administrativo ausente");
  invariant(handler.indexOf("requireAdminTenantMembershipAccess(req, env)") < handler.indexOf("resolveContext(req"), "auth ocurre antes de gate");
  invariant(handler.indexOf("resolveContext(req") < handler.indexOf("readJsonObject(req"), "body ocurre antes de auth");
  invariant((http.match(/await assertAdminMembershipPreviewDatabase\(prisma, mode, env\)/gu) || []).length === 2
    && (http.match(/requireAdminMembershipPreviewContext\(env, context\)/gu) || []).length === 2
    && handler.indexOf("requireAdminMembershipPreviewContext(env, context)") < handler.indexOf("readJsonObject(req"), "HTTP no aplica destino/contexto Preview antes del cuerpo");
  invariant(/catalog: adminMembershipCatalog\(\)/u.test(http)
    && /inheritedPermissions: Object\.freeze\(\[\.\.\.new Set\(permsForRole\(code\)\)\]/u.test(domain)
    && /KNOWN_PERMISSIONS = new Set\(Object\.values\(PERMS\)\)/u.test(domain), "catálogo no deriva autoridad canónica del servidor");
  const expectedRoles = schema.match(/enum TenantMembershipRole \{([^}]+)\}/u)?.[1]?.trim().split(/\s+/u).sort();
  const catalogRoles = [...roles.matchAll(/\{ code: "([A-Z0-9]+)", label:/gu)].map((match) => match[1]).sort();
  invariant(expectedRoles && JSON.stringify(expectedRoles) === JSON.stringify(catalogRoles)
    && /ROLES = new Set\(ADMIN_MEMBERSHIP_ROLE_OPTIONS\.map/u.test(domain), "roles administrativos no corresponden al modelo");
  invariant(domain.includes('WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)') && /FOR UPDATE OF tm, u/u.test(domain), "mutación no resuelve tenant/publicRef con lock");
  invariant(domain.includes("const actor = await revalidateAdminActor(tx, context);"), "mutación no revalida actor");
  const updateDomain = domain.slice(domain.indexOf("export async function updateTenantMembership"));
  invariant(updateDomain.includes("requireAdminPermission(context, PERMS.MEMBERSHIP_VIEW)")
    && updateDomain.includes("assertAdminActorPermission(actor, PERMS.MEMBERSHIP_VIEW)"), "mutación no requiere lectura vigente");
  invariant(/preserveUnknownPermissions\(before\.granted_permissions, next\.granted_permissions\)/u.test(domain)
    && /preserveUnknownPermissions\(before\.denied_permissions, next\.denied_permissions\)/u.test(domain)
    && /!KNOWN_PERMISSIONS\.has\(permission\) && !existing\.has\(permission\)/u.test(domain), "permisos desconocidos pueden introducirse o cambiar de arreglo");
  invariant(/existingOverlap = new Set\(before\.granted_permissions\.filter/u.test(domain)
    && /next\.denied_permissions\.includes\(permission\) && !existingOverlap\.has\(permission\)/u.test(domain), "conflictos de permisos no preservan historia ni rechazan intersecciones nuevas");
  invariant(/String\(actor\.role\) !== "A"/u.test(domain), "backend permite administración a roles distintos de A");
  invariant(domain.includes("if (Number(before.authorization_version) !== expectedVersion)") && /authorization_version[\s\S]*ADMIN_MEMBERSHIP_VERSION_CONFLICT/u.test(domain), "concurrencia optimista ausente");
  invariant(/FROM "osi"\."tenants" WHERE "id"=\$\{tenantId\} FOR UPDATE/u.test(domain), "invariante administrativa no serializa por tenant");
  invariant(/beforeAdmins >= 2[\s\S]*afterAdmins < 2/u.test(domain) && /ADMIN_MEMBERSHIP_SELF_PROTECTION/u.test(domain), "protección de administradores ausente");
  invariant(/auth_sessions/u.test(domain) && /auth_refresh_tokens/u.test(domain) && /appendCommercialAudit/u.test(domain), "revocación o auditoría ausente");
  invariant(/membership:view[\s\S]*requiresExplicitPermissions: true/u.test(catalog), "catálogo concede Administración sin permiso explícito");
  invariant(/const AdminTenantMembershipModule = lazy/u.test(workspace)
    && /const adminMembershipAvailable = adminEnabled && accessContext\.role === "A" && effectivePermissions\.has\("membership:view"\) && !deniedPermissions\.has\("membership:view"\)/u.test(hub)
    && /access: adminMembershipAvailable/u.test(hub)
    && /sections=\{administrationSections\}/u.test(hub)
    && /if \(!selected\) return <CanonicalAccessDenied/u.test(workspace)
    && /case "access": return <AdminTenantMembershipModule/u.test(workspace)
    && /includeConfiguration=\{false\}/u.test(workspace), "Administración no está lazy y gated");
  invariant(!/\/api\/users|mockUsers|localStorage|sessionStorage|indexedDB/u.test(ui), "UI usa autoridad histórica o storage");
  invariant(!/\b(?:tenantId|membershipId|userId|publicRef|clientId)\b/u.test(ui), "UI expone identidad interna");
  invariant(/--apply[\s\S]*AUTHORIZATION_FILE_REQUIRED[\s\S]*TARGET_USER_NOT_AUTHENTICABLE_OR_UNIQUE/u.test(bootstrap), "bootstrap no exige dry-run/autorización/User autenticable");
  invariant(!/passwordHash\s*[:=]|bcrypt\.hash|hashPassword/u.test(bootstrap), "bootstrap crea credenciales");
  return { ok: true, migration: 20, permissions: 4, roles: catalogRoles.length, routes: 2, modes: ["DISABLED", "LOCAL_ONLY", "PRODUCTION_PILOT", "PREVIEW_REHEARSAL"] };
}

if (process.argv[1]?.endsWith("validate-v17-admin-tenant-memberships-guard.mjs")) {
  try { process.stdout.write(`${JSON.stringify(validateAdminTenantMembershipGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
