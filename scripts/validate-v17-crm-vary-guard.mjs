import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const EXPECTED_ROUTES = Object.freeze({
  "api/crm/client-options.js": "createCrmPipelineReadHandler",
  "api/crm/pipeline-cases/index.js": ["createCrmPipelineReadHandler", "createCrmCaseMutationHandler"],
  "api/crm/pipeline-cases/[caseKey]/index.js": ["createCrmPipelineReadHandler", "createCrmCaseMutationHandler"],
  "api/crm/pipeline-summary.js": "createCrmPipelineReadHandler",
  "api/crm/pipeline-owner-options.js": "createCrmOwnerCatalogHandler",
  "api/crm/pipeline-cases/[caseKey]/allowed-transitions.js": "createAllowedTransitionsHandler",
  "api/crm/pipeline-cases/[caseKey]/transition.js": "createTransitionHandler",
  "api/crm/pipeline-cases/[caseKey]/assign-owner.js": "createAssignOwnerHandler",
  "api/crm/pipeline-cases/[caseKey]/unassign-owner.js": "createUnassignOwnerHandler",
  "api/crm/icp-v2/clients/search.js": "createCrmIcpClientSearchHandler",
  "api/crm/icp-v2/pipeline-cases/index.js": "createCrmIcpV2CreateHandler",
  "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js": "createCrmIcpV2DetailHandler",
  "api/crm/services/cases/[caseRef].js": "createCrmServicesHandler",
  "api/crm/services/catalog/index.js": "createCrmServicesHandler",
  "api/crm/services/catalog/[serviceRef].js": "createCrmServicesHandler",
  "api/crm/services/defaults/index.js": "createCrmServicesHandler",
  "api/crm/services/catalog-modes/index.js": "createCrmServicesHandler",
  "api/crm/services/configurations/[caseRef].js": "createCrmServicesHandler",
  "api/crm/services/configurations/conflicts/[conflictRef].js": "createCrmServicesHandler",
  "api/crm/services/material-policies/index.js": "createCrmServicesHandler",
  "api/crm/services/modes/index.js": "createCrmServicesHandler",
  "api/crm/services/packages/index.js": "createCrmServicesHandler",
  "api/crm/survey/assignments/index.js": "createCrmSurveyHandler",
  "api/crm/survey/assignments/[assignmentRef].js": "createCrmSurveyHandler",
  "api/crm/survey/scheduling/index.js": "createCrmSurveyHandler",
  "api/crm/survey/catalog/index.js": "createCrmSurveyHandler",
  "api/crm/survey/drafts/[surveyRef].js": "createCrmSurveyHandler",
  "api/crm/survey/drafts/[surveyRef]/photos.js": "prepareCrmSurveyRequest",
  "api/crm/survey/drafts/[surveyRef]/publish.js": "createCrmSurveyHandler",
  "api/crm/survey/publications/[publicationRef].js": "createCrmSurveyHandler",
  "api/crm/survey/publications/[publicationRef]/pdf.js": "prepareCrmSurveyRequest",
});

const FACTORY_ADAPTERS = Object.freeze({
  createCrmPipelineReadHandler: "api/_lib/crmPipelineReadHttp.js",
  createCrmCaseMutationHandler: "api/_lib/crmCaseMutationHttp.js",
  createCrmOwnerCatalogHandler: "api/_lib/crmOwnerCatalogHttp.js",
  createAllowedTransitionsHandler: "api/_lib/pipelineCaseMutationHttp.js",
  createTransitionHandler: "api/_lib/pipelineCaseMutationHttp.js",
  createAssignOwnerHandler: "api/_lib/pipelineCaseMutationHttp.js",
  createUnassignOwnerHandler: "api/_lib/pipelineCaseMutationHttp.js",
  createCrmIcpClientSearchHandler: "api/_lib/crmIcpV2ApiHttp.js",
  createCrmIcpV2CreateHandler: "api/_lib/crmIcpV2ApiHttp.js",
  createCrmIcpV2DetailHandler: "api/_lib/crmIcpV2ApiHttp.js",
  createCrmServicesHandler: "api/_lib/crmServicesHttp.js",
  createCrmSurveyHandler: "api/_lib/crmSurveyHttp.js",
  prepareCrmSurveyRequest: "api/_lib/crmSurveyHttp.js",
});

export const V17_CRM_VARY_ROUTES = Object.freeze(Object.keys(EXPECTED_ROUTES).sort());

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_CRM_VARY_GUARD: ${message}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function readSources(root) {
  const paths = [
    "api/_lib/crmHttpHeaders.js",
    "api/_lib/crmPipelineReadHttp.js",
    "api/_lib/crmCaseMutationHttp.js",
    "api/_lib/pipelineCaseMutationHttp.js",
    "api/_lib/crmOwnerCatalogHttp.js",
    "api/_lib/crmIcpV2ApiHttp.js",
    "api/_lib/crmServicesHttp.js",
    "api/_lib/crmSurveyHttp.js",
    ".github/workflows/ci.yml",
  ];
  return Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(root, path), "utf8")]));
}

