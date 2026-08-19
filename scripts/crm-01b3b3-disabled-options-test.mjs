import { createPipelineCasesListHandler } from "../api/crm/pipeline-cases/index.js";
import { createPipelineCaseDetailHandler } from "../api/crm/pipeline-cases/[id].js";
import { createPipelineSummaryHandler } from "../api/crm/pipeline-summary.js";
import { createPipelineOwnerOptionsHandler } from "../api/crm/pipeline-owner-options.js";
import {
  createAllowedTransitionsHandler,
  createAssignOwnerHandler,
  createTransitionHandler,
  createUnassignOwnerHandler,
} from "../api/_lib/pipelineCaseMutationHttp.js";
import { mockResponse } from "./mt-01b1-test-helpers.mjs";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function request(method, overrides = {}) {
  return {
    method,
    url: "/api/crm/pipeline-cases/case-1",
    query: { id: "case-1" },
    headers: {},
    rawHeaders: [],
    ...overrides,
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

function privateContract(name, response, { status, code, empty = false } = {}) {
  check(`${name}: estado`, response.statusCode === status, response.statusCode);
  check(`${name}: código`, empty ? response.body === undefined : (response.body?.code ?? response.body?.error) === code, response.body);
  check(`${name}: cache`, response.getHeader("cache-control") === "private, no-store");
  const varyTokens = String(response.getHeader("vary") || "")
    .split(",").map((token) => token.trim()).filter(Boolean);
  const varyLower = varyTokens.map((token) => token.toLowerCase());
  check(`${name}: vary exacto`, varyLower.includes("authorization")
    && varyLower.includes("origin")
    && varyLower.filter((token) => token === "authorization").length === 1
    && varyLower.filter((token) => token === "origin").length === 1
    && !varyLower.includes("*"), response.getHeader("vary"));
  check(`${name}: sin CORS`, response.getHeader("access-control-allow-origin") === undefined
    && response.getHeader("access-control-allow-credentials") === undefined);
  check(`${name}: sin cookie`, response.getHeader("set-cookie") === undefined);
}

try {
  let authCalls = 0;
  let prismaCalls = 0;
  const prismaClient = new Proxy({}, { get() { prismaCalls += 1; throw new Error("Prisma no debe alcanzarse"); } });
  const requirePermission = async () => { authCalls += 1; throw new Error("Auth no debe alcanzarse"); };
  const reads = [
    ["lista", createPipelineCasesListHandler({ env: {}, prismaClient, requirePermission })],
    ["detalle", createPipelineCaseDetailHandler({ env: {}, prismaClient, requirePermission })],
    ["resumen", createPipelineSummaryHandler({ env: {}, prismaClient, requirePermission })],
  ];

  const hostileRequests = [
    ["externo", { headers: { origin: "https://attacker.invalid" }, rawHeaders: ["Origin", "https://attacker.invalid"] }],
    ["Bearer inválido", { headers: { authorization: "Bearer invalid" }, rawHeaders: ["Authorization", "Bearer invalid"] }],
    ["Content-Type irrelevante", { headers: { "content-type": "text/plain" }, rawHeaders: ["Content-Type", "text/plain"] }],
    ["headers duplicados", { headers: { authorization: "Bearer one" }, rawHeaders: ["Authorization", "Bearer one", "authorization", "Bearer two"] }],
  ];

  for (const [route, handler] of reads) {
    for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
      const response = await invoke(handler, request(method));
      privateContract(`${route} ${method} DISABLED`, response, {
        status: 409,
        code: "CRM_PIPELINE_DISABLED",
        empty: method === "HEAD",
      });
    }
    for (const [scenario, overrides] of hostileRequests) {
      const response = await invoke(handler, request("OPTIONS", overrides));
      privateContract(`${route} OPTIONS ${scenario}`, response, { status: 409, code: "CRM_PIPELINE_DISABLED" });
    }
  }
  check("DISABLED precede auth", authCalls === 0, authCalls);
  check("DISABLED precede Prisma", prismaCalls === 0, prismaCalls);

  for (const malformed of [
    { CRM_PIPELINE_RUNTIME_MODE: "\uFEFFREAD_ONLY" },
    { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY " },
    { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" },
  ]) {
    for (const [route, factory] of [
      ["lista", createPipelineCasesListHandler],
      ["detalle", createPipelineCaseDetailHandler],
      ["resumen", createPipelineSummaryHandler],
    ]) {
      for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
        const response = await invoke(factory({ env: malformed, prismaClient, requirePermission }), request(method));
        privateContract(`${route} ${method} configuración inválida`, response, {
          status: 503,
          code: "CRM_PIPELINE_CONFIGURATION_INVALID",
          empty: method === "HEAD",
        });
      }
    }
  }
  check("configuración inválida precede auth", authCalls === 0, authCalls);
  check("configuración inválida precede Prisma", prismaCalls === 0, prismaCalls);

  const localRead = { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" };
  for (const [route, factory] of [
    ["lista", createPipelineCasesListHandler],
    ["detalle", createPipelineCaseDetailHandler],
    ["resumen", createPipelineSummaryHandler],
  ]) {
    const response = await invoke(factory({ env: localRead, prismaClient, requirePermission }), request("OPTIONS"));
    check(`${route} OPTIONS activo conserva 204`, response.statusCode === 204 && response.ended === true);
    check(`${route} OPTIONS activo sin CORS`, response.getHeader("access-control-allow-origin") === undefined);
  }

  let activeAuthCalls = 0;
  const activePermission = async () => {
    activeAuthCalls += 1;
    return Object.freeze({ tenantId: "tenant-active" });
  };
  const activeList = await invoke(createPipelineCasesListHandler({
    env: localRead,
    requirePermission: activePermission,
    prismaClient: {
      pipelineCase: { count: async () => 0, findMany: async () => [] },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET", { query: {} }));
  check("lista GET activa conserva contrato", activeList.statusCode === 200
    && activeList.body?.ok === true && activeList.body?.total === 0
    && activeList.body?.page === 1 && activeList.body?.pageSize === 50
    && Array.isArray(activeList.body?.data));

  const activeDetail = await invoke(createPipelineCaseDetailHandler({
    env: localRead,
    requirePermission: activePermission,
    prismaClient: {
      pipelineCase: { findFirst: async () => ({
        id: "case-1", caseCode: "CASE-1", clientName: "Cliente", mode: "LOCAL",
        serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX",
        enterpriseOwner: null, _count: { quotes: 0, events: 0 },
      }) },
    },
  }), request("GET"));
  check("detalle GET activo conserva contrato", activeDetail.statusCode === 200
    && activeDetail.body?.ok === true && activeDetail.body?.data?.id === "case-1"
    && activeDetail.body?.data?.owner === null);

  const activeSummary = await invoke(createPipelineSummaryHandler({
    env: localRead,
    requirePermission: activePermission,
    prismaClient: {
      pipelineCase: { groupBy: async () => [], count: async () => 0 },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET"));
  check("resumen GET activo conserva contrato", activeSummary.statusCode === 200
    && activeSummary.body?.ok === true && activeSummary.body?.data?.total === 0
    && activeSummary.body?.data?.assigned === 0 && activeSummary.body?.data?.unassigned === 0);
  check("GET activo autentica exactamente una vez por ruta", activeAuthCalls === 3, activeAuthCalls);

  let mutationAuth = 0;
  let mutationExec = 0;
  const mutationOptions = {
    env: {},
    prismaClient,
    resolveContext: async () => { mutationAuth += 1; return {}; },
    execute: async () => { mutationExec += 1; return {}; },
  };
  const mutations = [
    ["owner options", createPipelineOwnerOptionsHandler(mutationOptions)],
    ["allowed transitions", createAllowedTransitionsHandler({ ...mutationOptions, requireReadMode: () => {} })],
    ["transition", createTransitionHandler(mutationOptions)],
    ["assign owner", createAssignOwnerHandler(mutationOptions)],
    ["unassign owner", createUnassignOwnerHandler(mutationOptions)],
  ];
  for (const [route, handler] of mutations) {
    for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
      const response = await invoke(handler, request(method));
      privateContract(`${route} ${method} DISABLED`, response, {
        status: 409,
        code: "CRM_PIPELINE_MUTATIONS_DISABLED",
        empty: method === "HEAD",
      });
    }
  }
  const invalidMutationOptions = {
    ...mutationOptions,
    env: { CRM_PIPELINE_MUTATION_MODE: "\uFEFFLOCAL_ONLY" },
  };
  const invalidMutations = [
    ["owner options", createPipelineOwnerOptionsHandler(invalidMutationOptions)],
    ["allowed transitions", createAllowedTransitionsHandler({ ...invalidMutationOptions, requireReadMode: () => {} })],
    ["transition", createTransitionHandler(invalidMutationOptions)],
    ["assign owner", createAssignOwnerHandler(invalidMutationOptions)],
    ["unassign owner", createUnassignOwnerHandler(invalidMutationOptions)],
  ];
  for (const [route, handler] of invalidMutations) {
    for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
      const response = await invoke(handler, request(method));
      privateContract(`${route} ${method} configuración inválida`, response, {
        status: 503,
        code: "CRM_PIPELINE_CONFIGURATION_INVALID",
        empty: method === "HEAD",
      });
    }
  }
  check("mutaciones DISABLED preceden auth", mutationAuth === 0, mutationAuth);
  check("mutaciones DISABLED preceden dominio", mutationExec === 0, mutationExec);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
