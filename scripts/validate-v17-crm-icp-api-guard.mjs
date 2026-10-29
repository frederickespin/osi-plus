import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { validateV17CrmIcpFoundationGuard } from "./validate-v17-crm-icp-foundation-guard.mjs";
import { MT01B3A_ROUTE_INVENTORY } from "./validate-mt01b3a-auth-guard.mjs";
import { PUBLIC_REFERENCE_CONTRACTS } from "./validate-v17-case-public-ref-guard.mjs";
import { validateV17HubGuard } from "./validate-v17-hub-guard.mjs";
import { CANONICAL_MIGRATIONS } from "./canonical-migrations.mjs";

const fail = (message) => { throw new Error(`V17_CRM_ICP_API_GUARD:${message}`); };
const requireMatch = (text, pattern, message) => { if (!pattern.test(text)) fail(message); };
const forbidMatch = (text, pattern, message) => { if (pattern.test(text)) fail(message); };

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

// Interpret only the pure assertion expressions, never the canonical runner or its database setup.
function evaluateRunnerAssertion(node, scope) {
  if (ts.isParenthesizedExpression(node)) return evaluateRunnerAssertion(node.expression, scope);
  if (ts.isIdentifier(node)) {
    if (!Object.hasOwn(scope, node.text)) throw new Error("identificador fuera del contrato");
    return scope[node.text];
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isObjectLiteralExpression(node) && node.properties.length === 0) return {};
  if (ts.isPropertyAccessExpression(node)) return evaluateRunnerAssertion(node.expression, scope)[node.name.text];
  if (ts.isElementAccessExpression(node)) return evaluateRunnerAssertion(node.expression, scope)[evaluateRunnerAssertion(node.argumentExpression, scope)];
  if (ts.isBinaryExpression(node)) {
    const left = evaluateRunnerAssertion(node.left, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return left && evaluateRunnerAssertion(node.right, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) return left || evaluateRunnerAssertion(node.right, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) return left === evaluateRunnerAssertion(node.right, scope);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const { expression: receiver, name } = node.expression;
    if (ts.isIdentifier(receiver) && node.arguments.length === 1) {
      const argument = () => evaluateRunnerAssertion(node.arguments[0], scope);
      if (receiver.text === "Object" && name.text === "keys") return Object.keys(argument());
      if (receiver.text === "Object" && name.text === "entries") return Object.entries(argument());
      if (receiver.text === "JSON" && name.text === "stringify") return JSON.stringify(argument());
    }
    const values = evaluateRunnerAssertion(receiver, scope);
    if (Array.isArray(values) && name.text === "sort" && node.arguments.length === 0) return [...values].sort();
    const callback = node.arguments[0];
    if (Array.isArray(values) && name.text === "every" && node.arguments.length === 1
      && ts.isArrowFunction(callback) && callback.parameters.length === 1 && !ts.isBlock(callback.body)) {
      return values.every((value) => {
        const binding = callback.parameters[0].name;
        const local = { ...scope };
        if (ts.isIdentifier(binding)) local[binding.text] = value;
        else if (ts.isArrayBindingPattern(binding)) {
          binding.elements.forEach((entry, index) => {
            if (!ts.isBindingElement(entry) || !ts.isIdentifier(entry.name) || entry.dotDotDotToken || entry.initializer) throw new Error("binding fuera del contrato");
            local[entry.name.text] = value[index];
          });
        } else throw new Error("binding fuera del contrato");
        return evaluateRunnerAssertion(callback.body, local);
      });
    }
  }
  throw new Error("expresión fuera del contrato");
}

function validateCanonicalIcpAssertions(source, publicReferenceContracts) {
  const file = ts.createSourceFile("run-canonical-db-tests.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const [name, module] of [["PUBLIC_REFERENCE_CONTRACTS", "./validate-v17-case-public-ref-guard.mjs"], ["CANONICAL_MIGRATIONS", "./canonical-migrations.mjs"]]) {
    if (!file.statements.some((statement) => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === module && statement.importClause?.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings)
      && statement.importClause.namedBindings.elements.some((element) => element.name.text === name && (element.propertyName?.text ?? name) === name))) {
      fail(`agregador canónico no importa el contrato ${name}`);
    }
  }
  const assertions = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "invariant" && node.arguments.length >= 1) assertions.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const uses = (node, name) => ts.isIdentifier(node) && node.text === name || Boolean(ts.forEachChild(node, (child) => uses(child, name) || undefined));
  const validate = (name, report, invalidReports) => {
    const predicates = assertions.filter((node) => uses(node, name));
    if (predicates.length !== 1) fail(`agregador canónico sin aserción única para ${name}`);
    const accepts = (candidate) => {
      try {
        return evaluateRunnerAssertion(predicates[0], { [name]: { report: candidate }, PUBLIC_REFERENCE_CONTRACTS: publicReferenceContracts, CANONICAL_MIGRATIONS }) === true;
      } catch { return false; }
    };
    if (!accepts(report) || invalidReports.some(accepts)) fail(`agregador canónico no valida el contrato de ${name}`);
  };
  for (const name of ["crmProductionGateGuardRun", "crmOwnerCatalogGuardRun"]) {
    validate(name, { ok: true, routes: 12 }, [{ ok: false, routes: 12 }, { ok: true, routes: 9 }, { ok: true, routes: 13 }]);
  }
  const consumerContracts = Object.fromEntries(Object.entries(publicReferenceContracts).map(([path, kinds]) => [path, { kinds: [...kinds] }]));
  const report = { ok: true, migrations: CANONICAL_MIGRATIONS.length, runtimeConsumers: Object.keys(consumerContracts).length, consumerContracts, runtimeConsumer: "api/_lib/crmPipelineRead.js", publicContract: "caseRef" };
  const withoutIcp = { ...consumerContracts }; delete withoutIcp["api/_lib/crmIcpV2ApiDomain.js"];
  validate("v17CasePublicRefGuardRun", report, [
    { ...report, ok: false }, { ...report, runtimeConsumers: report.runtimeConsumers - 1 },
    { ...report, consumerContracts: withoutIcp },
    { ...report, consumerContracts: { ...consumerContracts, "api/_lib/crmIcpV2ApiDomain.js": { kinds: ["CLIENT"] } } },
    { ...report, consumerContracts: { ...consumerContracts, "api/_lib/crmIcpV2ApiDomain.js": { kinds: ["CASE"] } } },
    { ...report, consumerContracts: { ...consumerContracts, "api/_lib/unclassified.js": { kinds: ["CASE"] } } },
  ]);
}

