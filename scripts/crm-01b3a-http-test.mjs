import { createServer, request as httpRequest } from "node:http";
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

const enabled = { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_OWNER_REF_SECRET: "A".repeat(64) };
const context = Object.freeze({ tenantId: "tenant-server", membershipId: "membership-server" });
const receipt = Object.freeze({
  caseId: "case-1", commandType: "TRANSITION", previousVersion: 1, resultingVersion: 2,
  previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", resultingOwnerMembershipId: null, replayed: false,
});

function request({ method = "POST", body = {}, id = "case-1", idempotency = "crm01b3a.request-0001", rawHeaders, headers = {}, query = {}, url } = {}) {
  const allHeaders = { "content-type": "application/json", ...headers };
  if (idempotency !== null) allHeaders["idempotency-key"] = idempotency;
  return {
    method,
    body,
    query: { id, ...query },
    ...(url === undefined ? {} : { url }),
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

async function observeNodeHeaders(headers) {
  const requestHeaders = { ...headers, Connection: "close" };
  return await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const observed = { headers: req.headers, rawHeaders: req.rawHeaders };
      res.statusCode = 204;
      res.end();
      server.close(() => resolve(observed));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const client = httpRequest({ host: "127.0.0.1", port: address.port, path: "/", method: "POST", headers: requestHeaders }, (response) => response.resume());
      client.once("error", reject);
      client.end("{}");
    });
  });
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
check("DISABLED precede incluso al manejo OPTIONS", disabledOptions.statusCode === 409 && disabledOptions.body.code === "CRM_PIPELINE_MUTATIONS_DISABLED" && authCalls === 0 && executeCalls === 0 && !disabledOptions.getHeader("access-control-allow-origin") && !disabledOptions.getHeader("access-control-allow-methods"));

