import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function invariant(condition, message) {
  if (!condition) throw new Error(`V17-AUTH-USERS-TENANT-FIRST: ${message}`);
}
function read(root, file) { return fs.readFileSync(path.join(root, file), "utf8"); }

export function validateV17AuthUsersTenantFirstSources(sources) {
  const context = sources.get("api/_lib/authContext.js") || "";
  const login = sources.get("api/auth/login.js") || "";
  const me = sources.get("api/auth/me.js") || "";
  const users = sources.get("api/users/index.js") || "";
  const adminDomain = sources.get("api/_lib/adminMembershipDomain.js") || "";
  const adminApi = sources.get("src/admin-tenant/adminApi.ts") || "";
  const app = sources.get("src/App.tsx") || "";
  const sidebar = sources.get("src/components/layout/Sidebar.tsx") || "";
  const roleModules = sources.get("src/lib/roleModuleMap.ts") || "";
  const loginUi = sources.get("src/components/auth/LoginScreen.tsx") || "";
  const session = sources.get("src/lib/sessionStore.ts") || "";
  const centralApi = sources.get("src/lib/api.ts") || "";
  const schema = sources.get("prisma/schema.prisma") || "";

  invariant(/x-osi-membership-ref/.test(context) && /UUID_V4\.test\(value\)/.test(context), "membershipRef no se valida canónicamente antes de resolver");
  invariant(/WHERE u\."id" = \$\{String\(payload\.sub\)\}/.test(context), "selección no queda vinculada al User autenticado");
  invariant(/membership_public_ref/.test(context) && /explicitMatches/.test(context), "selección explícita no usa TenantMembership.publicRef");
  invariant(/activeCandidates\.length === 1 \? activeCandidates\[0\] : null/.test(context) && !/defaults\[0\]/.test(context), "una preferencia default selecciona silenciosamente entre varias Memberships");
  invariant(/active\(selected\.membership_status\)/.test(context) && /active\(selected\.tenant_status\)/.test(context), "selección omite estado de Membership o Tenant");
  invariant(/listLegacyMembershipOptions/.test(login) && /memberships\.length === 0/.test(login), "login no resuelve 0/1/N Memberships activas");
  invariant(/membershipSelection/.test(login) && !/user:\s*\{[\s\S]{0,160}\bid:|user:\s*\{[\s\S]{0,160}\bemail:/.test(login), "login expone PK o PII innecesaria");
  invariant(/membership:\s*\{[\s\S]*membershipRef:[\s\S]*tenantName:[\s\S]*role:/.test(me) && /memberships/.test(me), "/api/auth/me no publica contexto y selector mínimo");
  invariant(!/\bid:\s*user\.id|tenantId:|membershipId:/.test(me.split("function legacyUserDto", 2)[1]?.split("async function findCurrentUser", 1)[0] || ""), "DTO LEGACY /auth/me expone PK internas");

  invariant(/status\(410\)/.test(users) && /USERS_ADMINISTRATION_MOVED_TO_MEMBERSHIPS/.test(users), "/api/users no está retirado");
  invariant(!/password|hashPassword|prisma\.(?:user|tenantMembership)\.(?:findMany|create)/i.test(users), "/api/users conserva listado global o alta con password");
  invariant(!/\b(?:UserDto|getUsers|createUser)\b|requestJson[^\n]*\(["'`]\/users/.test(centralApi), "cliente central conserva listado global o alta directa de User");
  invariant(!/UsersModule/.test(app) && !/\{\s*id:\s*['"]users['"]/.test(sidebar) && !/["']users["'],/.test(roleModules), "módulo legacy global de Users volvió a quedar navegable");
  invariant(/tm\."tenant_id"=\$\{actor\.tenantId\}/.test(adminDomain) && /tm\."public_ref"=CAST\(\$\{ref\} AS uuid\)/.test(adminDomain), "Administración no resuelve Membership tenant-first");
  invariant(!/\b(?:id|userId|tenantId|membershipId):/.test(adminApi.split("export type AdminMembership", 2)[1]?.split("export type AdminIdentityInvitation", 1)[0] || ""), "DTO administrativo expone PK");

  invariant(/membershipSelection\.required/.test(loginUi) && /membershipSelection\.options\.length > 0/.test(loginUi), "UI no implementa selección 0/1/N");
  invariant(/memberships\.length <= 1/.test(app), "selector se muestra para un solo tenant");
  invariant(/validateLegacySession\(candidate\)[\s\S]*clearTenantScopedState\(\)[\s\S]*replaceState\(\{\}, '', '\/hub'\)/.test(app), "cambio de organización no valida antes de limpiar y volver al Hub");
  invariant(/sessionStorage\.clear\(\)/.test(session) && /localStorage\.removeItem/.test(session), "cambio de tenant no limpia estado empresarial");
  invariant(!/tenantId|tenantCode/.test(loginUi), "frontend acepta selector técnico de tenant");

  const userModel = /model User \{([\s\S]*?)\n\}/.exec(schema)?.[1] || "";
  const tenantModel = /model Tenant \{([\s\S]*?)\n\}/.exec(schema)?.[1] || "";
  invariant(!/\bpublicRef\b/.test(userModel) && !/\bpublicRef\b/.test(tenantModel), "se creó referencia pública no autorizada para User o Tenant");
  invariant(/model TenantMembership \{[\s\S]*publicRef/.test(schema), "TenantMembership.publicRef dejó de ser la referencia reutilizada");

  const userRoleUses = (login.match(/user\.role/g) || []).length;
  invariant(userRoleUses === 1 && /signAccessToken\([\s\S]{0,180}role: user\.role/.test(login), "User.role debe quedar sólo como claim LEGACY de compatibilidad en login");
  invariant(!/response\.user\.id|response\.user\.email|response\.user\.role\s+as/.test(loginUi), "frontend volvió a usar identidad global o User.role como autoridad");

  for (const file of ["src/lib/api.ts", "src/admin-tenant/adminApi.ts", "src/crm-relational/api.ts", "src/crm-relational/readApi.ts", "src/crm-relational/mutationApi.ts"]) {
    invariant(/X-OSI-Membership-Ref|x-osi-membership-ref/.test(sources.get(file) || ""), `${file} no propaga la preferencia revalidable`);
  }
  return Object.freeze({ retiredUserRoutes: 1, publicReferencesAdded: 0, schemaMigrationsAdded: 0 });
}

export function validateV17AuthUsersTenantFirstRepository(root = process.cwd()) {
  const files = [
    "api/_lib/authContext.js", "api/auth/login.js", "api/auth/me.js", "api/users/index.js",
    "api/_lib/adminMembershipDomain.js", "src/admin-tenant/adminApi.ts", "src/App.tsx", "src/components/layout/Sidebar.tsx", "src/lib/roleModuleMap.ts",
    "src/components/auth/LoginScreen.tsx", "src/lib/sessionStore.ts", "prisma/schema.prisma",
    "src/lib/api.ts", "src/crm-relational/api.ts", "src/crm-relational/readApi.ts", "src/crm-relational/mutationApi.ts",
  ];
  return validateV17AuthUsersTenantFirstSources(new Map(files.map((file) => [file, read(root, file)])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateV17AuthUsersTenantFirstRepository() })}\n`);
