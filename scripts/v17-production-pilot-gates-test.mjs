import { createHash, randomUUID } from "node:crypto";
import {
  V17_PRODUCTION_PILOT_BATCH,
  V17_PRODUCTION_PILOT_GATES,
  requireV17ProductionPilotContext,
  requireV17ProductionPilotTenant,
  resolveV17ProductionPilotActivation,
} from "../api/_lib/v17ProductionPilotGate.js";
import {
  requireCrmPipelineCaseMutation,
  requireCrmPipelineMutation,
  resolveCrmPipelineModes,
} from "../api/_lib/crmPipelineAccess.js";
import { createCrmCaseMutationHandler } from "../api/_lib/crmCaseMutationHttp.js";
import { createAdminMembershipCollectionHandler } from "../api/_lib/adminMembershipHttp.js";
import {
  createAdminIdentityActivationHandler,
  createAdminIdentityInvitationCollectionHandler,
} from "../api/_lib/adminIdentityInvitationHttp.js";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function manifestFor(gates = Object.values(V17_PRODUCTION_PILOT_GATES).sort()) {
  const raw = canonical({ batch: V17_PRODUCTION_PILOT_BATCH, tenants: [{ code: "PILOT-TENANT", gates }], version: 1 });
  return { raw, hash: createHash("sha256").update(raw, "utf8").digest("hex") };
}
function productionEnvironment(gates) {
  const manifest = manifestFor(gates);
  return {
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
    COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
    COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED", COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
    V17_PRODUCTION_PILOT_ACTIVATION_BATCH: V17_PRODUCTION_PILOT_BATCH,
    V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST: manifest.raw,
    V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST_SHA256: manifest.hash,
    V17_PRODUCTION_PILOT_ADMIN_EMAIL: "pilot-admin@example.invalid",
  };
}
const allPermissions = [
  "membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status",
  "pipeline:create", "pipeline:update:any",
];
const context = Object.freeze({
  tenantId: "tenant-internal", tenantCode: "PILOT-TENANT", membershipId: "member-internal", userId: "user-internal",
  role: "A", userStatus: "ACTIVE", membershipStatus: "ACTIVE", tenantStatus: "ACTIVE",
  effectivePermissions: allPermissions, deniedPermissions: [],
});
function response() {
  const headers = new Map();
  return { statusCode: 200, body: undefined, setHeader(k, v) { headers.set(String(k).toLowerCase(), v); }, getHeader(k) { return headers.get(String(k).toLowerCase()); }, removeHeader(k) { headers.delete(String(k).toLowerCase()); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; }, end() { return this; }, headers };
}
function request(method = "GET", body = undefined, query = undefined) {
  return { method, url: "/", query, body, rawHeaders: [], socket: { localAddress: "10.0.0.5", remoteAddress: "203.0.113.10" }, headers: { host: "pilot.example.invalid", origin: "https://pilot.example.invalid", "x-forwarded-proto": "https", "content-type": "application/json" } };
}
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }

