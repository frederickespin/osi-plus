import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fail = (message) => { throw new Error(`V17_CLIENT_TEMPORARY_PORTAL_GUARD: ${message}`); };
const read = (path, overrides = {}) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
const need = (source, expression, message) => { if (!expression.test(source)) fail(message); };

export function validateClientTemporaryPortal(overrides = {}) {
  const schema = read("prisma/schema.prisma", overrides);
  const migration = read("prisma/migrations/20260916010000_v17_client_temporary_portal/migration.sql", overrides);
  const domain = read("api/_lib/clientTemporaryAccessDomain.js", overrides);
  const contract = read("api/_lib/clientTemporaryAccessContract.js", overrides);
  const http = read("api/_lib/clientTemporaryAccessHttp.js", overrides);
  const app = read("src/App.tsx", overrides);
  const portal = read("src/client-portal/ClientTemporaryPortal.tsx", overrides);
  const panel = read("src/client-portal/ClientTemporaryAccessPanel.tsx", overrides);
  const survey = read("api/_lib/crmSurveyDomain.js", overrides);
  const backendRbac = read("api/_lib/rbac.js", overrides); const frontendRbac = read("src/lib/rbac.ts", overrides);
  const caseAuthoritySource = domain.slice(domain.indexOf("async function caseAuthority"), domain.indexOf("async function selectedContactAuthority"));
  for (const model of ["ClientTemporaryAccess", "ClientTemporaryAccessGrant", "ClientTemporaryAccessEvent", "ClientTemporaryAccessCommand", "ClientTemporaryVisitResponse", "ClientTemporarySurveyContribution", "ClientTemporarySurveyContributionItem", "ClientTemporarySurveyContributionAsset", "ClientTemporaryQrConfirmation"]) need(schema, new RegExp(`model ${model}\\b`), `falta ${model}`);
  need(schema, /tokenHash\s+String[^\n]*@map\("token_hash"\)[^\n]*@db\.Char\(64\)/, "token sólo debe persistirse como hash");
  if (/\btoken\s+String\b/.test(schema) || /"token"\s+(?:TEXT|VARCHAR)/i.test(migration)) fail("se persiste token en texto claro");
  for (const relation of ["client_temporary_accesses_case_fkey", "client_temporary_accesses_assignment_fkey", "client_survey_contributions_access_fkey", "client_temporary_qr_confirmations_access_fkey"]) need(migration, new RegExp(`CONSTRAINT "${relation}" FOREIGN KEY \\("tenant_id",`), `FK ${relation} no es tenant-first`);
  for (const fn of ["client_temporary_access_immutable_guard", "client_temporary_append_only_guard", "client_temporary_mini_limit_guard"]) need(migration, new RegExp(`CREATE OR REPLACE FUNCTION "osi"\\."${fn}"`), `falta trigger ${fn}`);
  need(domain, /JOIN "osi"\."osi_users"[\s\S]*JOIN "osi"\."tenants"[\s\S]*denied\.has\(permission\)/, "autoridad no revalida User/Membership/Tenant o deny");
  need(caseAuthoritySource, /tenantId: who\.tenantId, publicRef:[\s\S]*ownerMembershipId:[\s\S]*ownerUserId:/, "alcance A/V no es tenant/owner-first");
  need(domain, /commercialEntityContact\.findFirst[\s\S]*pipelineCaseId[\s\S]*state: "PUBLISHED"/, "contacto no procede del contexto publicado del caso");
  need(domain, /randomBytes\(32\)\.toString\("base64url"\)[\s\S]*tokenHash = digest\(token\)/, "token criptográfico/hash ausente");
  need(domain, /source: "CLIENT_SUPPLIED"/, "Mini no conserva fuente CLIENT_SUPPLIED");
  need(domain, /estimatedVolumeM3 = items\.reduce[\s\S]*estimatedWeightKg = items\.reduce/, "Mini no calcula totales desde catálogo versionado");
  need(domain, /communicationStatus: "COMMUNICATED"/, "Visit Fee no exige comunicación explícita");
  need(domain, /failures >= 5[\s\S]*return Object\.freeze\(\{ unavailable: true \}\)/, "código corto no conserva contador de fuerza bruta");
  need(contract, /items\.length > 10\) fail\("CLIENT_TEMPORARY_MINI_REQUIRES_DETAILED_SURVEY"/, "límite Mini exacto ausente");
  need(http, /productionApiEnabled = false/, "Production API fue activada");
  need(http, /hasVercel\(env\)[\s\S]*!isRealLoopbackRequest\(req\)/, "LOCAL_ONLY no falla cerrado en Vercel/no-loopback");
  need(http, /prepareClientTemporaryRequest\(req, res, env\)[\s\S]*resolveContext/, "gate no precede auth/body/Prisma");
  need(app, /isClientTemporaryPortalRoute\(\)[\s\S]*<ClientTemporaryPortal/, "ruta externa no se separa antes del shell autenticado");
  if (/Sidebar|HubWorkspace|AdvancedErpShell/.test(portal)) fail("portal externo importa el ERP/Hub");
  if (/localStorage|sessionStorage/.test(portal)) fail("portal usa browser storage como autoridad");
  need(portal, /history\.replaceState\(\{\}, "", window\.location\.pathname\)/, "token no se elimina del fragmento");
  need(panel, /Credencial de una sola visualización[\s\S]*no se almacena en texto claro/, "emisión interna no advierte one-time secret");
  need(panel, /<QRCodeSVG[\s\S]*value=\{new URL\(credentials\.link, window\.location\.origin\)\.toString\(\)\}/, "QR one-time no usa el acceso temporal exacto");
  need(survey, /clientSupplied:[\s\S]*source: "CLIENT_SUPPLIED"[\s\S]*evaluatorVerified: false/, "Survey App no consume el aporte como no verificado");
  for (const permission of ["client-access:view", "client-access:create", "client-access:revoke", "client-access:manage"]) if (!backendRbac.includes(permission) || !frontendRbac.includes(permission)) fail(`falta permiso ${permission}`);
  if (/productionApiEnabled\s*[:=]\s*true/i.test(`${http}\n${portal}\n${panel}`)) fail("Production fue habilitada");
  if (/\bacceptQuote\b|status:\s*"SENT"/.test(`${domain}\n${portal}\n${panel}`)) fail("se amplió a aceptación de cotización o envío externo");
  return Object.freeze({ models: 9, permissions: 4, migration: 35, productionApiEnabled: false, externalTransports: 0 });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) process.stdout.write(`${JSON.stringify({ ok: true, ...validateClientTemporaryPortal() })}\n`);
