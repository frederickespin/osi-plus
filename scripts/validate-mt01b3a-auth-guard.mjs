import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Exact route inventory. A new file is never authorized by its directory or prefix.
// Factories preserve the approved HTTP adapter; external credentials are classified
// separately from employee AuthorizationContext, public metadata, and retired APIs.
const FACTORY_GROUPS = [
  ["TENANT", "adminMembershipHttp.js", "createAdminMembershipCollectionHandler", ["api/admin/memberships/index.js"]],
  ["TENANT", "adminMembershipHttp.js", "createAdminMembershipDetailHandler", ["api/admin/memberships/[membershipRef]/index.js"]],
  ["TENANT", "adminIdentityInvitationHttp.js", "createAdminIdentityInvitationCollectionHandler", ["api/admin/identity-invitations/index.js"]],
  ["TENANT", "adminIdentityInvitationHttp.js", "createAdminIdentityInvitationDetailHandler", ["api/admin/identity-invitations/[invitationRef]/index.js"]],
  ["INVITATION_TOKEN", "adminIdentityInvitationHttp.js", "createAdminIdentityActivationHandler", ["api/auth/admin-invitations/activate.js"]],
  ["TENANT", "adminUserIdentityHttp.js", "createAdminUserIdentityCollectionHandler", ["api/admin/user-identities/index.js"]],
  ["TENANT", "adminUserIdentityHttp.js", "createAdminUserIdentityDetailHandler", ["api/admin/user-identities/[membershipRef]/index.js"]],
  ["TENANT", "adminUserIdentityHttp.js", "createAdminUserIdentityPhotoHandler", ["api/admin/user-identities/[membershipRef]/photo/index.js"]],
  ["TENANT", "adminUserIdentityHttp.js", "createAdminUserEnrollmentCollectionHandler", ["api/admin/user-enrollments/index.js"]],
  ["TENANT", "adminUserIdentityHttp.js", "createAdminUserEnrollmentDetailHandler", ["api/admin/user-enrollments/[enrollmentRef]/index.js"]],
  ["INVITATION_TOKEN", "adminUserIdentityHttp.js", "createAdminUserEnrollmentActivationHandler", ["api/admin/user-enrollments/activate/index.js"]],
  ["TENANT", "toolsEquipmentHttp.js", "createToolsEquipmentHandler", [
    "api/assets/assignments/handout/index.js", "api/assets/assignments/index.js", "api/assets/assignments/return/index.js",
    "api/assets/costs/index.js", "api/assets/external/offers/index.js", "api/assets/external/reservations/index.js",
    "api/assets/incidents/index.js", "api/assets/inspections/index.js", "api/assets/instances/[assetRef].js",
    "api/assets/instances/index.js", "api/assets/maintenance/index.js", "api/assets/models/index.js", "api/assets/reservations/index.js",
  ]],
  ["TENANT", "materialsInventoryHttp.js", "createMaterialsHandler", [
    "api/materials/catalog/[materialRef].js", "api/materials/catalog/index.js", "api/materials/conversions/index.js",
    "api/materials/costs/index.js", "api/materials/movements/index.js", "api/materials/purchase-requests/index.js",
    "api/materials/purchase-requests/transition/index.js", "api/materials/recipes/index.js", "api/materials/recipes/version/index.js",
    "api/materials/requirements/index.js", "api/materials/requirements/resolve.js", "api/materials/reservations/assign/index.js",
    "api/materials/reservations/index.js", "api/materials/reservations/release.js", "api/materials/units/index.js", "api/materials/warehouses/index.js",
  ]],
  ["TENANT", "logisticsEngineHttp.js", "createLogisticsHandler", [
    "api/logistics/plans/[caseRef].js", "api/logistics/plans/calculate.js", "api/logistics/plans/issues/resolve.js",
    "api/logistics/plans/overrides.js", "api/logistics/plans/publish.js", "api/logistics/rules/index.js",
  ]],
  ["TENANT", "costingHttp.js", "createCostingHandler", [
    "api/costing/authorizations.js", "api/costing/calculate.js", "api/costing/exchange-rates/index.js", "api/costing/issues/resolve.js",
    "api/costing/overrides.js", "api/costing/publish.js", "api/costing/revisions/[caseRef].js", "api/costing/rules/index.js",
  ]],
  ["TENANT", "quoteHttp.js", "createQuoteHandler", [
    "api/quote/cases/[caseRef].js", "api/quote/proposals/[proposalRef]/client.js", "api/quote/proposals/cancel.js",
    "api/quote/proposals/create.js", "api/quote/proposals/decision.js", "api/quote/proposals/publish.js",
    "api/quote/proposals/revise.js", "api/quote/proposals/send.js",
  ]],
  ["TENANT", "commercialRelationshipsHttp.js", "createCommercialRelationshipsHandler", [
    "api/commercial-relationships/associations/index.js", "api/commercial-relationships/cases/[caseRef].js",
    "api/commercial-relationships/certifications/index.js", "api/commercial-relationships/commissions/publish.js",
    "api/commercial-relationships/contacts/index.js", "api/commercial-relationships/entities/index.js",
    "api/commercial-relationships/instructions/publish.js", "api/commercial-relationships/pricing-agreements/publish.js",
    "api/commercial-relationships/referrals/publish.js", "api/commercial-relationships/relationships/index.js",
    "api/commercial-relationships/tariffs/publish.js", "api/commercial-relationships/workspace/index.js",
  ]],
  ["TENANT", "communicationsHttp.js", "createCommunicationsHandler", [
    "api/communications/prepare.js", "api/communications/preview.js", "api/communications/recipients.js",
    "api/communications/records.js", "api/communications/variables.js", "api/communications/templates/index.js",
    "api/communications/templates/[templateRef]/inactivate.js", "api/communications/templates/[templateRef]/publish.js",
    "api/communications/templates/[templateRef]/versions.js",
  ]],
  ["DISABLED_TRANSPORT", "communicationsHttp.js", "createTransportDisabledHandler", ["api/communications/send.js"]],
  ["TENANT", "personnelPoliciesHttp.js", "createPersonnelPoliciesHandler", ["api/personnel/policies/index.js"]],
  ["TENANT", "crmServicesHttp.js", "createCrmServicesHandler", [
    "api/crm/services/cases/[caseRef].js", "api/crm/services/catalog-modes/index.js", "api/crm/services/catalog/[serviceRef].js",
    "api/crm/services/catalog/index.js", "api/crm/services/configurations/[caseRef].js",
    "api/crm/services/configurations/conflicts/[conflictRef].js", "api/crm/services/defaults/index.js",
    "api/crm/services/material-policies/index.js", "api/crm/services/modes/index.js", "api/crm/services/packages/index.js",
  ]],
  ["TENANT", "crmSurveyHttp.js", "createCrmSurveyHandler", [
    "api/crm/survey/assignments/[assignmentRef].js", "api/crm/survey/assignments/index.js", "api/crm/survey/catalog/index.js",
    "api/crm/survey/drafts/[surveyRef].js", "api/crm/survey/drafts/[surveyRef]/publish.js",
    "api/crm/survey/publications/[publicationRef].js", "api/crm/survey/scheduling/index.js",
  ]],
  ["TENANT", "clientTemporaryAccessHttp.js", "createInternalClientTemporaryHandler", [
    "api/client-access/internal/[accessRef].js", "api/client-access/internal/index.js",
  ]],
  ["CLIENT_TOKEN", "clientTemporaryAccessHttp.js", "createExternalClientTemporaryHandler", [
    "api/client-access/[accessRef]/index.js", "api/client-access/[accessRef]/mini.js",
    "api/client-access/[accessRef]/qr.js", "api/client-access/[accessRef]/visit.js",
  ]],
];

