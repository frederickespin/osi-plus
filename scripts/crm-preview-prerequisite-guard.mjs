import ts from "typescript";

// These consumers require CRM Preview as one prerequisite of their own closed
// gate. They do not resolve CRM authority: internal requests still delegate to
// resolveCrmPipelineContext. No other CRM configuration read is exempted.
const CONSUMERS = Object.freeze({
  "api/_lib/clientTemporaryAccessHttp.js": {
    prefix: "CLIENT_TEMPORARY", resolver: "resolveClientTemporaryApiMode", handler: "createInternalClientTemporaryHandler", batch: "V17-CLIENT-PORTAL-PREVIEW-16B",
    additionalChecks: {
      TRANSPORT_CAPABILITIES_DISABLED: "Object.values(COMMUNICATION_TRANSPORT_CAPABILITIES).every((enabled) => enabled === false)",
      STORAGE_MODE: "env.CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE === CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE",
      STORAGE_ROOT: "env.CRM_SURVEY_LOCAL_STORAGE_ROOT === CLIENT_TEMPORARY_PREVIEW_STORAGE_ROOT",
    },
  },
  "api/_lib/communicationsHttp.js": {
    prefix: "COMMUNICATIONS", resolver: "resolveCommunicationsApiMode", handler: "createCommunicationsHandler", batch: "V17-COMMUNICATIONS-PREVIEW-13B",
    additionalChecks: { TRANSPORT_CAPABILITIES_DISABLED: "Object.values(COMMUNICATION_TRANSPORT_CAPABILITIES).every((enabled) => enabled === false)" },
  },
  "api/_lib/personnelPoliciesHttp.js": {
    prefix: "PERSONNEL_POLICIES", resolver: "resolvePersonnelPoliciesApiMode", handler: "createPersonnelPoliciesHandler", batch: "V17-PERSONNEL-POLICIES-PREVIEW-14B", additionalChecks: {},
  },
});

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM01B3B1_GUARD: gate consumidor Preview: ${message}`);
}
function descendants(node, predicate) {
  const matches = [];
  function visit(child) { if (predicate(child)) matches.push(child); ts.forEachChild(child, visit); }
  visit(node);
  return matches;
}
function key(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return `${node.kind}:${node.text}`;
  const children = [];
  ts.forEachChild(node, (child) => { children.push(key(child)); });
  return `${node.kind}[${children.join(",")}]`;
}
const expressions = new Map();
function equivalent(node, expected) {
  if (!node) return false;
  if (!expressions.has(expected)) {
    const source = ts.createSourceFile("expected.js", `const value = ${expected};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    expressions.set(expected, key(source.statements[0].declarationList.declarations[0].initializer));
  }
  return key(node) === expressions.get(expected);
}
function declaration(statements, name) {
  const found = statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations)
    .filter((item) => ts.isIdentifier(item.name) && item.name.text === name);
  invariant(found.length === 1, `declaración exacta ${name} ausente o duplicada`);
  return found[0];
}
function frozenProperties(node, label) {
  invariant(ts.isCallExpression(node) && equivalent(node.expression, "Object.freeze") && node.arguments.length === 1
    && ts.isObjectLiteralExpression(node.arguments[0]), `${label} debe ser un objeto cerrado Object.freeze`);
  const properties = node.arguments[0].properties;
  invariant(properties.every((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)), `${label} no admite spreads ni propiedades calculadas`);
  const values = new Map(properties.map((property) => [property.name.text, property.initializer]));
  invariant(values.size === properties.length, `${label} contiene propiedades duplicadas`);
  return values;
}

