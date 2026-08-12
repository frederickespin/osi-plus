import { mockResponse } from "./mt-01b1-test-helpers.mjs";
import { CommercialTenancyError } from "../api/_lib/commercialTenancyWrite.js";
import {
  createAllowedTransitionsHandler,
  createAssignOwnerHandler,
  createTransitionHandler,
  createUnassignOwnerHandler,
  resolveCrmPipelineMutationMode,
} from "../api/_lib/pipelineCaseMutationHttp.js";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

const enabled = { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" };
const context = Object.freeze({ tenantId: "tenant-server", membershipId: "membership-server" });
const receipt = Object.freeze({
  caseId: "case-1", commandType: "TRANSITION", previousVersion: 1, resultingVersion: 2,
  previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", resultingOwnerMembershipId: null, replayed: false,
});

function request({ method = "POST", body = {}, id = "case-1", idempotency = "crm01b3a.request-0001", rawHeaders, headers = {}, query = {} } = {}) {
  const allHeaders = { "content-type": "application/json", ...headers };
  if (idempotency !== undefined) allHeaders["idempotency-key"] = idempotency;
  return {
    method,
    body,
    query: { id, ...query },
    headers: allHeaders,
    rawHeaders: rawHeaders ?? Object.entries(allHeaders).flat(),
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

function successExecute(expected = {}) {
  return async (_context, command) => {
    if (expected.command) check(expected.command, JSON.stringify(command) === JSON.stringify(expected.value), command);
    return receipt;
  };
}

for (const value of ["LOCAL_ONLY ", " local_only", "local_only", "\uFEFFLOCAL_ONLY", "LOCAL_ONLY\n", "\"LOCAL_ONLY\"", "UNKNOWN", ""]){
  let error;
  try { resolveCrmPipelineMutationMode({ CRM_PIPELINE_MUTATION_MODE: value }); } catch (caught) { error = caught; }
  check(`modo no canónico rechazado: ${JSON.stringify(value)}`, error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
}
check("modo ausente queda DISABLED", resolveCrmPipelineMutationMode({}) === "DISABLED");
check("DISABLED exacto permitido", resolveCrmPipelineMutationMode({ CRM_PIPELINE_MUTATION_MODE: "DISABLED" }) === "DISABLED");
for (const vercel of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_URL: "preview.invalid" }]) {
  let error;
  try { resolveCrmPipelineMutationMode({ CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", ...vercel }); } catch (caught) { error = caught; }
  check(`LOCAL_ONLY bloqueado por ${Object.keys(vercel)[0]}`, error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
}

let authCalls = 0;
let executeCalls = 0;
const disabledHandler = createTransitionHandler({
  env: {},
  resolveContext: async () => { authCalls += 1; return context; },
  execute: async () => { executeCalls += 1; return receipt; },
});
const disabledReq = request();
Object.defineProperty(disabledReq, "body", { get() { throw new Error("body must remain unread"); } });
const disabled = await invoke(disabledHandler, disabledReq);
check("DISABLED responde 409 antes de auth/body/Prisma", disabled.statusCode === 409 && disabled.body.code === "CRM_PIPELINE_MUTATIONS_DISABLED" && authCalls === 0 && executeCalls === 0);
check("DISABLED no emite cookie y no se cachea", !disabled.getHeader("set-cookie") && disabled.getHeader("cache-control") === "private, no-store" && /authorization/i.test(disabled.getHeader("vary")));
const disabledOptions = await invoke(disabledHandler, request({ method: "OPTIONS" }));
check("DISABLED precede incluso al manejo OPTIONS", disabledOptions.statusCode === 409 && disabledOptions.body.code === "CRM_PIPELINE_MUTATIONS_DISABLED" && authCalls === 0 && executeCalls === 0);

const invalidConfig = await invoke(createTransitionHandler({ env: { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", VERCEL_ENV: "preview" }, execute: successExecute(), resolveContext: async () => context }), request());
check("configuración inválida produce 503 sanitizado", invalidConfig.statusCode === 503 && invalidConfig.body.code === "CRM_PIPELINE_CONFIGURATION_INVALID");

const transition = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: successExecute({
  command: "transition compone sólo ruta/header/body",
  value: { caseId: "case-1", requestId: "crm01b3a.request-0001", expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null },
}) });
const transitionOk = await invoke(transition, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null } }));
check("transición devuelve selección segura", transitionOk.statusCode === 200 && transitionOk.body.command.resultingVersion === 2 && transitionOk.body.command.owner === null && transitionOk.body.command.commandId === undefined);
check("respuesta no expone campos internos", !JSON.stringify(transitionOk.body).match(/tenantId|ownerUserId|actor|payloadHash|committedAt|requestId/));

const assignReceipt = { ...receipt, commandType: "ASSIGN_OWNER", previousStatus: "NEW_INBOX", resultingStatus: "NEW_INBOX", resultingOwnerMembershipId: "owner-membership" };
const assign = createAssignOwnerHandler({ env: enabled, resolveContext: async () => context, execute: async (_ctx, command) => {
  check("assign compone comando canónico", JSON.stringify(command) === JSON.stringify({ caseId: "case-1", requestId: "crm01b3a.request-0001", expectedVersion: 1, ownerMembershipId: "owner-membership" }));
  return assignReceipt;
} });
const assignOk = await invoke(assign, request({ body: { expectedVersion: 1, ownerMembershipId: "owner-membership" } }));
check("assign expone sólo membership de owner", assignOk.statusCode === 200 && assignOk.body.command.owner?.membershipId === "owner-membership" && !JSON.stringify(assignOk.body).includes("ownerUserId"));

const unassign = createUnassignOwnerHandler({ env: enabled, resolveContext: async () => context, execute: async (_ctx, command) => {
  check("unassign compone comando canónico", JSON.stringify(command) === JSON.stringify({ caseId: "case-1", requestId: "crm01b3a.request-0001", expectedVersion: 1 }));
  return { ...receipt, commandType: "UNASSIGN_OWNER" };
} });
check("unassign funciona sin campos adicionales", (await invoke(unassign, request({ body: { expectedVersion: 1 } }))).statusCode === 200);

const allowed = createAllowedTransitionsHandler({
  env: enabled,
  requireReadMode: (env) => { if (env.CRM_PIPELINE_RUNTIME_MODE !== "READ_ONLY") throw new CommercialTenancyError("CRM_PIPELINE_DISABLED", 409); },
  resolveContext: async () => context,
  execute: async (_ctx, caseId) => ({ caseId, version: 4, status: "QUOTE_SENT", transitions: [{ toStatus: "NEGOTIATION", evidenceType: null }, { toStatus: "LOST", evidenceType: null }] }),
});
const allowedOk = await invoke(allowed, request({ method: "GET", idempotency: undefined, headers: {}, rawHeaders: [], body: undefined }));
check("allowed-transitions selecciona campos seguros", allowedOk.statusCode === 200 && allowedOk.body.case.transitions.length === 2 && !JSON.stringify(allowedOk.body).includes("tenant"));
const readDisabled = await invoke(createAllowedTransitionsHandler({ env: { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }, requireReadMode: () => { throw new CommercialTenancyError("CRM_PIPELINE_DISABLED", 409); }, resolveContext: async () => context, execute: async () => ({}) }), request({ method: "GET", idempotency: undefined, headers: {}, rawHeaders: [] }));
check("GET respeta también compuerta de lectura", readDisabled.statusCode === 409 && readDisabled.body.code === "CRM_PIPELINE_DISABLED");

for (const [name, req] of [
  ["Idempotency-Key ausente", request({ idempotency: null })],
  ["Idempotency-Key duplicado", request({ rawHeaders: ["Idempotency-Key", "crm01b3a.request-0001", "idempotency-key", "crm01b3a.request-0001"] })],
  ["Idempotency-Key con espacios", request({ idempotency: " crm01b3a.request-0001" })],
  ["Idempotency-Key corto", request({ idempotency: "short" })],
]) {
  const res = await invoke(transition, req);
  check(`${name} rechazado`, res.statusCode === 400 && res.body.code === "CRM_PIPELINE_COMMAND_INVALID");
}

for (const field of ["tenantId", "userId", "actorUserId", "actorMembershipId", "ownerUserId", "ownerId", "role", "permissions", "requestId", "resultingVersion", "payloadHash", "statusChangedAt", "createdAt", "updatedAt", "unknown"]) {
  const res = await invoke(transition, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null, [field]: "forged" } }));
  check(`campo ${field} rechazado`, res.statusCode === 400 && res.body.code === "CRM_PIPELINE_COMMAND_INVALID");
}

for (const [name, req, expectedCode, expectedStatus] of [
  ["body vacío", request({ body: {}, headers: { "content-length": "0" } }), "REQUEST_JSON_REQUIRED", 400],
  ["body no objeto", request({ body: [] }), "REQUEST_JSON_OBJECT_REQUIRED", 400],
  ["content-type inválido", request({ body: {}, headers: { "content-type": "text/plain" } }), "REQUEST_CONTENT_TYPE_INVALID", 415],
  ["body excesivo", request({ body: { expectedVersion: 1, toStatus: "A".repeat(5000) } }), "REQUEST_BODY_TOO_LARGE", 413],
  ["JSON truncado", request({ body: "{\"expectedVersion\":" }), "REQUEST_JSON_INVALID", 400],
]) {
  const res = await invoke(transition, req);
  check(`${name} controlado`, res.statusCode === expectedStatus && res.body.code === expectedCode);
}

for (const [code, status, options] of [
  ["CRM_PIPELINE_COMMAND_INVALID", 400, {}], ["CRM_PIPELINE_PERMISSION_FORBIDDEN", 403, {}],
  ["CRM_PIPELINE_RESOURCE_NOT_FOUND", 404, {}], ["CRM_PIPELINE_STATE_INVALID", 409, {}],
  ["CRM_PIPELINE_VERSION_CONFLICT", 409, { recoverable: true }], ["CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409, {}],
  ["CRM_PIPELINE_OWNER_INELIGIBLE", 409, {}], ["CRM_PIPELINE_EVIDENCE_REQUIRED", 409, {}],
  ["CRM_PIPELINE_EVIDENCE_INVALID", 409, {}], ["CRM_PIPELINE_COMMAND_IN_PROGRESS", 409, { recoverable: true, retryAfterMs: 111 }],
  ["CRM_PIPELINE_DATABASE_UNAVAILABLE", 503, { recoverable: true }],
]) {
  const handler = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: async () => { throw { code, status, ...options }; } });
  const res = await invoke(handler, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null } }));
  check(`error ${code} conserva contrato`, res.statusCode === status && res.body.code === code && (code !== "CRM_PIPELINE_COMMAND_IN_PROGRESS" || (res.body.recoverable === true && res.body.retryAfterMs === 111)));
  check(`error ${code} no expone internos`, !JSON.stringify(res.body).match(/sql|prisma|stack|postgresql|secret/i) && !res.getHeader("set-cookie"));
}

const authFailure = createTransitionHandler({ env: enabled, resolveContext: async () => { throw new CommercialTenancyError("COMMERCIAL_AUTH_REQUIRED", 401); }, execute: successExecute() });
check("auth inválida conserva 401", (await invoke(authFailure, request())).statusCode === 401);
const unexpected = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: async () => { throw new Error("postgresql://secret SQL constraint stack"); } });
const unexpectedResponse = await invoke(unexpected, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null } }));
check("error inesperado se sanitiza como 503", unexpectedResponse.statusCode === 503 && unexpectedResponse.body.code === "CRM_PIPELINE_DATABASE_UNAVAILABLE" && !JSON.stringify(unexpectedResponse.body).includes("secret"));

console.log(JSON.stringify({ ok: results.every((item) => item.passed), assertions: results.length, results }, null, 2));