const WRAPPED_FACTORY_ROUTES = [
  ["api/crm/icp-v2/clients/search.js", "crmIcpV2ApiHttp.js", "createCrmIcpClientSearchHandler"],
  ["api/crm/icp-v2/pipeline-cases/[caseKey]/index.js", "crmIcpV2ApiHttp.js", "createCrmIcpV2DetailHandler"],
  ["api/crm/icp-v2/pipeline-cases/index.js", "crmIcpV2ApiHttp.js", "createCrmIcpV2CreateHandler"],
  ["api/crm/pipeline-cases/[caseKey]/allowed-transitions.js", "pipelineCaseMutationHttp.js", "createAllowedTransitionsHandler"],
  ["api/crm/pipeline-cases/[caseKey]/assign-owner.js", "pipelineCaseMutationHttp.js", "createAssignOwnerHandler"],
  ["api/crm/pipeline-cases/[caseKey]/transition.js", "pipelineCaseMutationHttp.js", "createTransitionHandler"],
  ["api/crm/pipeline-cases/[caseKey]/unassign-owner.js", "pipelineCaseMutationHttp.js", "createUnassignOwnerHandler"],
  ["api/crm/pipeline-owner-options.js", "crmOwnerCatalogHttp.js", "createCrmOwnerCatalogHandler"],
  ["api/crm/client-options.js", "crmPipelineReadHttp.js", "createCrmPipelineReadHandler"],
  ["api/crm/pipeline-summary.js", "crmPipelineReadHttp.js", "createCrmPipelineReadHandler"],
];
const CRM_DISPATCH_ROUTES = ["api/crm/pipeline-cases/index.js", "api/crm/pipeline-cases/[caseKey]/index.js"];
const CANONICAL_ROLE_ROUTES = [
  "api/k/pgd/apply.js", "api/k/pgd/item.js", "api/k/project-release.js", "api/k/project-validate.js", "api/k/project.js", "api/k/signal.js",
  "api/osis/[id]/handshake.js", "api/osis/[id]/return.js",
  "api/ptf/suggestions/action.js", "api/ptf/suggestions/index.js", "api/ptf/suggestions/recompute.js",
];
const CANONICAL_PERMISSION_ROUTES = [
  "api/pst/[serviceCode].js", "api/pst/active.js", "api/templates/approve-batch.js", "api/templates/approve.js",
  "api/templates/draft.js", "api/templates/list.js", "api/templates/pending.js", "api/templates/publish.js",
  "api/templates/reject.js", "api/templates/submit.js", "api/templates/version.js",
];
const MIXED_OSI_ROUTES = ["api/osis/[id].js", "api/osis/index.js"];
const PILOT_ROUTES = ["api/clients/index.js", "api/projects/index.js", "api/k/dashboard.js"];
const SURVEY_BINARY_ROUTES = ["api/crm/survey/drafts/[surveyRef]/photos.js", "api/crm/survey/publications/[publicationRef]/pdf.js"];
const PUBLIC_METADATA_ROUTES = ["api/health.js", "api/info.js"];
const CLIENT_TOKEN_OPERATIONS = new Map([
  ["api/client-access/[accessRef]/index.js", "openClientTemporaryAccess"],
  ["api/client-access/[accessRef]/mini.js", "saveClientMiniSurvey"],
  ["api/client-access/[accessRef]/qr.js", "confirmClientVisitQr"],
  ["api/client-access/[accessRef]/visit.js", "applyClientVisitAction"],
  ["api/client-access/[accessRef]/upload.js", "uploadClientSurveyAsset"],
]);
const ROUTE_HELPERS = new Set(["api/k/_lib.js", "api/osis/_helpers.js", "api/templates/_pst.js"]);