export function approvedCrmPreviewPrerequisite(path, contents) {
  const descriptor = CONSUMERS[path];
  if (!descriptor) return null;
  const { prefix, resolver, handler, batch, additionalChecks } = descriptor;
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  invariant(source.parseDiagnostics.length === 0, `${path} contiene sintaxis inválida`);
  const functions = source.statements.filter(ts.isFunctionDeclaration);
  const gate = functions.find((fn) => fn.name?.text === resolver);
  invariant(gate?.body, `${path} perdió el resolver consumidor exacto`);
  const checksDeclaration = declaration(gate.body.statements, "checks");
  const checks = frozenProperties(checksDeclaration.initializer, `${path}:checks`);
  const required = {
    PRODUCTION_API_DISABLED: "productionApiEnabled === false",
    VERCEL_PREVIEW: 'env.VERCEL === "1" && env.VERCEL_ENV === "preview"',
    PREVIEW_BRANCH: "isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)",
    PREVIEW_BATCH: `env.${prefix}_PREVIEW_BATCH === ${prefix}_PREVIEW_BATCH`,
    PREVIEW_MANIFEST: `env.${prefix}_PREVIEW_MANIFEST === manifest.raw`,
    PREVIEW_MANIFEST_SHA256: `env.${prefix}_PREVIEW_MANIFEST_SHA256 === manifest.sha256`,
    PREVIEW_NEON_BRANCH: `env.${prefix}_PREVIEW_NEON_BRANCH_ID === ${prefix}_PREVIEW_NEON_BRANCH`,
    DATABASE_URL: "previewUrlAuthorized(env.DATABASE_URL)",
    DIRECT_URL: "previewUrlAuthorized(env.DIRECT_URL)",
    AUTH_LEGACY: 'env.MT01B_AUTH_MODE === "LEGACY"',
    TENANT_SWITCH_DISABLED: 'env.MT01B_TENANT_SWITCH_ENABLED === "false"',
    AUTH_V2_DISABLED: 'env.VITE_MT01B2_CLIENT_ENABLED === "false"',
    CRM_RUNTIME_PREVIEW: 'env.CRM_PIPELINE_RUNTIME_MODE === "PREVIEW_REHEARSAL"',
    HUB_PREVIEW: 'env.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL"',
    CRM_CLIENT_PREVIEW: 'env.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL"',
    CRM_READ_PREVIEW: 'env.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL"',
    EXTERNAL_TRANSPORT_DISABLED: 'env.COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "DISABLED"',
    EXTERNAL_WEBHOOK_DISABLED: 'env.COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE === "DISABLED"',
    ...additionalChecks,
  };
  invariant(checks.size === Object.keys(required).length, `${path} cambió el inventario exacto de requisitos`);
  for (const [name, expected] of Object.entries(required)) {
    invariant(equivalent(checks.get(name), expected), `${path} modificó el requisito ${name}`);
  }
  for (const [name, expected] of Object.entries({
    productionApiEnabled: "false",
    [`${prefix}_PREVIEW_BATCH`]: JSON.stringify(batch),
    [`${prefix}_PREVIEW_DATABASE`]: '"v17_consolidated_preview_10b"',
    [`${prefix}_PREVIEW_NEON_BRANCH`]: '"br-mute-credit-ahxnvfx0"',
  })) {
    invariant(equivalent(declaration(source.statements, name).initializer, expected), `${path} cambió ${name}`);
  }
  const manifest = frozenProperties(declaration(source.statements, "PREVIEW_MANIFEST").initializer, `${path}:manifest`);
  for (const [name, expected] of Object.entries({ branch: '"feature/v17-consolidated-preview"', batch: `${prefix}_PREVIEW_BATCH`, database: `${prefix}_PREVIEW_DATABASE`, neonBranch: `${prefix}_PREVIEW_NEON_BRANCH` })) {
    invariant(equivalent(manifest.get(name), expected), `${path} cambió manifiesto ${name}`);
  }
  const imports = source.statements.filter(ts.isImportDeclaration);
  for (const [symbol, from] of [["resolveCrmPipelineContext", "./crmPipelineAccess.js"], ["isV17ConsolidatedPreviewBranch", "../../shared/v17ConsolidatedPreview.js"]]) {
    invariant(imports.some((entry) => entry.moduleSpecifier.text === from && entry.importClause?.namedBindings && ts.isNamedImports(entry.importClause.namedBindings)
      && entry.importClause.namedBindings.elements.some((item) => item.name.text === symbol && !item.propertyName)), `${path} omite importación canónica ${symbol}`);
  }
  const tail = gate.body.statements.slice(-4);
  invariant(tail[0]?.declarationList?.declarations[0] === checksDeclaration, `${path} agregó flujo después de checks`);
  invariant(equivalent(declaration([tail[1]], "failures").initializer, "Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name)"), `${path} no evalúa todos los requisitos`);
  invariant(ts.isIfStatement(tail[2]) && equivalent(tail[2].expression, "failures.length") && ts.isBlock(tail[2].thenStatement)
    && tail[2].thenStatement.statements.some((statement) => ts.isExpressionStatement(statement)
      && equivalent(statement.expression, `fail("${prefix}_CONFIGURATION_INVALID", 503)`)), `${path} perdió el rechazo cerrado`);
  invariant(ts.isReturnStatement(tail[3]) && equivalent(tail[3].expression, "mode"), `${path} cambió el retorno del gate`);
  const consumer = functions.find((fn) => fn.name?.text === handler);
  invariant(consumer?.body, `${path} perdió su handler interno`);
  invariant(descendants(consumer, (node) => ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === "resolveContext"
    && equivalent(node.initializer, "resolveCrmPipelineContext")).length === 1, `${path} dejó de delegar al resolver CRM central`);
  invariant(descendants(consumer, (node) => ts.isAwaitExpression(node)
    && equivalent(node.expression, "resolveContext(req, { env, prisma: prismaClient })")).length === 1, `${path} omite la autorización CRM central`);
  const prerequisite = checks.get("CRM_RUNTIME_PREVIEW");
  return Object.freeze({ start: prerequisite.left.getStart(source), end: prerequisite.left.end });
}
