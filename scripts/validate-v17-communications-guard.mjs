import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path, overrides = {}) => overrides[path] ?? fs.readFileSync(new URL(path, ROOT), "utf8");
const requiredRoutes = [
  "/api/communications/templates", "/api/communications/templates/[templateRef]/versions",
  "/api/communications/templates/[templateRef]/publish", "/api/communications/templates/[templateRef]/inactivate",
  "/api/communications/variables", "/api/communications/preview", "/api/communications/recipients",
  "/api/communications/records", "/api/communications/prepare", "/api/communications/send",
];

export function validateCommunicationsGuard(overrides = {}) {
  const schema = read("prisma/schema.prisma", overrides);
  const migration = read("prisma/migrations/20260913010000_v17_communications_templates/migration.sql", overrides);
  const contract = read("api/_lib/communicationsContract.js", overrides);
  const domain = read("api/_lib/communicationsDomain.js", overrides);
  const http = read("api/_lib/communicationsHttp.js", overrides);
  const transport = read("api/_lib/communicationsTransport.js", overrides);
  const access = read("src/communications/access.ts", overrides);
  const mode = read("src/communications/mode.ts", overrides);
  const hub = read("src/hub/HubWorkspace.tsx", overrides);
  const inventory = JSON.parse(read("scripts/protected-cors-route-inventory.json", overrides));
  for (const model of ["CommunicationTemplate", "CommunicationTemplateVersion", "CommunicationRecord", "CommunicationCommand", "CommunicationAuditEvent"]) assert.match(schema, new RegExp(`model ${model}\\s*\\{`), `falta ${model}`);
  for (const predicate of ["communication_templates_tenant_code_key", "communication_template_versions_number_key", "communication_records_case_fkey", "communication_commands_actor_fkey", "communication_audit_events_actor_fkey"]) assert.ok(migration.includes(predicate), `invariante DB ausente: ${predicate}`);
  for (const guard of ["communication_template_guard", "communication_template_version_guard", "communication_record_guard", "communication_append_only"]) assert.ok(migration.includes(guard), `trigger ausente: ${guard}`);
  assert.ok(contract.includes("COMMUNICATION_VARIABLES") && contract.includes("COMMUNICATION_VARIABLE_NOT_ALLOWED") && contract.includes("assertCommunicationVariablesForContext"), "whitelist tipada/contextual ausente");
  assert.ok(contract.includes("COMMUNICATION_PAYLOAD_HASH_MISMATCH") && domain.includes("TransactionIsolationLevel.Serializable"), "idempotencia/concurrencia ausente");
  assert.ok(domain.includes("tenantId: context.tenantId") && domain.includes("recipientSnapshot") && domain.includes('status: "PREPARED"'), "autoridad tenant-first o snapshot ausente");
  assert.ok(/previewCommunication[\s\S]*assertCommunicationVariablesForContext\(input\.variables, input\.context\)/.test(domain), "preview debe validar variables contra su contexto");
  assert.ok(domain.includes("row.caseContactName") && domain.includes("row.caseContactEmailNormalized") && !domain.includes("row.client?.email") && !domain.includes("row.client?.phone"), "Client debe usar el contacto explícito del caso");
  assert.ok(http.includes("productionApiEnabled = false") && http.includes("COMMUNICATION_TRANSPORT_DISABLED"), "Production/transporte no cerrados");
  assert.ok(transport.includes("readonly = true") && ["EMAIL", "WHATSAPP", "SMS", "PORTAL", "INTERNAL"].every((channel) => new RegExp(`${channel}:\\s*false`).test(transport)) && transport.includes("COMMUNICATION_TRANSPORT_DISABLED"), "adaptador de transporte debe permanecer inactivo");
  assert.ok(http.includes('PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL"') && http.includes('COMMUNICATIONS_PREVIEW_BATCH = "V17-COMMUNICATIONS-PREVIEW-13B"'), "modo Preview cerrado ausente");
  for (const predicate of ["VERCEL_ENV === \"preview\"", "isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)", "COMMUNICATIONS_PREVIEW_MANIFEST_SHA256", "previewUrlAuthorized(env.DATABASE_URL)", "previewUrlAuthorized(env.DIRECT_URL)", "MT01B_AUTH_MODE === \"LEGACY\"", "VITE_MT01B2_CLIENT_ENABLED === \"false\"", "COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === \"DISABLED\"", "COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE === \"DISABLED\""]) assert.ok(http.includes(predicate), `predicado Preview backend ausente: ${predicate}`);
  assert.ok(http.includes("current_setting('neon.branch_id', true)") && http.includes("assertCommunicationsPreviewDatabase(prismaClient, mode)"), "identidad real de DB Preview no se revalida");
  assert.ok(http.indexOf("prepareCommunicationsRequest") < http.indexOf("resolveContext(req"), "gate debe preceder auth");
  assert.ok(access.includes("new Set(denied)") && access.includes("blocked.has(permission)"), "deny no prevalece");
  assert.ok(mode.includes('"LOCAL_ONLY"') && mode.includes('"PREVIEW_REHEARSAL"') && mode.includes("VITE_COMMUNICATIONS_PREVIEW_BATCH") && mode.includes("VITE_COMMUNICATIONS_TRANSPORT_MODE") && mode.includes("VITE_OSI_HUB_MODE") && mode.includes("VITE_CRM_PIPELINE_READ_MODE") && mode.includes("VERCEL"), "modo frontend fail-closed ausente");
  assert.ok(mode.includes('&& !Object.keys(environment).some((key) => key.toUpperCase().startsWith("VERCEL"))'), "modo local debe rechazar cualquier metadata Vercel");
  assert.ok(hub.indexOf("const communicationsAccess") < hub.indexOf("communicationsAdminAvailable") && hub.indexOf("communicationsAdminAvailable") < hub.indexOf("return <Suspense fallback={<div className=\"grid min-h-screen"), "autorización debe preceder render lazy admin");
  for (const route of requiredRoutes) assert.ok(inventory.categories.protectedSameOrigin.includes(route), `ruta CORS no inventariada: ${route}`);
  const forbiddenRuntime = ["twilio", "sendgrid", "nodemailer", "api.whatsapp", "wa.me/"];
  for (const token of forbiddenRuntime) assert.ok(!`${contract}\n${domain}\n${http}\n${transport}`.toLowerCase().includes(token), `transporte externo introducido: ${token}`);
  return { routes: requiredRoutes.length, models: 5 };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) console.log("V17-COMMUNICATIONS-GUARD", validateCommunicationsGuard());