export function validateV17CrmIcpApiGuard({ root = process.cwd(), overrides = {}, authInventory = MT01B3A_ROUTE_INVENTORY, publicReferenceContracts = PUBLIC_REFERENCE_CONTRACTS } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  validateV17CrmIcpFoundationGuard({ root, overrides });
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (migrations.length < 22 || migrations.indexOf("20260831010000_v17_crm_icp_foundation") !== 21) {
    fail("la migración ICP debe conservar su posición canónica");
  }

  const foundation = read("api/_lib/crmIcpV2Domain.js");
  requireMatch(foundation, /productionApiEnabled:\s*false/, "productionApiEnabled dejó de estar en false");
  const http = read("api/_lib/crmIcpV2ApiHttp.js");
  for (const signature of [
    'DISABLED: "DISABLED"', 'LOCAL_ONLY: "LOCAL_ONLY"', 'PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL"',
    'CRM_ICP_V2_API_PREVIEW_BRANCH = "feature/v17-crm-icp-api-05b1"',
    'CRM_ICP_V2_API_PREVIEW_BATCH = "V17-CRM-ICP-05B1-PREVIEW"',
    'requireCrmPipelineExplicitlyDisabled(env)', 'COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED"',
  ]) if (!http.includes(signature)) fail(`runtime incompleto: ${signature}`);
  forbidMatch(http, /PRODUCTION_(?:WRITE|PILOT|READ)|VERCEL_ENV\s*===\s*"production"|V17_PRODUCTION_PILOT/, "runtime ICP contiene modo productivo");
  requireMatch(http, /mode === CRM_ICP_V2_API_MODES\.LOCAL_ONLY[\s\S]*hasVercelSignal\(env\)[\s\S]*!isRealLoopbackRequest\(req\)/, "LOCAL_ONLY no exige socket real y ausencia de Vercel");
  const handler = http.slice(http.indexOf("return withPrivateApiHeaders"));
  const gate = handler.indexOf("resolveCrmIcpV2ApiMode(env, req)");
  const origin = handler.indexOf("assertSameOrigin(req)");
  const auth = handler.indexOf("resolveContext(req");
  const body = handler.indexOf("readJsonObject(req");
  if (gate < 0 || origin < gate || auth < origin || body < auth) fail("orden gate -> origin -> auth -> body inválido");
  for (const signature of ["setCrmPrivateHeaders(res)", "withPrivateApiHeaders", "CRM_ICP_V2_API_DISABLED", "matchFingerprint"]) {
    if (!http.includes(signature)) fail(`protección HTTP ausente: ${signature}`);
  }

  const domain = read("api/_lib/crmIcpV2ApiDomain.js");
  for (const signature of [
    "normalizeCrmIcpV2CreateInput", "buildCrmIcpV2AtomicPlan", "next_icp_client_code", "pg_try_advisory_xact_lock",
    "appendCommercialAudit", "pipelineCaseRouteSnapshot.createMany", "routeContractVersion: 2", "pipelineCaseCommand.create",
    "CRM_PIPELINE_IDEMPOTENCY_CONFLICT", "CRM_ICP_V2_API_05B1", "PERMS.PIPELINE_CREATE_PENDING_DESTINATION",
  ]) if (!domain.includes(signature)) fail(`ejecutor atómico incompleto: ${signature}`);
  forbidMatch(domain, /MAX\s*\(|Math\.max\([^\n]*client|console\.(?:log|warn|error)\([^\n]*(?:phone|email|tax|address)/i, "código Client o PII usa autoridad insegura");
  const foundationVolumeContract = read("api/_lib/crmIcpV2Domain.js");
  const rootFieldContract = foundationVolumeContract.slice(
    foundationVolumeContract.indexOf("const ROOT_FIELDS"),
    foundationVolumeContract.indexOf("const UNSIGNED_ROOT_FIELDS"),
  );
  forbidMatch(rootFieldContract, /estimatedCbm/, "ICP volvió a aceptar volumen anticipado");
  requireMatch(foundationVolumeContract, /estimatedCbm:\s*null/, "ICP no fija volumen como pendiente");
  requireMatch(domain, /estimatedCbm:\s*0/, "marcador legacy de volumen dejó de ser cero no autoritativo");
  requireMatch(domain, /volume:\s*Object\.freeze\(\{\s*status:\s*"PENDING_SOURCE",\s*estimatedCbm:\s*null,\s*source:\s*null\s*\}\)/, "respuesta de volumen pendiente incompleta");
  requireMatch(domain, /m\."tenant_id"=\$\{tenantId\}\s+AND m\."id"=\$\{membershipId\}\s+AND m\."user_id"=\$\{userId\}/, "actor no se revalida tenant-first");
  requireMatch(foundationVolumeContract, /deriveMode\(tenantCountryCode,[\s\S]*command\.mode !== derivedMode/, "el modo no se deriva y verifica server-side desde la ruta");
  requireMatch(domain, /tenantId:\s*actor\.tenantId,\s*clientId,[\s\S]*addressRef:\s*\{\s*in:\s*refs\s*\}/, "ClientAddress no queda ligada a Tenant y Client");
  requireMatch(domain, /actor\.role === "V"\s*\?\s*\{\s*ownerMembershipId:\s*actor\.membershipId,\s*ownerUserId:\s*actor\.userId\s*\}/, "detalle V no exige owner completo");
  requireMatch(domain, /metadataJson:\s*plan\.audit/, "auditoría no usa metadata mínima del plan");
  forbidMatch(domain, /metadataJson:\s*\{[^}]*?(?:phone|email|taxId|street|address)/is, "auditoría copia PII");
  requireMatch(domain, /originLocation:\s*"ICP_V2_STRUCTURED_ROUTE"/, "texto legacy vuelve a ser autoridad de ruta");

  const rbac = read("api/_lib/rbac.js");
  requireMatch(rbac, /PIPELINE_CREATE_PENDING_DESTINATION:\s*"pipeline:create:pending-destination"/, "permiso pendiente ausente");
  requireMatch(rbac, /EXPLICIT_PIPELINE_MUTATION_PERMISSIONS[\s\S]*PERMS\.PIPELINE_CREATE_PENDING_DESTINATION/, "permiso pendiente se concede por rol baseline");

  const routes = {
    create: read("api/crm/icp-v2/pipeline-cases/index.js"),
    search: read("api/crm/icp-v2/clients/search.js"),
    detail: read("api/crm/icp-v2/pipeline-cases/[caseKey]/index.js"),
  };
  requireMatch(routes.create, /createCrmIcpV2CreateHandler[\s\S]*createCrmIcpV2Case/, "POST crear no delega al contrato ICP");
  requireMatch(routes.search, /createCrmIcpClientSearchHandler[\s\S]*searchCrmIcpClients/, "POST buscar no delega a búsqueda tenant-first");
  requireMatch(routes.detail, /createCrmIcpV2DetailHandler[\s\S]*findCrmIcpV2Case/, "GET detalle no delega a lectura v2");
  for (const source of Object.values(routes)) {
    forbidMatch(source, /req\.body|tenantId|membershipId|userId|clientId/, "ruta interpreta autoridad o ID interno");
  }
  for (const [route, handler] of [
    ["api/crm/icp-v2/clients/search.js", "createCrmIcpClientSearchHandler"],
    ["api/crm/icp-v2/pipeline-cases/[caseKey]/index.js", "createCrmIcpV2DetailHandler"],
    ["api/crm/icp-v2/pipeline-cases/index.js", "createCrmIcpV2CreateHandler"],
  ]) {
    const classification = authInventory[route];
    if (!classification) fail(`ruta fuera del inventario auth: ${route}`);
    if (classification.kind !== "TENANT" || classification.wrappedFactory !== true
      || !Array.isArray(classification.calls) || classification.calls.length !== 1
      || classification.calls[0].module !== "api/_lib/crmIcpV2ApiHttp.js"
      || classification.calls[0].name !== handler) {
      fail(`clasificación auth ICP incorrecta: ${route}`);
    }
  }
  const commercialWriteGuard = read("scripts/validate-mt01c2b3a-guard.mjs");
  requireMatch(commercialWriteGuard, /path === "api\/_lib\/crmIcpV2ApiDomain\.js"[\s\S]*no limita promoción por caso, tenant y revisión inicial/, "promoción ICP fuera del inventario comercial");
  requireMatch(commercialWriteGuard, /api\/_lib\/crmIcpV2ApiDomain\.js:client\.create[\s\S]*api\/_lib\/crmIcpV2ApiDomain\.js:pipelineCase\.create/, "creadores ICP fuera del inventario comercial");
  const icpReferences = publicReferenceContracts["api/_lib/crmIcpV2ApiDomain.js"];
  if (!Array.isArray(icpReferences) || icpReferences.length !== 2
    || !icpReferences.includes("CASE") || !icpReferences.includes("CLIENT")) {
    fail("dominio ICP fuera del contrato CASE/CLIENT del inventario publicRef");
  }
  const crm01aGuard = read("scripts/validate-crm-01a-guard.mjs");
  const crm01b1Guard = read("scripts/validate-crm-01b1-guard.mjs");
  const crm01b2Guard = read("scripts/validate-crm-01b2-guard.mjs");
  const corsInventory = read("scripts/protected-cors-route-inventory.json");
  const crm01b3b1Guard = read("scripts/validate-crm-01b3b1-guard.mjs");
  const crm01b3b3Guard = read("scripts/validate-crm-01b3b3-guard.mjs");
  const varyGuard = read("scripts/validate-v17-crm-vary-guard.mjs");
  const canonicalRunner = read("scripts/run-canonical-db-tests.mjs");
  requireMatch(crm01b1Guard, /RUNTIME_SERVICE_ALLOWLIST[\s\S]*api\/_lib\/crmIcpV2ApiDomain\.js/, "dominio ICP fuera del inventario journal");
  requireMatch(crm01b2Guard, /ICP_API_DOMAIN = "api\/_lib\/crmIcpV2ApiDomain\.js"/, "dominio ICP fuera del inventario de mutación");
  if (crm01b2Guard.split("CASE_MUTATION_DOMAIN, ICP_API_DOMAIN").length - 1 !== 2) {
    fail("dominio ICP fuera del inventario de mutación");
  }
  for (const path of ["/api/crm/icp-v2/clients/search", "/api/crm/icp-v2/pipeline-cases", "/api/crm/icp-v2/pipeline-cases/[caseKey]"]) {
    if (!corsInventory.includes(`\"${path}\"`)) fail(`ruta fuera del inventario CORS privado: ${path}`);
  }
  for (const [name, inventory] of [["CRM-01A", crm01aGuard], ["CRM-01B3B1", crm01b3b1Guard]]) {
    for (const path of Object.keys(routes).map((key) => ({
      create: "api/crm/icp-v2/pipeline-cases/index.js",
      search: "api/crm/icp-v2/clients/search.js",
      detail: "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js",
    })[key])) if (!inventory.includes(`\"${path}\"`)) fail(`ruta fuera del inventario ${name}: ${path}`);
  }
  requireMatch(varyGuard, /EXPECTED_ROUTES[\s\S]*"api\/crm\/icp-v2\/clients\/search\.js": "createCrmIcpClientSearchHandler"[\s\S]*"api\/crm\/icp-v2\/pipeline-cases\/index\.js": "createCrmIcpV2CreateHandler"[\s\S]*"api\/crm\/icp-v2\/pipeline-cases\/\[caseKey\]\/index\.js": "createCrmIcpV2DetailHandler"/, "rutas ICP fuera del inventario Vary");
  requireMatch(varyGuard, /api\/_lib\/crmIcpV2ApiHttp\.js/, "wrapper ICP fuera del inventario Vary");
  requireMatch(crm01b3b3Guard, /routes\.length === 12[\s\S]*crmIcpV2ApiHttp/, "rutas ICP fuera del inventario CRM-01B3B3");
  validateCanonicalIcpAssertions(canonicalRunner, publicReferenceContracts);
  try {
    validateV17HubGuard({ root, overrides: new Map(Object.entries(overrides)) });
  } catch (error) {
    fail(`contrato de la guardia Hub inválido: ${error.message}`);
  }

  const srcFiles = walk(resolve(root, "src")).filter((path) => /\.(?:js|jsx|ts|tsx)$/.test(path));
  const frontendConsumers = srcFiles.map((path) => relative(resolve(root), path).replaceAll("\\", "/"))
    .filter((path) => /\/api\/crm\/icp-v2/.test(read(path)));
  if (frontendConsumers.length !== 1 || frontendConsumers[0] !== "src/crm-icp-v2/api.ts") {
    fail(`consumidores UI fuera del cliente ICP autorizado: ${frontendConsumers.join(",")}`);
  }
  const oldRoutes = `${read("api/crm/pipeline-cases/index.js")}\n${read("api/crm/pipeline-cases/[caseKey]/index.js")}\n${read("api/clients/index.js")}`;
  forbidMatch(oldRoutes, /crmIcpV2|icp-v2/i, "el lote cambió autoridad de rutas históricas");

  const docs = read("docs/V17-CRM-ICP-05B1-API-CONTRACT.md");
  for (const statement of ["productionApiEnabled` permanece en `false`", "no actualiza casos", "no añade consumidores frontend", "no recibe, calcula ni acepta `estimatedCbm`", "experiencia ERP más reciente previa a la integración CRM"]) {
    if (!docs.includes(statement)) fail(`límite contractual ausente: ${statement}`);
  }
  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    endpoints: Object.freeze([
      "POST /api/crm/icp-v2/pipeline-cases",
      "POST /api/crm/icp-v2/clients/search",
      "GET /api/crm/icp-v2/pipeline-cases/:caseRef",
    ]),
    modes: Object.freeze(["DISABLED", "LOCAL_ONLY", "PREVIEW_REHEARSAL"]),
    productionApiEnabled: false,
    uiConsumers: 1,
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmIcpApiGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
