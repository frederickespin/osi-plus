import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { validateV17HubGuard } from "./validate-v17-hub-guard.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
function requireMatch(source, pattern, message) { if (!pattern.test(source)) throw new Error(message); }
function forbid(source, pattern, message) { if (pattern.test(source)) throw new Error(message); }

const SELECTOR_ADAPTERS = Object.freeze({
  "src/crm-relational/mutationApi.ts": { className: "CrmCaseMutationApi", methods: ["mutation", "clients"], errorClass: "CrmCaseMutationClientError" },
  "src/admin-tenant/adminApi.ts": { className: "AdminTenantApi", methods: ["headers"], errorClass: "AdminApiError" },
});
const isName = (node, name) => node && ts.isIdentifier(node) && node.text === name;
const propertyName = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
const isThisProperty = (node, name) => node && ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === name;
const isProviderCall = (node, name) => node && ts.isCallExpression(node) && isThisProperty(node.expression, name) && node.arguments.length === 0;
const demand = (value, message) => { if (!value) throw new Error(message); };

export function validatePilotFrontendAuthority(path, source) {
  forbid(source, /V17_PRODUCTION_PILOT_ACTIVATION_(?:BATCH|MANIFEST|MANIFEST_SHA256)/, "autoridad server-only incluida en frontend");
  let checkedSource = source;
  const contract = SELECTOR_ADAPTERS[path];
  if (contract) {
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    demand(parsed.parseDiagnostics.length === 0, `sintaxis del adaptador inválida:${path}`);
    demand(parsed.statements.some((node) => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === "@/lib/sessionStore" && !node.importClause?.name && !node.importClause?.isTypeOnly
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.length === 1
      && isName(node.importClause.namedBindings.elements[0].name, "getMembershipRef")
      && !node.importClause.namedBindings.elements[0].propertyName), "selector público de membresía ausente");
    const classes = parsed.statements.filter((node) => ts.isClassDeclaration(node) && isName(node.name, contract.className));
    demand(classes.length === 1, "adaptador de selección pública no canónico");
    const constructors = classes[0].members.filter(ts.isConstructorDeclaration);
    demand(constructors.length === 1 && constructors[0].body, "constructor de selección pública ausente");
    const constructor = constructors[0];
    const selectionParameters = constructor.parameters.filter((node) => isName(node.name, "membershipRefProvider"));
    demand(selectionParameters.length === 1 && isName(selectionParameters[0].initializer, "getMembershipRef"), "selector público no usa proveedor canónico");
    demand(constructor.body.statements.length === 3, "constructor contiene escrituras o instrucciones adicionales");
    for (const provider of ["tokenProvider", "fetchImpl", "membershipRefProvider"]) {
      const assignments = constructor.body.statements.filter((node) => ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && isThisProperty(node.expression.left, provider));
      demand(assignments.length === 1 && isName(assignments[0].expression.right, provider), "constructor no conserva proveedor canónico");
    }
    const ranges = [];
    for (const methodName of contract.methods) {
      const methods = classes[0].members.filter((node) => ts.isMethodDeclaration(node) && propertyName(node.name) === methodName);
      demand(methods.length === 1 && methods[0].body, `método canónico ausente:${methodName}`);
      const statements = methods[0].body.statements;
      const declarations = statements.filter(ts.isVariableStatement).flatMap((node) => node.declarationList.flags & ts.NodeFlags.Const ? [...node.declarationList.declarations] : []);
      for (const [name, provider] of [["token", "tokenProvider"], ["membershipRef", "membershipRefProvider"]]) {
        const locals = declarations.filter((node) => isName(node.name, name));
        demand(locals.length === 1 && isProviderCall(locals[0].initializer, provider), "selector público no usa proveedor canónico");
      }
      const checks = [];
      for (const [name, code, status] of [["token", "COMMERCIAL_AUTH_REQUIRED", 401], ["membershipRef", "MT01B_MEMBERSHIP_SELECTION_INVALID", 400]]) {
        const matches = statements.filter((node) => ts.isIfStatement(node) && ts.isPrefixUnaryExpression(node.expression)
          && node.expression.operator === ts.SyntaxKind.ExclamationToken && isName(node.expression.operand, name)
          && !node.elseStatement && ts.isThrowStatement(node.thenStatement) && node.thenStatement.expression
          && ts.isNewExpression(node.thenStatement.expression) && isName(node.thenStatement.expression.expression, contract.errorClass));
        demand(matches.length === 1, "selector ausente no falla cerrado");
        const args = matches[0].thenStatement.expression.arguments;
        demand(args?.length === 2 && args.some((node) => ts.isStringLiteral(node) && node.text === code)
          && args.some((node) => ts.isNumericLiteral(node) && node.text === String(status)), "selector ausente no falla cerrado");
        checks.push(matches[0]);
      }
      let headers;
      if (methodName === "headers") {
        const returns = statements.filter(ts.isReturnStatement);
        demand(returns.length === 1 && returns[0].expression && ts.isObjectLiteralExpression(returns[0].expression), "objeto headers canónico ausente");
        headers = returns[0].expression;
      } else {
        const responses = declarations.filter((node) => isName(node.name, "response") && node.initializer && ts.isAwaitExpression(node.initializer)
          && ts.isCallExpression(node.initializer.expression) && isThisProperty(node.initializer.expression.expression, "fetchImpl"));
        demand(responses.length === 1, "fetch canónico ausente");
        const fetch = responses[0].initializer.expression;
        const apiConstants = parsed.statements.filter(ts.isVariableStatement).flatMap((node) => node.declarationList.flags & ts.NodeFlags.Const ? [...node.declarationList.declarations] : [])
          .filter((node) => isName(node.name, "API"));
        demand(apiConstants.length === 1 && ts.isStringLiteral(apiConstants[0].initializer) && apiConstants[0].initializer.text === "/api/crm", "destino API no canónico");
        const destination = fetch.arguments[0];
        const expectedParts = methodName === "mutation" ? [["API", ""], ["path", ""]] : [["API", "/client-options?"], ["query", ""]];
        demand(fetch.arguments.length === 2 && ts.isTemplateExpression(destination) && destination.head.text === ""
          && destination.templateSpans.length === 2 && destination.templateSpans.every((span, index) => isName(span.expression, expectedParts[index][0]) && span.literal.text === expectedParts[index][1]), "destino fetch no canónico");
        const options = fetch.arguments[1];
        demand(options && ts.isObjectLiteralExpression(options), "opciones de fetch canónicas ausentes");
        const expectedOptions = new Set(methodName === "mutation" ? ["method", "headers", "credentials", "cache", "referrerPolicy", "body"] : ["headers", "credentials", "cache", "referrerPolicy"]);
        const optionNames = new Set();
        for (const option of options.properties) {
          const name = propertyName(option.name);
          demand((ts.isPropertyAssignment(option) || name === "method" && ts.isShorthandPropertyAssignment(option))
            && expectedOptions.has(name) && !optionNames.has(name), "opciones de fetch dinámicas o duplicadas");
          optionNames.add(name);
        }
        demand(optionNames.size === expectedOptions.size, "opciones de fetch incompletas");
        const fields = options.properties.filter((node) => ts.isPropertyAssignment(node) && propertyName(node.name) === "headers");
        demand(fields.length === 1 && ts.isObjectLiteralExpression(fields[0].initializer), "objeto headers canónico ausente");
        headers = fields[0].initializer;
      }
      demand(checks.every((node) => node.getEnd() < headers.getStart(parsed)), "selección se transporta antes de validar credenciales");
      const allowedNames = new Set(["Accept", "Content-Type", "Authorization", "X-OSI-Membership-Ref"]);
      const names = new Set();
      for (const field of headers.properties) {
        if (methodName === "headers" && ts.isSpreadAssignment(field)) {
          // The only spread is the existing optional JSON content type; it cannot
          // replace the bearer or the public membership selector.
          const value = ts.isParenthesizedExpression(field.expression) ? field.expression.expression : field.expression;
          demand(ts.isConditionalExpression(value) && isName(value.condition, "json")
            && ts.isObjectLiteralExpression(value.whenTrue) && value.whenTrue.properties.length === 1
            && ts.isPropertyAssignment(value.whenTrue.properties[0]) && propertyName(value.whenTrue.properties[0].name) === "Content-Type"
            && ts.isStringLiteral(value.whenTrue.properties[0].initializer) && value.whenTrue.properties[0].initializer.text === "application/json"
            && ts.isObjectLiteralExpression(value.whenFalse) && value.whenFalse.properties.length === 0, "spread de headers no autorizado");
          continue;
        }
        demand(ts.isPropertyAssignment(field) && allowedNames.has(propertyName(field.name)) && !names.has(propertyName(field.name)), "headers de autoridad no canónicos");
        names.add(propertyName(field.name));
      }
      const authorization = headers.properties.find((node) => ts.isPropertyAssignment(node) && propertyName(node.name) === "Authorization");
      demand(authorization && ts.isTemplateExpression(authorization.initializer) && authorization.initializer.head.text === "Bearer "
        && authorization.initializer.templateSpans.length === 1 && isName(authorization.initializer.templateSpans[0].expression, "token")
        && authorization.initializer.templateSpans[0].literal.text === "", "selector público sin bearer en el mismo objeto");
      const selector = headers.properties.find((node) => ts.isPropertyAssignment(node) && propertyName(node.name) === "X-OSI-Membership-Ref");
      demand(selector && ts.isStringLiteral(selector.name) && isName(selector.initializer, "membershipRef"), "autoridad frontend falsificable:selector no canónico");
      ranges.push([selector.name.getStart(parsed), selector.name.getEnd()]);
    }
    // Exempt only the exact approved property ranges. Extra headers, helpers,
    // comments or alternate methods cannot expand this exception.
    for (const [start, end] of ranges.sort((left, right) => right[0] - left[0])) checkedSource = checkedSource.slice(0, start) + " ".repeat(end - start) + checkedSource.slice(end);
  }
  forbid(checkedSource, /x-osi-|location\.(?:search|hash)|localStorage.*PRODUCTION_PILOT|sessionStorage.*PRODUCTION_PILOT/i, `autoridad frontend falsificable:${path}`);
}