function routeFiles(root) {
  return filesBelow(resolve(root, "api", "crm"))
    .filter((path) => /\.(?:js|ts)$/.test(path))
    .map((path) => relative(root, path).split(sep).join("/"))
    .sort();
}

function before(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  invariant(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, `${label}: orden de headers/gate inválido`);
}

export function validateV17CrmVaryGuard({
  root = process.cwd(),
  sources = readSources(root),
  routes = routeFiles(root),
  routeSourceOverrides = {},
} = {}) {
  const helper = sources["api/_lib/crmHttpHeaders.js"];
  const readHttp = sources["api/_lib/crmPipelineReadHttp.js"];
  const mutationHttp = sources["api/_lib/pipelineCaseMutationHttp.js"];
  const caseMutationHttp = sources["api/_lib/crmCaseMutationHttp.js"];
  const ownerHttp = sources["api/_lib/crmOwnerCatalogHttp.js"];
  const icpApiHttp = sources["api/_lib/crmIcpV2ApiHttp.js"];
  const servicesHttp = sources["api/_lib/crmServicesHttp.js"];
  const surveyHttp = sources["api/_lib/crmSurveyHttp.js"];
  const workflow = sources[".github/workflows/ci.yml"];

  invariant(/CRM_REQUIRED_VARY_TOKENS\s*=\s*Object\.freeze\(\["Authorization", "Origin"\]\)/.test(helper), "tokens requeridos alterados");
  invariant(helper.includes("token.toLowerCase()") && helper.includes("seen.has(lower)"), "deduplicación case-insensitive ausente");
  invariant(helper.includes('token === "*"'), "Vary wildcard no se elimina");
  invariant(helper.includes("...preserved, ...requiredByLower.values()"), "valores Vary previos no se preservan");
  invariant(helper.includes('res.setHeader("Cache-Control", "private, no-store")'), "cache privado ausente");
  invariant(helper.includes('removeHeader("Access-Control-Allow-Origin")'), "wildcard heredado no se retira");

  before(readHttp, "setCrmPrivateHeaders(res);", "requireCrmPipelineReadOnly(env);", "lecturas");
  before(caseMutationHttp, "setCrmPrivateHeaders(res);", "mode = gate(env, req);", "creación y edición de casos");
  before(mutationHttp, "setCrmPrivateHeaders(res);", "requireCrmPipelineMutationsLocal(env);", "mutaciones");
  before(ownerHttp, "setCrmPrivateHeaders(res);", "requireCrmPipelineMutationsLocal(env);", "owner catalog");
  before(icpApiHttp, "setCrmPrivateHeaders(res);", "resolveCrmIcpV2ApiMode(env, req);", "API ICP v2");
  before(servicesHttp, "setCrmPrivateHeaders(res);", "resolveCrmServicesApiMode(env, req);", "servicios");
  before(surveyHttp, "setCrmPrivateHeaders(res);", "resolveCrmSurveyApiMode(env, req);", "Survey");
  invariant(!/function appendVary\(/.test(mutationHttp), "mutaciones conservan combinador Vary paralelo");

  const expected = Object.keys(EXPECTED_ROUTES).sort();
  invariant(JSON.stringify(routes) === JSON.stringify(expected), "ruta CRM nueva o faltante sin cobertura Vary");
  for (const [path, factories] of Object.entries(EXPECTED_ROUTES)) {
    const source = routeSourceOverrides[path] ?? readFileSync(resolve(root, path), "utf8");
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    invariant(file.parseDiagnostics.length === 0, `${path} contiene sintaxis inválida`);
    const imported = new Map(); const calls = new Set();
    for (const statement of file.statements) {
      const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined;
      if (bindings && ts.isNamedImports(bindings) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const module = posix.normalize(posix.join(posix.dirname(path), statement.moduleSpecifier.text));
        for (const binding of bindings.elements) imported.set(binding.name.text, { name: binding.propertyName?.text || binding.name.text, module });
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const binding = imported.get(node.expression.text);
        if (binding && FACTORY_ADAPTERS[binding.name] === binding.module) calls.add(binding.name);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    invariant([].concat(factories).every((factory) => calls.has(factory)), `${path} evita el wrapper CRM esperado`);
    invariant(!/(?:setHeader|removeHeader)\(\s*["']Vary["']/i.test(source), `${path} sobrescribe Vary directamente`);
    invariant(!/Vary\s*:\s*["']\*/.test(source), `${path} declara Vary wildcard`);
  }

  for (const command of [
    "node scripts/v17-crm-vary-contract-test.mjs",
    "node scripts/validate-v17-crm-vary-guard.mjs",
    "node scripts/validate-v17-crm-vary-guard-test.mjs",
  ]) {
    invariant(workflow.includes(command), `CI no exige ${command}`);
  }

  return Object.freeze({ ok: true, routes: routes.length, wrappers: 7, requiredVary: ["Authorization", "Origin"] });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmVaryGuard(), null, 2)}\n`); }
  catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
