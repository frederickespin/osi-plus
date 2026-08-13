import { mockResponse } from "./mt-01b1-test-helpers.mjs";
import {
  CRM_PIPELINE_ACTIVATION_BATCH,
  assertCrmAuthorizationHeader,
  requireCrmPipelineMutation,
  requireCrmPipelineRead,
  resolveCrmPipelineModes,
} from "../api/_lib/crmPipelineAccess.js";
import { createPipelineCasesListHandler } from "../api/crm/pipeline-cases/index.js";
import { createPipelineCaseDetailHandler } from "../api/crm/pipeline-cases/[id].js";
import { createPipelineSummaryHandler } from "../api/crm/pipeline-summary.js";
import { createTransitionHandler, createAssignOwnerHandler, createUnassignOwnerHandler, createAllowedTransitionsHandler } from "../api/_lib/pipelineCaseMutationHttp.js";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function rejected(name, env, code = "CRM_PIPELINE_CONFIGURATION_INVALID") {
  let error;
  try { resolveCrmPipelineModes(env); } catch (caught) { error = caught; }
  check(name, error?.status === 503 && error?.code === code);
}
function request(method = "GET", body = undefined) {
  return { method, headers: {}, rawHeaders: [], query: { id: "case-1" }, body };
}
async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

const localRead = { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" };
const localWrite = { ...localRead, CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" };
const productionBase = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ",
  CRM_PIPELINE_ACTIVATION_BATCH,
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
};
const productionWrite = { ...productionBase, CRM_PIPELINE_MUTATION_MODE: "PRODUCTION_WRITE" };

try {
  check("ausencia total queda DISABLED/DISABLED", JSON.stringify(resolveCrmPipelineModes({})) === JSON.stringify({ readMode: "DISABLED", mutationMode: "DISABLED", production: false }));
  check("DISABLED explícito permitido", resolveCrmPipelineModes({ CRM_PIPELINE_RUNTIME_MODE: "DISABLED", CRM_PIPELINE_MUTATION_MODE: "DISABLED" }).readMode === "DISABLED");
  check("READ_ONLY/DISABLED local permitido", resolveCrmPipelineModes(localRead).readMode === "READ_ONLY");
  check("READ_ONLY/LOCAL_ONLY local permitido", resolveCrmPipelineModes(localWrite).mutationMode === "LOCAL_ONLY");
  check("PRODUCTION_READ/DISABLED permitido con autoridad exacta", resolveCrmPipelineModes(productionBase).production === true);
  check("PRODUCTION_READ/PRODUCTION_WRITE permitido con autoridad exacta", resolveCrmPipelineModes(productionWrite).mutationMode === "PRODUCTION_WRITE");

  for (const [name, env] of [
    ["batch residual con modos ausentes", { CRM_PIPELINE_ACTIVATION_BATCH }],
    ["batch residual con DISABLED", { CRM_PIPELINE_RUNTIME_MODE: "DISABLED", CRM_PIPELINE_MUTATION_MODE: "DISABLED", CRM_PIPELINE_ACTIVATION_BATCH }],
    ["mutación local sin lectura", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }],
    ["lectura desactivada con escritura productiva", { ...productionWrite, CRM_PIPELINE_RUNTIME_MODE: "DISABLED" }],
    ["lectura productiva y escritura local", { ...productionBase, CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }],
    ["lectura local y escritura productiva", { ...localRead, CRM_PIPELINE_MUTATION_MODE: "PRODUCTION_WRITE" }],
    ["producción sin batch", { ...productionBase, CRM_PIPELINE_ACTIVATION_BATCH: undefined }],
    ["producción con batch incorrecto", { ...productionBase, CRM_PIPELINE_ACTIVATION_BATCH: "CRM-01B3B1-PRODUCTION-V0" }],
    ["producción en Preview", { ...productionBase, VERCEL_ENV: "preview" }],
    ["producción sin Git ref", { ...productionBase, VERCEL_GIT_COMMIT_REF: undefined }],
    ["producción con otra rama", { ...productionBase, VERCEL_GIT_COMMIT_REF: "feature/example" }],
    ["producción sin tenancy comercial", { ...productionBase, COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY", COMMERCIAL_TENANCY_ACTIVATION_BATCH: undefined }],
    ["producción con HYBRID", { ...productionBase, MT01B_AUTH_MODE: "HYBRID" }],
    ["producción con tenant switch", { ...productionBase, MT01B_TENANT_SWITCH_ENABLED: "true" }],
    ["producción con cliente V2", { ...productionBase, VITE_MT01B2_CLIENT_ENABLED: "true" }],
    ["modo local en Vercel", { ...localRead, VERCEL_ENV: "development" }],
  ]) rejected(name, env);

  for (const [field, exact] of [
    ["CRM_PIPELINE_RUNTIME_MODE", "READ_ONLY"],
    ["CRM_PIPELINE_MUTATION_MODE", "LOCAL_ONLY"],
    ["CRM_PIPELINE_ACTIVATION_BATCH", CRM_PIPELINE_ACTIVATION_BATCH],
  ]) {
    for (const suffix of [" ", "\n", "\r\n", '"', "\uFEFF"]) {
      const env = field === "CRM_PIPELINE_RUNTIME_MODE" ? { ...localRead } : field === "CRM_PIPELINE_MUTATION_MODE" ? { ...localWrite } : { ...productionBase };
      env[field] = suffix === '"' ? `"${exact}"` : `${suffix}${exact}`;
      rejected(`${field} rechaza representación ${JSON.stringify(suffix)}`, env);
    }
  }

  check("gate lectura habilita ambos modos de lectura", requireCrmPipelineRead(localRead) === "READ_ONLY" && requireCrmPipelineRead(productionBase) === "PRODUCTION_READ");
  check("gate mutación habilita local y producción", requireCrmPipelineMutation(localWrite) === "LOCAL_ONLY" && requireCrmPipelineMutation(productionWrite) === "PRODUCTION_WRITE");
  let disabledRead;
  try { requireCrmPipelineRead({}); } catch (error) { disabledRead = error; }
  check("lectura desactivada conserva 409", disabledRead?.status === 409 && disabledRead?.code === "CRM_PIPELINE_DISABLED");
  let disabledMutation;
  try { requireCrmPipelineMutation({}); } catch (error) { disabledMutation = error; }
  check("mutación desactivada conserva 409", disabledMutation?.status === 409 && disabledMutation?.code === "CRM_PIPELINE_MUTATIONS_DISABLED");

  for (const headers of [
    { headers: { authorization: ["Bearer one", "Bearer two"] }, rawHeaders: null },
    { headers: { authorization: "Bearer one,Bearer two" }, rawHeaders: null },
    { headers: { authorization: "Bearer one" }, rawHeaders: ["Authorization", "Bearer one", "authorization", "Bearer two"] },
  ]) {
    let error;
    try { assertCrmAuthorizationHeader(headers); } catch (caught) { error = caught; }
    check("Authorization ambiguo rechazado", error?.status === 401 && error?.code === "COMMERCIAL_AUTH_INVALID");
  }

  let authCalls = 0;
  let queryCalls = 0;
  const readPrisma = {
    pipelineCase: {
      count: () => { queryCalls += 1; return Promise.resolve(0); },
      findMany: () => { queryCalls += 1; return Promise.resolve([]); },
      findFirst: () => { queryCalls += 1; return Promise.resolve(null); },
      groupBy: () => { queryCalls += 1; return Promise.resolve([]); },
    },
    $transaction: (operations) => Promise.all(operations),
  };
  const permission = async () => { authCalls += 1; return Object.freeze({ tenantId: "tenant-server" }); };
  const readHandlers = [
    createPipelineCasesListHandler({ env: {}, prismaClient: readPrisma, requirePermission: permission }),
    createPipelineCaseDetailHandler({ env: {}, prismaClient: readPrisma, requirePermission: permission }),
    createPipelineSummaryHandler({ env: {}, prismaClient: readPrisma, requirePermission: permission }),
  ];
  for (const handler of readHandlers) {
    const response = await invoke(handler, request("POST"));
    check("lectura DISABLED precede método, auth y Prisma", response.statusCode === 409 && response.body.error === "CRM_PIPELINE_DISABLED" && authCalls === 0 && queryCalls === 0);
    check("lectura DISABLED no emite cookie", response.getHeader("set-cookie") === undefined && response.getHeader("cache-control") === "private, no-store");
  }

  let mutationAuth = 0;
  let mutationExec = 0;
  const mutationOptions = {
    env: {},
    resolveContext: async () => { mutationAuth += 1; return {}; },
    execute: async () => { mutationExec += 1; return {}; },
  };
  const mutationHandlers = [
    createTransitionHandler(mutationOptions),
    createAssignOwnerHandler(mutationOptions),
    createUnassignOwnerHandler(mutationOptions),
    createAllowedTransitionsHandler({ ...mutationOptions, requireReadMode: () => {} }),
  ];
  for (const handler of mutationHandlers) {
    const response = await invoke(handler, request("DELETE", {}));
    check("mutación DISABLED precede método, auth y dominio", response.statusCode === 409 && response.body.code === "CRM_PIPELINE_MUTATIONS_DISABLED" && mutationAuth === 0 && mutationExec === 0);
    check("mutación DISABLED no emite cookie", response.getHeader("set-cookie") === undefined && response.getHeader("cache-control") === "private, no-store");
  }

  let contextCalls = 0;
  let executeCalls = 0;
  const activeTransition = createTransitionHandler({
    env: productionWrite,
    resolveContext: async () => { contextCalls += 1; return Object.freeze({ tenantId: "tenant-server", membershipId: "membership-server" }); },
    execute: async () => {
      executeCalls += 1;
      return Object.freeze({ caseId: "case-1", commandType: "TRANSITION", previousVersion: 1, resultingVersion: 2, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", resultingOwnerMembershipId: null, replayed: false });
    },
  });
  const active = await invoke(activeTransition, {
    method: "POST",
    url: "/api/crm/pipeline-cases/case-1/transition",
    headers: { "content-type": "application/json", "idempotency-key": "crm01b3b1.production-1" },
    rawHeaders: ["content-type", "application/json", "idempotency-key", "crm01b3b1.production-1"],
    query: { id: "case-1" },
    body: { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null },
  });
  check("PRODUCTION_WRITE simulado llega al dominio", active.statusCode === 200 && contextCalls === 1 && executeCalls === 1);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