const [gate, crmAccess, crmHttp, adminAccess, adminHttp, identityHttp, mutationUi, adminMode, adminApi, app, hub, adminModule] = await Promise.all([
  read("api/_lib/v17ProductionPilotGate.js"), read("api/_lib/crmPipelineAccess.js"), read("api/_lib/crmCaseMutationHttp.js"),
  read("api/_lib/adminMembershipAccess.js"), read("api/_lib/adminMembershipHttp.js"), read("api/_lib/adminIdentityInvitationHttp.js"),
  read("src/crm-relational/mutationApi.ts"), read("src/admin-tenant/adminMode.ts"), read("src/admin-tenant/adminApi.ts"), read("src/App.tsx"),
  read("src/hub/HubWorkspace.tsx"), read("src/admin-tenant/AdminTenantMembershipModule.tsx"),
]);

requireMatch(gate, /VERCEL_ENV === "production"[\s\S]*VERCEL_GIT_COMMIT_REF === "main"/, "la autoridad no verifica Production/main");
requireMatch(gate, /ACTIVATION_MANIFEST_SHA256[\s\S]*createHash\("sha256"\)/, "el manifiesto no está fijado por SHA-256");
requireMatch(gate, /tenantCode[\s\S]*deniedPermissions[\s\S]*effectivePermissions/, "el contexto tenant-first o deny no se valida");
for (const name of ["ADMIN_IDENTITY_INVITATIONS", "ADMIN_MEMBERSHIPS", "CRM_CASE_MUTATIONS"]) requireMatch(gate, new RegExp(`${name}: "${name}"`), `falta compuerta ${name}`);
for (const unsafe of ["PRODUCTION_WRITE", "ENABLED", "ALL_TENANTS"]) forbid(gate, new RegExp(`"${unsafe}"`), `modo ambiguo en autoridad focal: ${unsafe}`);
requireMatch(crmAccess, /requireCrmPipelineCaseMutation[\s\S]*PRODUCTION_PILOT/, "CRM no separa casos de mutaciones históricas");
requireMatch(crmAccess, /requireCrmPipelineMutation[\s\S]*PRODUCTION_PILOT[\s\S]*CRM_PIPELINE_MUTATIONS_DISABLED/, "mutaciones históricas no permanecen bloqueadas");
requireMatch(crmHttp, /gate\(env, req\)[\s\S]*resolveContext[\s\S]*requireV17ProductionPilotContext[\s\S]*readJsonObject/, "orden CRM configuración-auth-lote-body alterado");
requireMatch(adminAccess, /ADMIN_TENANT_MEMBERSHIP_MODE[\s\S]*ADMIN_IDENTITY_INVITATION_MODE/, "Administración e Invitaciones no poseen modos separados");
requireMatch(adminHttp, /requireAdminTenantMembershipAccess[\s\S]*resolveContext[\s\S]*requireAdminProductionPilotContext[\s\S]*readJsonObject/, "orden Administración alterado");
requireMatch(identityHttp, /requireAdminIdentityInvitationAccess[\s\S]*resolveContext[\s\S]*requireAdminProductionPilotContext/, "invitaciones administrativas no validan lote tras auth");
requireMatch(identityHttp, /resolveActivation[\s\S]*requireProductionPilotActivationTenant[\s\S]*activateNew/,
  "activación pública no resuelve invitación ni valida tenant del lote");