const call = (module, name) => Object.freeze({ module: "api/_lib/" + module, name });
const descriptor = (kind, calls, extra = {}) => Object.freeze({ kind, calls: Object.freeze(calls), ...extra });
const entries = [
  ...FACTORY_GROUPS.flatMap(([kind, module, name, routes]) => routes.map((route) => [route, descriptor(kind, [call(module, name)], { factory: true })])),
  ...WRAPPED_FACTORY_ROUTES.map(([route, module, name]) => [route, descriptor("TENANT", [call(module, name)], { wrappedFactory: true })]),
  ...CRM_DISPATCH_ROUTES.map((route) => [route, descriptor("TENANT", [call("crmPipelineReadHttp.js", "createCrmPipelineReadHandler"), call("crmCaseMutationHttp.js", "createCrmCaseMutationHandler")])]),
  ...CANONICAL_ROLE_ROUTES.map((route) => [route, descriptor("TENANT", [call("authContextMiddleware.js", "requireRole")])]),
  ...CANONICAL_PERMISSION_ROUTES.map((route) => [route, descriptor("TENANT", [call("authContextMiddleware.js", "requirePermission")])]),
  ...MIXED_OSI_ROUTES.map((route) => [route, descriptor("TENANT", [call("authContextPilot.js", "requirePilotPermission"), call("authContextMiddleware.js", "requireRole")])]),
  ...PILOT_ROUTES.map((route) => [route, descriptor("TENANT", [call("authContextPilot.js", "requirePilotPermission")])]),
  ...SURVEY_BINARY_ROUTES.map((route) => [route, descriptor("TENANT", [call("crmSurveyHttp.js", "prepareCrmSurveyRequest"), call("crmPipelineAccess.js", "resolveCrmPipelineContext")])]),
  ...PUBLIC_METADATA_ROUTES.map((route) => [route, descriptor("PUBLIC_METADATA", [call("http.js", "withPublicReadCorsHeaders")])]),
  ["api/users/index.js", descriptor("RETIRED", [call("http.js", "withPrivateApiHeaders")])],
  ["api/auth/me.js", descriptor("TENANT", [call("authContextMiddleware.js", "requireAuthContext")])],
  ["api/auth/login.js", descriptor("CREDENTIALS", [call("authHttp.js", "withLegacyAuthHeaders"), call("auth.js", "comparePassword"), call("authContext.js", "listLegacyMembershipOptions")])],
  ["api/auth/logout.js", descriptor("REFRESH_COOKIE", [call("authOrigin.js", "withMt01bAuthHeaders"), call("authOrigin.js", "validateMt01bMutationOrigin"), call("authCookies.js", "readRefreshCookie"), call("authSession.js", "revokeMembershipAuthSession")])],
  ["api/auth/refresh.js", descriptor("REFRESH_COOKIE", [call("authOrigin.js", "withMt01bAuthHeaders"), call("authOrigin.js", "validateMt01bMutationOrigin"), call("authCookies.js", "readRefreshCookie"), call("authSession.js", "rotateMembershipRefreshToken")])],
  ["api/auth/session/upgrade.js", descriptor("LEGACY_UPGRADE", [call("authOrigin.js", "withMt01bAuthHeaders"), call("authOrigin.js", "validateMt01bMutationOrigin"), call("authContext.js", "resolveLegacyUpgradeIdentity"), call("authSession.js", "createMembershipAuthSession")])],
  ["api/client-access/[accessRef]/code.js", descriptor("CLIENT_CODE", [call("clientTemporaryAccessHttp.js", "prepareClientTemporaryRequest"), call("clientTemporaryAccessDomain.js", "openClientTemporaryAccessByCode")])],
  ["api/client-access/[accessRef]/upload.js", descriptor("CLIENT_TOKEN", [call("clientTemporaryAccessHttp.js", "prepareClientTemporaryRequest"), call("clientTemporaryAccessHttp.js", "clientTemporaryTokenFromRequest"), call("clientTemporaryAccessDomain.js", "uploadClientSurveyAsset")])],
];
export const MT01B3A_ROUTE_INVENTORY = Object.freeze(Object.fromEntries(entries));
const CLASSIFICATIONS = new Map(entries);
const LEGACY_HEADER_ROUTES = new Set();

