import { createPipelineCasesListHandler } from "../api/crm/pipeline-cases/index.js";
import { createPipelineCaseDetailHandler } from "../api/crm/pipeline-cases/[caseKey]/index.js";
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
const CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PIPELINE_VIEW = "pipeline:view";
const ACTIVE_A = Object.freeze({
  tenantId: "tenant-active",
  membershipId: "membership-admin",
  userId: "user-admin",
  role: "A",
  effectivePermissions: Object.freeze([PIPELINE_VIEW]),
  deniedPermissions: Object.freeze([]),
});
const ACTIVE_V = Object.freeze({
  tenantId: "tenant-active",
  membershipId: "membership-sales",
  userId: "user-sales",
  role: "V",
  effectivePermissions: Object.freeze([PIPELINE_VIEW]),
  deniedPermissions: Object.freeze([]),
});

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function request(method, overrides = {}) {
  return {
    method,
    url: `/api/crm/pipeline-cases/${CASE_REF}`,
    query: { id: "case-1", caseRef: CASE_REF },
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

function permissionContext(context, counter = { calls: 0 }) {
  return async (_req, res, permission) => {
    counter.calls += 1;
    const role = String(context?.role || "");
    const permissions = Array.isArray(context?.effectivePermissions) ? context.effectivePermissions.map(String) : [];
    const denied = Array.isArray(context?.deniedPermissions) ? context.deniedPermissions.map(String) : [];
    const complete = Boolean(context?.tenantId && context?.membershipId && context?.userId && ["A", "V"].includes(role));
    if (!complete || permission !== PIPELINE_VIEW || !permissions.includes(permission) || denied.includes(permission)) {
      res.status(403).json({ ok: false, error: "COMMERCIAL_PERMISSION_FORBIDDEN" });
      return null;
    }
    return Object.freeze({ ...context });
  };
}

function detailRow() {
  return {
    publicRef: CASE_REF,
    ownerMembershipId: null,
    version: 1,
    caseCode: "CASE-1",
    mode: "LOCAL",
    serviceType: "MOVING",
    customerType: "L4_PERSONAL",
    status: "NEW_INBOX",
    estimatedCbm: null,
    requiresSurvey: false,
    surveyMethod: null,
    originLocation: null,
    destinationLocation: null,
    destinationContracted: null,
    assetsCount: 0,
    client: null,
    enterpriseOwner: null,
    _count: { quotes: 0, events: 0 },
    createdAt: new Date("2026-08-21T10:00:00.000Z"),
    updatedAt: new Date("2026-08-21T10:00:00.000Z"),
  };
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

  const activeAuth = { calls: 0 };
  const activeAdminPermission = permissionContext(ACTIVE_A, activeAuth);
  const activeSalesPermission = permissionContext(ACTIVE_V, activeAuth);
  let activeAdminListWhere;
  const activeList = await invoke(createPipelineCasesListHandler({
    env: localRead,
    requirePermission: activeAdminPermission,
    prismaClient: {
      pipelineCase: {
        count: async ({ where }) => { activeAdminListWhere = where; return 0; },
        findMany: async () => [],
      },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET", { query: {} }));
  check("lista GET A activa conserva contrato", activeList.statusCode === 200
    && activeList.body?.ok === true && activeList.body?.total === 0
    && activeList.body?.page === 1 && activeList.body?.pageSize === 50
    && Array.isArray(activeList.body?.data));
  check("lista A aplica alcance tenant-wide exacto", JSON.stringify(activeAdminListWhere) === JSON.stringify({ tenantId: ACTIVE_A.tenantId }), activeAdminListWhere);

  const activeSalesListWhere = [];
  const activeSalesList = await invoke(createPipelineCasesListHandler({
    env: localRead,
    requirePermission: activeSalesPermission,
    prismaClient: {
      pipelineCase: {
        count: async ({ where }) => { activeSalesListWhere.push(where); return 0; },
        findMany: async ({ where }) => { activeSalesListWhere.push(where); return []; },
      },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET", { query: {} }));
  const expectedSalesScope = {
    tenantId: ACTIVE_V.tenantId,
    ownerMembershipId: ACTIVE_V.membershipId,
    ownerUserId: ACTIVE_V.userId,
  };
  check("lista GET V activa conserva contrato", activeSalesList.statusCode === 200
    && activeSalesList.body?.ok === true && activeSalesList.body?.total === 0
    && activeSalesList.body?.page === 1 && activeSalesList.body?.pageSize === 50
    && Array.isArray(activeSalesList.body?.data));
  check("lista V filtra antes de conteo y paginación", activeSalesListWhere.length === 2
    && activeSalesListWhere.every((where) => JSON.stringify(where) === JSON.stringify(expectedSalesScope)), activeSalesListWhere);

  let activeAdminDetailWhere;
  const activeDetail = await invoke(createPipelineCaseDetailHandler({
    env: localRead,
    requirePermission: activeAdminPermission,
    prismaClient: {
      pipelineCase: { findFirst: async ({ where }) => {
        activeAdminDetailWhere = where;
        return detailRow();
      } },
    },
  }), request("GET", { query: { caseKey: CASE_REF } }));
  check("detalle GET A activo conserva contrato", activeDetail.statusCode === 200
    && activeDetail.body?.ok === true && activeDetail.body?.data?.caseRef === CASE_REF
    && activeDetail.body?.data?.owner === null);
  check("detalle A usa tenantId y publicRef", JSON.stringify(activeAdminDetailWhere) === JSON.stringify({
    tenantId: ACTIVE_A.tenantId,
    publicRef: CASE_REF,
  }), activeAdminDetailWhere);

  let activeSalesDetailWhere;
  const activeSalesDetail = await invoke(createPipelineCaseDetailHandler({
    env: localRead,
    requirePermission: activeSalesPermission,
    prismaClient: {
      pipelineCase: { findFirst: async ({ where }) => {
        activeSalesDetailWhere = where;
        return { ...detailRow(), ownerMembershipId: ACTIVE_V.membershipId };
      } },
    },
  }), request("GET", { query: { caseKey: CASE_REF } }));
  check("detalle GET V activo conserva contrato", activeSalesDetail.statusCode === 200
    && activeSalesDetail.body?.ok === true && activeSalesDetail.body?.data?.caseRef === CASE_REF);
  check("detalle V exige ownership completo", JSON.stringify(activeSalesDetailWhere) === JSON.stringify({
    ...expectedSalesScope,
    publicRef: CASE_REF,
  }), activeSalesDetailWhere);

  const foreignSalesDetail = await invoke(createPipelineCaseDetailHandler({
    env: localRead,
    requirePermission: activeSalesPermission,
    prismaClient: { pipelineCase: { findFirst: async ({ where }) => {
      check("caso ajeno se consulta con ownership completo", JSON.stringify(where) === JSON.stringify({ ...expectedSalesScope, publicRef: CASE_REF }), where);
      return null;
    } } },
  }), request("GET", { query: { caseKey: CASE_REF } }));
  check("detalle ajeno V produce 404 indistinguible", foreignSalesDetail.statusCode === 404
    && JSON.stringify(foreignSalesDetail.body) === JSON.stringify({ ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }), foreignSalesDetail.body);

  let invalidRefPrismaCalls = 0;
  let invalidRefAuthCalls = 0;
  const invalidRefHandler = createPipelineCaseDetailHandler({
    env: localRead,
    requirePermission: async (...args) => {
      invalidRefAuthCalls += 1;
      return permissionContext(ACTIVE_A)(...args);
    },
    prismaClient: {
      pipelineCase: { findFirst: async () => { invalidRefPrismaCalls += 1; return null; } },
    },
  });
  const invalidRefs = [
    undefined,
    "",
    "cmf0historicalcuid123456789",
    CASE_REF.toUpperCase(),
    ` ${CASE_REF}`,
    `${CASE_REF} `,
    `\uFEFF${CASE_REF}`,
    `${CASE_REF}\r\n`,
    "%2F%2Fevil.invalid",
    "%252F%252Fevil.invalid",
    "../case",
    "x".repeat(10_000),
    [CASE_REF, CASE_REF],
  ];
  for (const invalidRef of invalidRefs) {
    const response = await invoke(invalidRefHandler, request("GET", { query: { caseKey: invalidRef } }));
    check("referencia pública inválida produce 404 uniforme", response.statusCode === 404
      && response.body?.error === "CRM_PIPELINE_RESOURCE_NOT_FOUND"
      && JSON.stringify(response.body) === JSON.stringify({ ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }));
  }
  check("auth precede validación de referencia", invalidRefAuthCalls === invalidRefs.length, invalidRefAuthCalls);
  check("referencia inválida se rechaza antes de Prisma", invalidRefPrismaCalls === 0, invalidRefPrismaCalls);

  const activeAdminSummary = await invoke(createPipelineSummaryHandler({
    env: localRead,
    requirePermission: activeAdminPermission,
    prismaClient: {
      pipelineCase: { groupBy: async () => [], count: async () => 0 },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET"));
  check("resumen GET A activo conserva contrato", activeAdminSummary.statusCode === 200
    && activeAdminSummary.body?.ok === true && activeAdminSummary.body?.data?.total === 0
    && activeAdminSummary.body?.data?.assigned === 0 && activeAdminSummary.body?.data?.unassigned === 0);

  const activeSalesSummaryWhere = [];
  const activeSalesSummary = await invoke(createPipelineSummaryHandler({
    env: localRead,
    requirePermission: activeSalesPermission,
    prismaClient: {
      pipelineCase: {
        groupBy: async ({ where }) => { activeSalesSummaryWhere.push(where); return []; },
        count: async ({ where }) => { activeSalesSummaryWhere.push(where); return 0; },
      },
      $transaction: (operations) => Promise.all(operations),
    },
  }), request("GET"));
  check("resumen GET V activo conserva contrato", activeSalesSummary.statusCode === 200
    && activeSalesSummary.body?.ok === true && activeSalesSummary.body?.data?.total === 0);
  check("resumen V no filtra información mediante totales", activeSalesSummaryWhere.length === 3
    && activeSalesSummaryWhere.every((where) => where.tenantId === ACTIVE_V.tenantId
      && where.ownerMembershipId === ACTIVE_V.membershipId
      && where.ownerUserId === ACTIVE_V.userId), activeSalesSummaryWhere);
  check("GET activo autentica exactamente una vez por operación", activeAuth.calls === 7, activeAuth.calls);

  let incompleteContextPrismaCalls = 0;
  const unreachablePrisma = new Proxy({}, {
    get() {
      incompleteContextPrismaCalls += 1;
      throw new Error("Prisma no debe alcanzarse con contexto incompleto");
    },
  });
  const incompleteContexts = [
    ["sin User", { ...ACTIVE_A, userId: undefined }],
    ["sin Membership", { ...ACTIVE_A, membershipId: undefined }],
    ["sin Tenant", { ...ACTIVE_A, tenantId: undefined }],
    ["sin rol", { ...ACTIVE_A, role: undefined }],
    ["sin pipeline:view", { ...ACTIVE_A, effectivePermissions: [] }],
    ["deny prevalece", { ...ACTIVE_A, deniedPermissions: [PIPELINE_VIEW] }],
    ["V sin owner Membership", { ...ACTIVE_V, membershipId: undefined }],
    ["V sin owner User", { ...ACTIVE_V, userId: undefined }],
  ];
  for (const [scenario, context] of incompleteContexts) {
    const response = await invoke(createPipelineCasesListHandler({
      env: localRead,
      requirePermission: permissionContext(context),
      prismaClient: unreachablePrisma,
    }), request("GET", { query: {} }));
    check(`contexto ${scenario} falla cerrado`, response.statusCode === 403
      && response.body?.error === "COMMERCIAL_PERMISSION_FORBIDDEN", response.body);
  }
  check("contextos incompletos se rechazan antes de Prisma", incompleteContextPrismaCalls === 0, incompleteContextPrismaCalls);

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