requireMatch(identityHttp, /V17_PRODUCTION_PILOT_ADMIN_EMAIL[\s\S]*expectedRecipientEmail/,
  "emisión y activación no fijan el destinatario productivo");
requireMatch(identityHttp, /ISSUE_PRODUCTION_PILOT_FIELDS = new Set\(\["requestId"\]\)[\s\S]*email: productionPilotRecipient\(env, mode\)/,
  "Production Pilot no separa el destinatario server-side del body público");
requireMatch(identityHttp, /invitationForMode[\s\S]*ADMIN_IDENTITY_INVITATION_MODES\.PRODUCTION_PILOT[\s\S]*invitationRef:/,
  "Production Pilot no publica un DTO de invitación cerrado sin destinatario");
requireMatch(mutationUi, /VITE_CRM_PIPELINE_CASE_MUTATION_MODE[\s\S]*PRODUCTION_PILOT/, "UI CRM no posee compuerta visual focal");
requireMatch(adminMode, /VITE_ADMIN_TENANT_MEMBERSHIP_MODE[\s\S]*VITE_ADMIN_IDENTITY_INVITATION_MODE/, "UI administrativa no separa visibilidad");
requireMatch(app, /isAdminIdentityActivationRoute\(\)[\s\S]*isAdminIdentityInvitationEnabled\(\)/, "activación lazy no depende de la compuerta de invitaciones");
requireMatch(hub, /invitationEnabled=\{adminInvitationsEnabled\}/, "Hub no transmite la compuerta focal de invitaciones");
requireMatch(hub, /invitationMode=\{adminInvitationMode\}/, "Hub no transmite el modo corporativo de invitación");
requireMatch(adminModule, /invitationEnabled && ADMIN_PERMISSIONS\.every/, "acciones de invitación no fallan cerradas visualmente");
requireMatch(adminModule, /Destinatario corporativo configurado[\s\S]*Generar invitación corporativa/,
  "la UI Production Pilot no presenta el flujo corporativo sin email manual");
requireMatch(adminApi, /issueCorporateInvitation[\s\S]*JSON\.stringify\(\{ requestId: crypto\.randomUUID\(\) \}\)/,
  "el cliente Production Pilot intenta enviar un destinatario");
// Execute the current Hub boundary contract instead of inspecting a historical
// diff allowlist. The focal server authority remains checked above and by its
// behavioral suite, including exact environment, manifest, recipient and tenant.
const hubContract = validateV17HubGuard({ root: fileURLToPath(root) });
for (const [path, source] of [
  ["src/crm-relational/mutationApi.ts", mutationUi], ["src/admin-tenant/adminMode.ts", adminMode],
  ["src/admin-tenant/adminApi.ts", adminApi], ["src/App.tsx", app],
  ["src/hub/HubWorkspace.tsx", hub], ["src/admin-tenant/AdminTenantMembershipModule.tsx", adminModule],
]) {
  validatePilotFrontendAuthority(path, source);
}

process.stdout.write(`${JSON.stringify({ ok: true, assertions: 31, hubContract: hubContract.authority }, null, 2)}\n`);