const invalidConfig = await invoke(createTransitionHandler({ env: { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", VERCEL_ENV: "preview" }, execute: successExecute(), resolveContext: async () => context }), request());
check("configuración inválida produce 503 sanitizado", invalidConfig.statusCode === 503 && invalidConfig.body.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
for (const [name, env, status, code] of [
  ["todo desactivado", {}, 409, "CRM_PIPELINE_MUTATIONS_DISABLED"],
  ["lectura local y mutación desactivada", { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" }, 409, "CRM_PIPELINE_MUTATIONS_DISABLED"],
  ["mutación local sin lectura", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
  ["ambas compuertas locales", enabled, 200, null],
  ["modo lectura residual", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY\n" }, 503, "CRM_PIPELINE_CONFIGURATION_INVALID"],
]) {
  const matrix = await invoke(createTransitionHandler({ env, execute: successExecute(), resolveContext: async () => context }), request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP" } }));
  check(`matriz coordinada: ${name}`, matrix.statusCode === status && (code === null || matrix.body.code === code));
}

const preflightHeaders = {
  origin: "http://localhost:5173",
  "access-control-request-method": "POST",
  "access-control-request-headers": "Authorization, Content-Type, Idempotency-Key",
};
const preflight = await invoke(createTransitionHandler({ env: enabled, execute: successExecute(), resolveContext: async () => { authCalls += 1; return context; } }), request({ method: "OPTIONS", idempotency: undefined, headers: preflightHeaders }));
check("preflight local exacto no autentica", preflight.statusCode === 204 && authCalls === 0 && preflight.getHeader("access-control-allow-origin") === "http://localhost:5173");
check("preflight congela métodos y headers", preflight.getHeader("access-control-allow-methods") === "POST, OPTIONS" && preflight.getHeader("access-control-allow-headers") === "Authorization, Content-Type, Idempotency-Key");
check("preflight no usa wildcard ni credenciales", preflight.getHeader("access-control-allow-origin") !== "*" && preflight.getHeader("access-control-allow-credentials") === undefined && !/x-osi/i.test(preflight.getHeader("access-control-allow-headers")));
check("preflight preserva Vary", /authorization/i.test(preflight.getHeader("vary")) && /origin/i.test(preflight.getHeader("vary")));
const rejectedOrigin = await invoke(createTransitionHandler({ env: enabled, execute: successExecute(), resolveContext: async () => { authCalls += 1; return context; } }), request({ method: "OPTIONS", idempotency: undefined, headers: { ...preflightHeaders, origin: "https://unauthorized.invalid" } }));
check("origen no autorizado controlado y sin CORS permisivo", rejectedOrigin.statusCode === 403 && rejectedOrigin.body.code === "CRM_PIPELINE_ORIGIN_FORBIDDEN" && !rejectedOrigin.getHeader("access-control-allow-origin") && authCalls === 0);
const rejectedHeaders = await invoke(createTransitionHandler({ env: enabled, execute: successExecute(), resolveContext: async () => context }), request({ method: "OPTIONS", idempotency: undefined, headers: { ...preflightHeaders, "access-control-request-headers": "Authorization, x-osi-role" } }));
check("preflight rechaza x-osi", rejectedHeaders.statusCode === 400 && rejectedHeaders.body.code === "CRM_PIPELINE_CORS_PREFLIGHT_INVALID" && !rejectedHeaders.getHeader("access-control-allow-origin"));

const transition = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: successExecute({
  command: "transition compone sólo ruta/header/body",
  value: { caseId: "case-1", requestId: "crm01b3a.request-0001", expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null },
}) });
const transitionOk = await invoke(transition, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null } }));
check("transición devuelve selección segura", transitionOk.statusCode === 200 && transitionOk.body.command.resultingVersion === 2 && transitionOk.body.command.owner === null && transitionOk.body.command.commandId === undefined);
check("respuesta no expone campos internos", !JSON.stringify(transitionOk.body).match(/tenantId|ownerUserId|actor|payloadHash|committedAt|requestId/));
check("snapshot éxito estable", JSON.stringify(transitionOk.body) === JSON.stringify({ ok: true, command: { caseId: "case-1", commandType: "TRANSITION", previousVersion: 1, resultingVersion: 2, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }));
const corsSuccess = await invoke(transition, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, headers: { origin: "http://localhost:5173" } }));
check("respuesta empresarial aplica CORS sólo al origen permitido", corsSuccess.statusCode === 200 && corsSuccess.getHeader("access-control-allow-origin") === "http://localhost:5173" && /origin/i.test(corsSuccess.getHeader("vary")) && /authorization/i.test(corsSuccess.getHeader("vary")));

const assignReceipt = { ...receipt, commandType: "ASSIGN_OWNER", previousStatus: "NEW_INBOX", resultingStatus: "NEW_INBOX", resultingOwnerMembershipId: "owner-membership" };
const assign = createAssignOwnerHandler({ env: enabled, resolveContext: async () => context, resolveOwnerRef: async (_context, ownerRef) => {
  check("assign recibe sólo ownerRef público", ownerRef === "owner-ref-opaque");
  return "owner-membership";
}, execute: async (_ctx, command) => {
  check("assign compone comando canónico", JSON.stringify(command) === JSON.stringify({ caseId: "case-1", requestId: "crm01b3a.request-0001", expectedVersion: 1, ownerMembershipId: "owner-membership" }));
  return assignReceipt;
} });
const assignOk = await invoke(assign, request({ body: { expectedVersion: 1, ownerRef: "owner-ref-opaque" } }));
check("assign no expone identidad interna", assignOk.statusCode === 200 && assignOk.body.command.owner?.assigned === true && !JSON.stringify(assignOk.body).match(/membershipId|ownerUserId|owner-ref-opaque/));

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
check("GET rechaza mutación local sin lectura como configuración inválida", readDisabled.statusCode === 503 && readDisabled.body.code === "CRM_PIPELINE_CONFIGURATION_INVALID");
const allowedHead = await invoke(allowed, request({ method: "HEAD", idempotency: undefined, headers: {}, rawHeaders: [], body: undefined }));
check("HEAD permitido no emite body", allowedHead.statusCode === 200 && allowedHead.body === undefined && allowedHead.ended === true);
const allowedPreflight = await invoke(allowed, request({ method: "OPTIONS", idempotency: undefined, headers: { origin: "http://127.0.0.1:5173", "access-control-request-method": "GET", "access-control-request-headers": "Authorization" } }));
check("preflight GET congela GET HEAD OPTIONS", allowedPreflight.statusCode === 204 && allowedPreflight.getHeader("access-control-allow-methods") === "GET, HEAD, OPTIONS");
const methodRejected = await invoke(transition, request({ method: "PATCH" }));
check("método alternativo devuelve 405 estable", methodRejected.statusCode === 405 && methodRejected.getHeader("allow") === "POST, OPTIONS");
check("snapshot 405 estable", JSON.stringify(methodRejected.body) === JSON.stringify({ ok: false, error: "Method Not Allowed", allowed: ["POST", "OPTIONS"] }));

for (const [name, req] of [
  ["Idempotency-Key ausente", request({ idempotency: null })],
  ["Idempotency-Key duplicado", request({ rawHeaders: ["Idempotency-Key", "crm01b3a.request-0001", "idempotency-key", "crm01b3a.request-0001"] })],
  ["Idempotency-Key unido por coma", request({ idempotency: "crm01b3a.request-0001,crm01b3a.request-0002", rawHeaders: undefined })],
  ["Idempotency-Key array", { ...request(), headers: { "content-type": "application/json", "idempotency-key": ["crm01b3a.request-0001"] }, rawHeaders: null }],
  ["Idempotency-Key con espacios", request({ idempotency: " crm01b3a.request-0001" })],
  ["Idempotency-Key con BOM", request({ idempotency: "\uFEFFcrm01b3a.request-0001" })],
  ["Idempotency-Key con CRLF", request({ idempotency: "crm01b3a.request-0001\r\n" })],
  ["Idempotency-Key no ASCII", request({ idempotency: "crm01b3a.solicitud-á" })],
  ["Idempotency-Key corto", request({ idempotency: "short" })],
  ["Idempotency-Key excesivo", request({ idempotency: `a${"b".repeat(191)}` })],
]) {
  const res = await invoke(transition, req);
  check(`${name} rechazado`, res.statusCode === 400 && res.body.code === "CRM_PIPELINE_COMMAND_INVALID");
}

const nodeSingle = await observeNodeHeaders({ "Content-Type": "application/json", "Idempotency-Key": "crm01b3a.request-node-1" });
check("IncomingMessage representa header único de forma escalar", nodeSingle.headers["idempotency-key"] === "crm01b3a.request-node-1" && nodeSingle.rawHeaders.filter((value) => String(value).toLowerCase() === "idempotency-key").length === 1);
const nodeDuplicate = await observeNodeHeaders({ "Content-Type": "application/json", "Idempotency-Key": ["crm01b3a.request-node-1", "crm01b3a.request-node-2"] });
check("IncomingMessage preserva duplicados en rawHeaders", nodeDuplicate.rawHeaders.filter((value) => String(value).toLowerCase() === "idempotency-key").length === 2 && /,/.test(nodeDuplicate.headers["idempotency-key"]));
const nodeDuplicateRejected = await invoke(transition, { ...request(), headers: { ...request().headers, ...nodeDuplicate.headers }, rawHeaders: nodeDuplicate.rawHeaders });
check("representación Node duplicada se rechaza", nodeDuplicateRejected.statusCode === 400 && nodeDuplicateRejected.body.code === "CRM_PIPELINE_COMMAND_INVALID");

for (const [name, req] of [
  ["caseId ausente", request({ id: null })],
  ["caseId array", request({ id: ["case-1", "case-2"] })],
  ["caseId con barra", request({ id: "case/1" })],
  ["caseId con NUL", request({ id: "case\u00001" })],
  ["caseId excesivo", request({ id: `c${"a".repeat(191)}` })],
  ["segmento adicional", request({ url: "/api/crm/pipeline-cases/case-1/extra/transition" })],
  ["segmento encoded", request({ url: "/api/crm/pipeline-cases/%63ase-1/transition" })],
  ["segmento doble encoded", request({ url: "/api/crm/pipeline-cases/%2563ase-1/transition" })],
  ["query caseId conflictiva", request({ query: { caseId: "forged" } })],
  ["query requestId prohibida", request({ query: { requestId: "forged" } })],
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

let bodyReads = 0;
const bodyOnce = request({ body: undefined });
Object.defineProperty(bodyOnce, "body", { get() { bodyReads += 1; return { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }; } });
check("getter body se lee exactamente una vez", (await invoke(transition, bodyOnce)).statusCode === 200 && bodyReads === 1);
const explicitEmptyHandler = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: successExecute() });
const explicitEmpty = await invoke(explicitEmptyHandler, request({ body: {}, headers: { "content-length": "2" } }));
check("objeto vacío explícito llega al contrato de comando", explicitEmpty.statusCode === 200);
const invalidUtf8 = await invoke(transition, request({ body: Buffer.from([0xc3, 0x28]) }));
check("UTF-8 inválido devuelve 400", invalidUtf8.statusCode === 400 && invalidUtf8.body.code === "REQUEST_JSON_INVALID");
let deep = { value: 1 };
for (let index = 0; index < 70; index += 1) deep = { nested: deep };
const tooDeep = await invoke(transition, request({ body: deep }));
check("profundidad excesiva controlada", tooDeep.statusCode === 400 && tooDeep.body.code === "REQUEST_JSON_TOO_DEEP");
const polluted = await invoke(transition, request({ body: '{"expectedVersion":1,"toStatus":"AWAITING_ICP","__proto__":{"polluted":true}}' }));
check("prototype pollution rechazada", polluted.statusCode === 400 && polluted.body.code === "REQUEST_JSON_UNSAFE_KEYS" && ({}).polluted === undefined);
const chunked = request({ body: undefined });
delete chunked.body;
chunked[Symbol.asyncIterator] = async function* chunks() { yield Buffer.alloc(2_048, 0x20); yield Buffer.alloc(2_049, 0x20); };
const chunkedTooLarge = await invoke(transition, chunked);
check("chunked excesivo se corta en bytes", chunkedTooLarge.statusCode === 413 && chunkedTooLarge.body.code === "REQUEST_BODY_TOO_LARGE");

const duplicateAuthorization = await invoke(transition, { ...request(), rawHeaders: ["Authorization", "Bearer first", "authorization", "Bearer second", "content-type", "application/json", "idempotency-key", "crm01b3a.request-0001"] });
check("Authorization duplicado se rechaza antes del contexto", duplicateAuthorization.statusCode === 401 && duplicateAuthorization.body.code === "COMMERCIAL_AUTH_INVALID");

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
const authDatabaseFailure = createTransitionHandler({ env: enabled, resolveContext: async () => { throw new CommercialTenancyError("COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE", 503); }, execute: successExecute() });
const authDatabaseResponse = await invoke(authDatabaseFailure, request());
check("falla de autenticación en base conserva 503 sanitizado", authDatabaseResponse.statusCode === 503 && authDatabaseResponse.body.code === "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE" && !JSON.stringify(authDatabaseResponse.body).match(/sql|prisma|stack|postgresql/i));
const unexpected = createTransitionHandler({ env: enabled, resolveContext: async () => context, execute: async () => { throw new Error("postgresql://secret SQL constraint stack"); } });
const unexpectedResponse = await invoke(unexpected, request({ body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null } }));
check("error inesperado se sanitiza como 503", unexpectedResponse.statusCode === 503 && unexpectedResponse.body.code === "CRM_PIPELINE_DATABASE_UNAVAILABLE" && !JSON.stringify(unexpectedResponse.body).includes("secret"));

console.log(JSON.stringify({ ok: results.every((item) => item.passed), assertions: results.length, results }, null, 2));