export const B3B1_ACTIVATION_BLOCKERS = Object.freeze([
  "Client no posee tenantId",
  "Project no posee tenantId",
  "La creación de User no crea EmployeeProfile/TenantMembership formal",
  "No puede garantizarse 404 empresarial para esos recursos",
]);

function invariant(condition, message) {
  if (!condition) throw new Error("MT-01B3A: " + message);
}
function normalized(file) { return file.replaceAll("\\", "/"); }
function collectJs(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectJs(target) : entry.name.endsWith(".js") ? [target] : [];
  });
}

// Trace the exported handler into local wrappers. Merely keeping a correct import,
// comment, or unused function cannot hide a replacement default handler.
function inspectRoute(route, source) {
  const file = ts.createSourceFile(route, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  invariant(file.parseDiagnostics.length === 0, route + " contiene sintaxis inválida");
  const imports = new Map(); const locals = new Map(); const roots = [];
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const module = path.posix.normalize(path.posix.join(path.posix.dirname(route), statement.moduleSpecifier.text));
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) imports.set(binding.name.text, { module, name: binding.propertyName?.text || binding.name.text });
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) locals.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) locals.set(declaration.name.text, declaration.initializer);
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) roots.push(statement.expression);
    if (ts.isFunctionDeclaration(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) roots.push(statement);
  }
  invariant(roots.length === 1, route + " requiere un único handler exportado");
  const seen = new Set(); const calls = [];
  function visit(node) {
    if (seen.has(node)) return;
    seen.add(node);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push({ node, binding: imports.get(node.expression.text), local: node.expression.text });
    if (ts.isIdentifier(node) && locals.has(node.text)) visit(locals.get(node.text));
    ts.forEachChild(node, visit);
  }
  visit(roots[0]);
  return { file, imports, roots, calls, seen };
}
function assertCall(inspection, expected, route) {
  const matches = inspection.calls.filter(({ binding }) => binding?.module === expected.module && binding.name === expected.name);
  // Credential comparison is a local injectable default in the existing login
  // contract. It must remain bound to the real imported comparePassword.
  if (!matches.length && route === "api/auth/login.js" && expected.name === "comparePassword") {
    const aliases = [...inspection.seen].filter((node) => ts.isBindingElement(node) && node.initializer && ts.isIdentifier(node.initializer)
      && inspection.imports.get(node.initializer.text)?.module === expected.module && inspection.imports.get(node.initializer.text)?.name === expected.name);
    invariant(aliases.some((node) => ts.isIdentifier(node.name) && inspection.calls.some(({ local }) => local === node.name.text)), route + " omite comparación de credenciales");
    return;
  }
  invariant(matches.length > 0, route + " omite el adaptador autorizado " + expected.name + " de " + expected.module);
}
function assertFactoryOptions(node, route) {
  invariant(node.arguments.length <= 1, route + " sobrescribe argumentos del adaptador");
  if (!node.arguments.length) return;
  const options = node.arguments[0];
  invariant(ts.isObjectLiteralExpression(options), route + " requiere opciones explícitas del adaptador");
  const permitted = new Set(["prismaClient", "prisma", "methods", "permission", "permissions", "execute", "response", "status", "maxBytes"]);
  const names = new Set();
  for (const property of options.properties) {
    invariant(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), route + " introduce opciones dinámicas del adaptador");
    const name = property.name.text;
    invariant(!names.has(name) && permitted.has(name), route + " sobrescribe la autoridad del adaptador: " + name);
    names.add(name);
  }
}
function validateRouteContract(route, source, contract) {
  const inspection = inspectRoute(route, source);
  for (const expected of contract.calls) assertCall(inspection, expected, route);
  for (const node of inspection.seen) {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      invariant(!["resolveContext", "requirePermission"].includes(node.name.text), route + " inyecta autoridad alternativa");
    }
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "resolveContext") invariant(!node.initializer, route + " sustituye el contexto predeterminado del adaptador");
      if (node.name.text === "requirePermission") invariant(node.initializer && ts.isIdentifier(node.initializer)
        && inspection.imports.get(node.initializer.text)?.module === "api/_lib/crmPipelineAccess.js"
        && inspection.imports.get(node.initializer.text)?.name === "requireCrmPipelinePermissionResponse",
      route + " sustituye el permiso canónico predeterminado");
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === "options") {
      invariant(node.initializer && ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.length === 0,
        route + " inyecta opciones predeterminadas en el wrapper");
    }
  }
  if (CLIENT_TOKEN_OPERATIONS.has(route)) {
    const expected = call("clientTemporaryAccessDomain.js", CLIENT_TOKEN_OPERATIONS.get(route));
    assertCall(inspection, expected, route);
    invariant(inspection.calls.filter(({ binding }) => binding?.module === expected.module && binding.name === expected.name)
      .every(({ node }) => node.arguments.length > 1 && ts.isIdentifier(node.arguments[1]) && node.arguments[1].text === "token"),
    route + " no entrega el token al dominio que autoriza el acceso temporal");
  }
  if (contract.factory) {
    const root = inspection.roots[0]; const expected = contract.calls[0];
    invariant(ts.isCallExpression(root) && ts.isIdentifier(root.expression)
      && inspection.imports.get(root.expression.text)?.module === expected.module
      && inspection.imports.get(root.expression.text)?.name === expected.name,
    route + " no exporta directamente su adaptador clasificado");
    assertFactoryOptions(root, route);
  }
  if (contract.wrappedFactory) {
    const root = inspection.roots[0];
    invariant(ts.isCallExpression(root) && root.arguments.length === 0, route + " inyecta autoridad en el wrapper de producción");
  }
  if (contract.kind === "RETIRED") {
    invariant(/status\(410\)/.test(source) && /USERS_ADMINISTRATION_MOVED_TO_MEMBERSHIPS/.test(source)
      && /ADMIN_IDENTITY_INVITATION/.test(source)
      && !/password|hashPassword|prisma\.(?:user|tenantMembership)\.(?:findMany|create)/i.test(source),
    "/api/users debe permanecer retirado a favor de Memberships e Invitation");
  }
  if (contract.kind === "PUBLIC_METADATA") {
    invariant(!/from\s+["'][^"']*(?:db|authContext|Domain)\.js["']/.test(source), route + " dejó de ser metadata pública");
  }
}