try {
  const base = productionEnvironment();
  const activation = resolveV17ProductionPilotActivation(base);
  check("manifest canónico y hash exactos", activation.batch === V17_PRODUCTION_PILOT_BATCH && activation.version === 1);
  for (const gate of Object.values(V17_PRODUCTION_PILOT_GATES)) {
    check(`tenant autorizado para ${gate}`, requireV17ProductionPilotTenant(activation, context.tenantCode, gate) === context.tenantCode);
  }
  for (const [name, overrides] of [
    ["entorno Preview", { VERCEL_ENV: "preview" }],
    ["rama distinta", { VERCEL_GIT_COMMIT_REF: "feature/other" }],
    ["batch alterado", { V17_PRODUCTION_PILOT_ACTIVATION_BATCH: `${V17_PRODUCTION_PILOT_BATCH}-OTHER` }],
    ["hash alterado", { V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST_SHA256: "0".repeat(64) }],
    ["manifest vacío", { V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST: "" }],
    ["tenancy parcial", { COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }],
  ]) {
    let rejected = false;
    try { resolveV17ProductionPilotActivation({ ...base, ...overrides }); } catch { rejected = true; }
    check(`${name} falla cerrado`, rejected);
  }
  for (const value of ["PRODUCTION_WRITE", "ENABLED", "ALL_TENANTS", true, "production_pilot", "PRODUCTION_PILOT "]) {
    let rejected = false;
    try { requireCrmPipelineCaseMutation({ ...base, CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ", CRM_PIPELINE_MUTATION_MODE: value, CRM_PIPELINE_ACTIVATION_BATCH: "CRM-01B3B1-PRODUCTION-V1" }); } catch { rejected = true; }
    check(`modo CRM ambiguo rechazado: ${JSON.stringify(value)}`, rejected);
  }
  for (const [name, changed] of [
    ["User inactivo", { userStatus: "INACTIVE" }],
    ["Membership suspendida", { membershipStatus: "SUSPENDED" }],
    ["Tenant inactivo", { tenantStatus: "INACTIVE" }],
    ["rol manipulado", { role: "V" }],
    ["permiso ausente", { effectivePermissions: allPermissions.filter((p) => p !== "membership:view") }],
    ["deny prevalece", { deniedPermissions: ["membership:view"] }],
    ["tenant fuera del lote", { tenantCode: "OTHER-TENANT" }],
  ]) {
    let rejected = false;
    try { requireV17ProductionPilotContext(activation, { ...context, ...changed }, V17_PRODUCTION_PILOT_GATES.ADMIN_MEMBERSHIPS, { A: allPermissions.slice(0, 4) }); } catch { rejected = true; }
    check(name, rejected);
  }

  const crmEnv = { ...base, CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ", CRM_PIPELINE_MUTATION_MODE: "PRODUCTION_PILOT", CRM_PIPELINE_ACTIVATION_BATCH: "CRM-01B3B1-PRODUCTION-V1" };
  check("CRM focal reconoce PRODUCTION_PILOT", resolveCrmPipelineModes(crmEnv).mutationMode === "PRODUCTION_PILOT");
  let historicalBlocked = false;
  try { requireCrmPipelineMutation(crmEnv); } catch (error) { historicalBlocked = error?.status === 409; }
  check("owner/transiciones históricas permanecen 409", historicalBlocked);
  let crmDomainCalls = 0;
  const crm = createCrmCaseMutationHandler({
    env: crmEnv, prismaClient: {}, method: "POST", resolveContext: async () => context,
    execute: async () => { crmDomainCalls += 1; return { case: { caseRef: randomUUID(), version: 1 }, replayed: false }; }, status: 201,
  });
  const crmOk = await invoke(crm, request("POST", { requestId: randomUUID(), payloadHash: "a".repeat(64) }));
  check("CRM productivo focal alcanza dominio autorizado", crmOk.statusCode === 201 && crmDomainCalls === 1);
  let bodyReads = 0;
  const blockedReq = request("POST");
  Object.defineProperty(blockedReq, "body", { get() { bodyReads += 1; throw new Error("body read"); } });
  const crmBlocked = createCrmCaseMutationHandler({ env: crmEnv, prismaClient: {}, method: "POST", resolveContext: async () => ({ ...context, tenantCode: "OTHER-TENANT" }), execute: async () => { throw new Error("domain"); } });
  check("CRM fuera del lote se bloquea antes del body", (await invoke(crmBlocked, blockedReq)).statusCode === 403 && bodyReads === 0);

  const adminEnv = { ...base, ADMIN_TENANT_MEMBERSHIP_MODE: "PRODUCTION_PILOT" };
  let listCalls = 0;
  const admin = createAdminMembershipCollectionHandler({ env: adminEnv, prisma: {}, resolveContext: async () => context, list: async () => { listCalls += 1; return { data: [], total: 0, page: 1, pageSize: 20 }; } });
  check("Administración productiva focal autorizada", (await invoke(admin, request())).statusCode === 200 && listCalls === 1);
  const crmOnlyEnv = { ...productionEnvironment([V17_PRODUCTION_PILOT_GATES.CRM_CASE_MUTATIONS]), ADMIN_TENANT_MEMBERSHIP_MODE: "PRODUCTION_PILOT" };
  const wrongGate = createAdminMembershipCollectionHandler({ env: crmOnlyEnv, prisma: {}, resolveContext: async () => context, list: async () => { throw new Error("list"); } });
  check("una compuerta no habilita otra", (await invoke(wrongGate, request())).statusCode === 403);

  const invitationEnv = { ...base, ADMIN_IDENTITY_INVITATION_MODE: "PRODUCTION_PILOT" };
  let invitationCalls = 0;
  const invitations = createAdminIdentityInvitationCollectionHandler({ env: invitationEnv, prisma: {}, resolveContext: async () => context, list: async () => { invitationCalls += 1; return []; } });
  check("Invitaciones productivas focales autorizadas", (await invoke(invitations, request())).statusCode === 200 && invitationCalls === 1);
  let issueCalls = 0;
  const issueInvitation = createAdminIdentityInvitationCollectionHandler({
    env: invitationEnv, prisma: {}, resolveContext: async () => context,
    issue: async () => { issueCalls += 1; return { invitation: {}, activationPath: null, shownOnce: false }; },
  });
  check("destinatario distinto al congelado se bloquea antes de emitir", (await invoke(issueInvitation, request("POST", {
    requestId: randomUUID(), email: "different-admin@example.invalid",
  }))).statusCode === 400 && issueCalls === 0);
  check("destinatario congelado alcanza emisión", (await invoke(issueInvitation, request("POST", {
    requestId: randomUUID(), email: "pilot-admin@example.invalid",
  }))).statusCode === 201 && issueCalls === 1);
  let activationCalls = 0;
  const token = `ai1.${"A".repeat(43)}`;
  const activationHandler = createAdminIdentityActivationHandler({
    env: invitationEnv,
    prisma: {},
    resolveActivation: async () => ({ mode: "NEW_IDENTITY", tenantCode: "PILOT-TENANT" }),
    activateNew: async () => { activationCalls += 1; return { activated: true, loginRequired: true }; },
  });
  const activationOk = await invoke(activationHandler, request("POST", { action: "ACTIVATE", token, name: "Persona sintética", password: "Synthetic-Password-1!" }));
  check("activación pública exige tenant y lote", activationOk.statusCode === 200 && activationCalls === 1);
  const activationWrongTenant = createAdminIdentityActivationHandler({
    env: invitationEnv,
    prisma: {},
    resolveActivation: async () => ({ mode: "NEW_IDENTITY", tenantCode: "OTHER-TENANT" }),
    activateNew: async () => { throw new Error("must not activate"); },
  });
  check("token de tenant ajeno es indistinguible", (await invoke(activationWrongTenant, request("POST", { action: "ACTIVATE", token, name: "Persona sintética", password: "Synthetic-Password-1!" }))).body?.error === "ADMIN_IDENTITY_ACTIVATION_INVALID");

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
