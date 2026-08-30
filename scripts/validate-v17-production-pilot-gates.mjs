import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
function requireMatch(source, pattern, message) { if (!pattern.test(source)) throw new Error(message); }
function forbid(source, pattern, message) { if (pattern.test(source)) throw new Error(message); }

const [gate, crmAccess, crmHttp, adminAccess, adminHttp, identityHttp, mutationUi, adminMode, adminApi, app, hub, adminModule, hubGuard] = await Promise.all([
  read("api/_lib/v17ProductionPilotGate.js"), read("api/_lib/crmPipelineAccess.js"), read("api/_lib/crmCaseMutationHttp.js"),
  read("api/_lib/adminMembershipAccess.js"), read("api/_lib/adminMembershipHttp.js"), read("api/_lib/adminIdentityInvitationHttp.js"),
  read("src/crm-relational/mutationApi.ts"), read("src/admin-tenant/adminMode.ts"), read("src/admin-tenant/adminApi.ts"), read("src/App.tsx"),
  read("src/hub/HubWorkspace.tsx"), read("src/admin-tenant/AdminTenantMembershipModule.tsx"),
  read("scripts/validate-v17-hub-guard.mjs"),
]);

requireMatch(gate, /VERCEL_ENV === "production"[\s\S]*VERCEL_GIT_COMMIT_REF === "main"/, "la autoridad no verifica Production/main");
requireMatch(gate, /ACTIVATION_MANIFEST_SHA256[\s\S]*createHash\("sha256"\)/, "el manifiesto no está fijado por SHA-256");
requireMatch(gate, /tenantCode[\s\S]*deniedPermissions[\s\S]*effectivePermissions/, "el contexto tenant-first o deny no se valida");
for (const name of ["ADMIN_IDENTITY_INVITATIONS", "ADMIN_MEMBERSHIPS", "CRM_CASE_MUTATIONS"]) requireMatch(gate, new RegExp(`${name}: "${name}"`), `falta compuerta ${name}`);
for (const unsafe of ["PRODUCTION_WRITE", "ENABLED", "ALL_TENANTS"]) forbid(gate, new RegExp(`"${unsafe}"`), `modo ambiguo en autoridad focal: ${unsafe}`);
requireMatch(crmAccess, /requireCrmPipelineCaseMutation[\s\S]*PRODUCTION_PILOT/, "CRM no separa casos de mutaciones históricas");
requireMatch(crmAccess, /requireCrmPipelineMutation[\s\S]*PRODUCTION_PILOT[\s\S]*CRM_PIPELINE_MUTATIONS_DISABLED/, "mutaciones históricas no permanecen bloqueadas");
requireMatch(crmHttp, /gate\(env, req\)[\s\S]*resolveContext[\s\S]*requireV17ProductionPilotContext[\s\S]*readJsonObject/, "orden CRM configuración-auth-lote-body alterado");
requireMatch(adminAccess, /ADMIN_TENANT_MEMBERSHIP_MODE[\s\S]*ADMIN_IDENTITY_INVITATION_MODE/, "Administración e Invitaciones no poseen modos separados");
requireMatch(adminHttp, /requireAdminTenantMembershipAccess[\s\S]*resolveContext[\s\S]*requireAdminProductionPilotContext[\s\S]*readJsonObject/, "orden Administración alterado");
requireMatch(identityHttp, /requireAdminIdentityInvitationAccess[\s\S]*resolveContext[\s\S]*requireAdminProductionPilotContext/, "invitaciones administrativas no validan lote tras auth");
requireMatch(identityHttp, /resolveActivation[\s\S]*requireProductionPilotActivationTenant[\s\S]*activateNew/,
  "activación pública no resuelve invitación ni valida tenant del lote");
requireMatch(identityHttp, /V17_PRODUCTION_PILOT_ADMIN_EMAIL[\s\S]*expectedRecipientEmail/,
  "emisión y activación no fijan el destinatario productivo");
requireMatch(identityHttp, /ISSUE_PRODUCTION_PILOT_FIELDS = new Set\(\["requestId"\]\)[\s\S]*email: productionPilotRecipient\(env, mode\)/,
  "Production Pilot no separa el destinatario server-side del body público");
requireMatch(identityHttp, /invitationForMode[\s\S]*ADMIN_IDENTITY_INVITATION_MODES\.PRODUCTION_PILOT[\s\S]*invitationRef:/,
  "Production Pilot no publica un DTO de invitación cerrado sin destinatario");
requireMatch(mutationUi, /VITE_CRM_PIPELINE_CASE_MUTATION_MODE[\s\S]*PRODUCTION_PILOT/, "UI CRM no posee compuerta visual focal");
requireMatch(adminMode, /VITE_ADMIN_TENANT_MEMBERSHIP_MODE[\s\S]*VITE_ADMIN_IDENTITY_INVITATION_MODE/, "UI administrativa no separa visibilidad");
requireMatch(app, /isAdminIdentityActivationRoute\(\)[\s\S]*isAdminIdentityInvitationEnabled\(\)/, "activación lazy no depende de la compuerta de invitaciones");
requireMatch(hub, /invitationEnabled=\{adminInvitationsEnabled\}/, "Hub no transmite la compuerta focal de invitaciones");
requireMatch(hub, /invitationMode=\{adminInvitationMode\}/, "Hub no transmite el modo corporativo de invitación");
requireMatch(adminModule, /invitationEnabled && ADMIN_PERMISSIONS\.every/, "acciones de invitación no fallan cerradas visualmente");
requireMatch(adminModule, /Destinatario corporativo configurado[\s\S]*Generar invitación corporativa/,
  "la UI Production Pilot no presenta el flujo corporativo sin email manual");
requireMatch(adminApi, /issueCorporateInvitation[\s\S]*JSON\.stringify\(\{ requestId: crypto\.randomUUID\(\) \}\)/,
  "el cliente Production Pilot intenta enviar un destinatario");
requireMatch(hubGuard, /"api\/_lib\/v17ProductionPilotGate\.js"/, "la guardia Hub no reconoce la autoridad focal exacta");
forbid(hubGuard, /api\/_lib\/\*|path\.startsWith\("api\/_lib"\)/, "la guardia Hub amplió la allowlist backend");
for (const source of [mutationUi, adminMode, adminApi, app, hub, adminModule]) {
  forbid(source, /V17_PRODUCTION_PILOT_ACTIVATION_(?:BATCH|MANIFEST|MANIFEST_SHA256)/, "autoridad server-only incluida en frontend");
  forbid(source, /x-osi-|location\.(?:search|hash)|localStorage.*PRODUCTION_PILOT|sessionStorage.*PRODUCTION_PILOT/i, "autoridad frontend falsificable");
}

process.stdout.write(`${JSON.stringify({ ok: true, assertions: 32 }, null, 2)}\n`);
