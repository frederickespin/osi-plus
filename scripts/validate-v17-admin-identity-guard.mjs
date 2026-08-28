import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function invariant(value, message) { if (!value) throw new Error(`V17_ADMIN_IDENTITY_GUARD: ${message}`); }

export function validateV17AdminIdentityGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const migrationName = "20260827020000_v17_admin_identity_invitation";
  invariant(migrations.length === 21 && migrations.at(-1) === migrationName, "migración 21 exacta ausente o fuera de orden");
  const migration = read(`prisma/migrations/${migrationName}/migration.sql`);
  const schema = read("prisma/schema.prisma");
  const domain = read("api/_lib/adminIdentityInvitationDomain.js");
  const http = read("api/_lib/adminIdentityInvitationHttp.js");
  const activation = `${read("src/admin-tenant/AdminIdentityActivation.tsx")}\n${read("src/admin-tenant/adminIdentityActivationRoute.ts")}`;
  const app = read("src/App.tsx");
  const adminUi = read("src/admin-tenant/AdminTenantMembershipModule.tsx");
  const bootstrap = read("scripts/v17-admin-initial-permissions-bootstrap.mjs");
  const vercel = read("vercel.json");
  const workflow = read(".github/workflows/ci.yml");

  for (const fragment of [
    '"public_ref" UUID NOT NULL DEFAULT gen_random_uuid()', '"token_hash" CHAR(64) NOT NULL',
    'UNIQUE ("tenant_id", "public_ref")', '"expires_at" <= "created_at" + INTERVAL \'24 hours\'',
    'admin_identity_invitations_one_pending_email_key', 'WHERE "status" = \'PENDING\'',
    'admin_identity_invitations_identity_immutable', 'BEFORE UPDATE ON "osi"."admin_identity_invitations"',
  ]) invariant(migration.includes(fragment), `invariante SQL ausente: ${fragment}`);
  invariant(!/\btoken\b(?!_hash)/iu.test(migration.replaceAll("Tokens", "")), "la migración persiste token sin hash");
  invariant(/model AdminIdentityInvitation[\s\S]*tokenHash[\s\S]*@@unique\(\[tenantId, publicRef\]/u.test(schema), "schema tenant-first incompleto");
  invariant(/randomBytes\(32\)/u.test(domain) && /createHash\("sha256"\)/u.test(domain), "token no es aleatorio o hash-only");
  invariant(/24 \* 60 \* 60 \* 1_000/u.test(domain) && /status[^\n]*PENDING/u.test(domain), "expiración o un solo uso ausente");
  invariant(/WHERE "id"=CAST\(\$\{invitation\.id\} AS uuid\)[\s\S]*AND "status"='PENDING'/u.test(domain), "consumo no es atómico");
  invariant(/authenticateLegacyCredentials|hashPassword/u.test(`${domain}\n${read("api/auth/login.js")}`), "activación no reutiliza Auth LEGACY");
  invariant(/existing\[0\][\s\S]*throw publicActivationError/u.test(domain) && /acceptExistingAdminIdentity/u.test(domain), "User existente puede reemplazarse o carece de aceptación autenticada");
  invariant(!/UPDATE[\s\S]{0,120}"passwordHash"|password_hash[\s\S]{0,120}UPDATE/iu.test(domain), "activación reemplaza password existente");
  for (const handler of ["createAdminIdentityInvitationCollectionHandler", "createAdminIdentityInvitationDetailHandler", "createAdminIdentityActivationHandler"]) invariant(http.includes(handler), `handler ausente: ${handler}`);
  const gatedBlocks = http.split("return withPrivateApiHeaders").slice(1);
  invariant(gatedBlocks.length === 3 && gatedBlocks.every((block) => block.indexOf("requireAdminTenantMembershipAccess(req, env)") >= 0
    && block.indexOf("requireAdminTenantMembershipAccess(req, env)") < block.indexOf("readJsonObject(req")), "gate no precede body en todos los endpoints");
  invariant(/setAuthPrivateHeaders|setCrmPrivateHeaders/u.test(http)
    && (http.match(/handleOptions: false/gu) || []).length === 3
    && !/Access-Control-Allow-(?:Origin|Credentials)/u.test(http), "headers privados/CORS cerrado ausentes");
  invariant(/replaceState\(\{\}, "", "\/activate-admin"\)/u.test(activation), "token no se retira del fragmento");
  invariant(/loadSession/u.test(activation) && /Authorization: `Bearer/u.test(activation) && /Su contraseña no será reemplazada/u.test(activation), "aceptación autenticada de User existente incompleta");
  invariant(/const AdminIdentityActivation = lazy/u.test(app)
    && /isAdminIdentityActivationRoute\(\)[\s\S]*isAdminTenantMembershipEnabled\(\)[\s\S]*<SessionApp/u.test(app), "pantalla de activación no está lazy o detrás de la compuerta administrativa");
  invariant(/Invitar administrador/u.test(adminUi) && /se mostrará una sola vez|una sola vez/iu.test(adminUi) && /Revocar/u.test(adminUi), "UI de invitación incompleta");
  invariant(/const DRY_RUN = Symbol/u.test(bootstrap) && /SET TRANSACTION READ ONLY/u.test(bootstrap), "bootstrap no es dry-run read-only por defecto");
  invariant(bootstrap.includes("manifestHash") && bootstrap.includes("AUTHORIZATION_RECEIPT_INVALID")
    && bootstrap.includes("APPLY_CONFIRMATION_REQUIRED"), "bootstrap no exige manifiesto, recibo y confirmación");
  invariant(bootstrap.includes("auth_sessions") && bootstrap.includes("auth_refresh_tokens")
    && bootstrap.includes("appendCommercialAudit"), "bootstrap no revoca sesiones o audita");
  invariant(!/bcrypt|passwordHash|hashPassword/u.test(bootstrap), "bootstrap toca credenciales");
  const platformApiRules = (JSON.parse(vercel).headers || []).filter((rule) => String(rule?.source || "").startsWith("/api/"));
  invariant(platformApiRules.length === 0, "Admin puede heredar CORS global");
  invariant(workflow.includes("guard:v17-admin-identity") && workflow.includes("test:v17-admin-identity:http"), "CI no exige guardia y HTTP");
  return Object.freeze({ ok: true, migrations: 21, invitationRoutes: 3, tokenStorage: "SHA256_ONLY", maxExpiryHours: 24, bootstrapDefault: "DRY_RUN" });
}

if (process.argv[1]?.endsWith("validate-v17-admin-identity-guard.mjs")) {
  try { process.stdout.write(`${JSON.stringify(validateV17AdminIdentityGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