const CONTEXT_ADAPTERS = new Set([
  ...FACTORY_GROUPS.filter(([kind]) => kind === "TENANT").map(([, module]) => "api/_lib/" + module),
  "api/_lib/crmIcpV2ApiHttp.js", "api/_lib/pipelineCaseMutationHttp.js", "api/_lib/crmOwnerCatalogHttp.js", "api/_lib/crmCaseMutationHttp.js",
]);
function validateAdapters(adapterSources) {
  invariant(adapterSources instanceof Map, "faltan fuentes de los adaptadores de autenticación");
  for (const module of CONTEXT_ADAPTERS) {
    const source = adapterSources.get(module) || "";
    const file = ts.createSourceFile(module, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let hasDefault = false; let hasAwaitedResolver = false;
    function visit(node) {
      if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === "resolveContext"
        && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === "resolveCrmPipelineContext") hasDefault = true;
      if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "resolveContext") hasAwaitedResolver = true;
      ts.forEachChild(node, visit);
    }
    visit(file);
    invariant(/import\s*\{[^}]*resolveCrmPipelineContext[^}]*\}\s*from\s*["']\.\/crmPipelineAccess\.js["']/s.test(source)
      && hasDefault && hasAwaitedResolver, module + " omite el contexto empresarial canónico");
  }
  const read = adapterSources.get("api/_lib/crmPipelineReadHttp.js") || "";
  invariant(/requirePermission\s*=\s*requireCrmPipelinePermissionResponse/.test(read)
    && /await requirePermission\(req, res, CRM_PIPELINE_PERMISSION/.test(read)
    && /if\s*\(!context\)\s*return/.test(read), "lectura CRM omite el permiso canónico o acepta contexto nulo");
  const pilot = adapterSources.get("api/_lib/authContextPilot.js") || "";
  invariant(/from\s*["']\.\/authContextMiddleware\.js["']/.test(pilot)
    && /requireAuthContext\(req, res, options\)/.test(pilot)
    && !/\brequireAuth\(|\brequirePerm\(/.test(pilot), "el adaptador piloto debe converger en AuthorizationContext");
  const temporary = adapterSources.get("api/_lib/clientTemporaryAccessHttp.js") || "";
  invariant(/const token = clientTemporaryTokenFromRequest\(req\)/.test(temporary)
    && /await execute\(\{ req, accessRef: req\.query\?\.accessRef, token, input, prisma: prismaClient \}\)/.test(temporary),
  "el Portal externo omite la credencial ClientAccess");
  const transport = adapterSources.get("api/_lib/communicationsHttp.js") || "";
  invariant(/function createTransportDisabledHandler\(\)[\s\S]*status\(409\)[\s\S]*COMMUNICATION_TRANSPORT_DISABLED/.test(transport),
    "el transporte externo debe permanecer deshabilitado");
  const identity = adapterSources.get("api/_lib/adminUserIdentityHttp.js") || "";
  const activation = identity.slice(identity.indexOf("export function createAdminUserEnrollmentActivationHandler"));
  invariant(/req\.method !== "POST"/.test(activation)
    && /requireUserIdentityAccess\(req, env\)/.test(activation) && /sameOrigin\(req\)/.test(activation)
    && /await resolve\(prisma, body\.token, configuration\)/.test(activation)
    && /verifyIdentity\(getBearerToken\(req\)\)/.test(activation)
    && /options\.verifyIdentity \?\? verifyStrictLegacyAccessToken/.test(activation)
    && /await activate\(prisma, input, identity, configuration\)/.test(activation),
  "la activación19C requiere POST, token validado y sesión verificada para identidad existente");
}

export function validateMt01b3aSources({ routeSources, envExample, authContextSource, adapterSources, canonicalInventory }) {
  invariant(CLASSIFICATIONS.size === entries.length, "inventario contiene rutas duplicadas");
  invariant(LEGACY_HEADER_ROUTES.size === 0, "rutas activas basadas en headers: " + LEGACY_HEADER_ROUTES.size);
  for (const route of routeSources.keys()) invariant(CLASSIFICATIONS.has(route), "ruta nueva sin clasificación: " + route);
  for (const route of CLASSIFICATIONS.keys()) invariant(routeSources.has(route), "ruta inventariada ausente: " + route);
  for (const [route, source] of routeSources) {
    invariant(!/x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders|ensureActorUserId/i.test(source), route + " introduce confianza en headers manipulables");
    invariant(!/\b(?:body|query)\.(?:actorUserId|actorRole)/.test(source), route + " acepta autoridad del actor desde cliente");
    validateRouteContract(route, source, CLASSIFICATIONS.get(route));
  }
  const migrated = [...CANONICAL_ROLE_ROUTES, ...CANONICAL_PERMISSION_ROUTES, ...MIXED_OSI_ROUTES].sort();
  invariant(canonicalInventory && JSON.stringify([...(canonicalInventory.migratedActiveFiles || [])].sort()) === JSON.stringify(migrated),
    "la clasificación no coincide con el inventario canónico de rutas migradas");
  invariant((canonicalInventory.remainingDisabledFiles || []).every((route) => route.startsWith("api/_disabled/")), "una excepción legacy dejó de estar desactivada");
  validateAdapters(adapterSources);
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "LEGACY debe continuar como valor predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "tenant switch debe continuar desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "cliente V2 debe continuar desactivado");
  invariant(B3B1_ACTIVATION_BLOCKERS.length === 4, "los bloqueos de activación no pueden retirarse antes de MT-01C");
  invariant(/export async function resolveAuthContext\(request,/.test(authContextSource), "firma canónica resolveAuthContext(request, options) ausente");
  invariant(/Object\.freeze/.test(authContextSource), "AuthContext debe ser inmutable");
  const classifications = Object.fromEntries([...new Set(entries.map(([, entry]) => entry.kind))].map((kind) => [kind, entries.filter(([, entry]) => entry.kind === kind).length]));
  return { routes: routeSources.size, legacyHeaderExceptions: LEGACY_HEADER_ROUTES.size, v2Prepared: classifications.TENANT, migratedActiveRoutes: migrated.length, activationBlockers: B3B1_ACTIVATION_BLOCKERS.length, classifications };
}

export function validateMt01b3aRepository(root = process.cwd()) {
  const routeSources = new Map(); const adapterSources = new Map();
  for (const absolute of collectJs(path.join(root, "api"))) {
    const route = normalized(path.relative(root, absolute));
    if (route.startsWith("api/_lib/")) { adapterSources.set(route, fs.readFileSync(absolute, "utf8")); continue; }
    if (route.startsWith("api/_disabled/") || ROUTE_HELPERS.has(route)) continue;
    routeSources.set(route, fs.readFileSync(absolute, "utf8"));
  }
  return validateMt01b3aSources({
    routeSources, adapterSources,
    canonicalInventory: JSON.parse(fs.readFileSync(path.join(root, "scripts/v17-auth-legacy-route-inventory.json"), "utf8")),
    envExample: fs.readFileSync(path.join(root, ".env.example"), "utf8"),
    authContextSource: fs.readFileSync(path.join(root, "api/_lib/authContext.js"), "utf8"),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(JSON.stringify({ ok: true, ...validateMt01b3aRepository() }) + "\n");
