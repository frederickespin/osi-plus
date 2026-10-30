import ts from "typescript";

const invariant = (value, message) => { if (!value) throw new Error(`HUB_CATALOG_CONTRACT:${message}`); };

export function readFrozenCatalog(source, name) {
  const file = ts.createSourceFile("appCatalog.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  invariant(file.parseDiagnostics.length === 0, "catálogo con sintaxis inválida");
  const declarations = file.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
  const initializer = declarations.length === 1 ? declarations[0].initializer : undefined;
  invariant(initializer && ts.isCallExpression(initializer)
    && ts.isPropertyAccessExpression(initializer.expression)
    && ts.isIdentifier(initializer.expression.expression)
    && initializer.expression.expression.text === "Object" && initializer.expression.name.text === "freeze"
    && initializer.arguments.length === 1 && ts.isArrayLiteralExpression(initializer.arguments[0]), `${name} debe ser declarativo y único`);
  function value(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value);
    invariant(ts.isObjectLiteralExpression(node), "propiedad dinámica o spread en catálogo");
    const result = Object.create(null);
    for (const property of node.properties) {
      invariant(ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), "propiedad dinámica o spread en catálogo");
      const key = property.name.text;
      invariant(!Object.hasOwn(result, key), "propiedad duplicada en catálogo");
      result[key] = value(property.initializer);
    }
    return result;
  }
  return initializer.arguments[0].elements.map(value);
}

const CONTRACTS = Object.freeze([
  { appId: "commercial-crm", route: "/commercial", aliases: ["/crm", "/sales/pipeline", "/commercial/relationships"], permissions: ["pipeline:view"], mode: "ALL", roles: ["A", "V"], explicit: true },
  { appId: "coordination", route: "/coordination", permissions: ["projects:view", "ops:view"], mode: "ANY", roles: ["A", "K"] },
  { appId: "operations", route: "/operations", permissions: ["ops:view", "osi:view", "security:view"], mode: "ANY", roles: ["A", "B", "C1", "D", "PE", "N", "E", "G"] },
  { appId: "materials-equipment", route: "/materials", permissions: ["inventory:catalog:view", "inventory:stock:view"], mode: "ALL", roles: [], explicit: true },
  { appId: "tools-equipment", route: "/assets", permissions: ["assets:instance:view"], mode: "ALL", roles: [], explicit: true },
  { appId: "workshop", route: "/workshop", permissions: ["wms:view", "fleet:view", "osi:view"], mode: "ANY", roles: ["A", "PA", "PB", "PC", "PD", "PF"] },
  { appId: "administration", route: "/administration", aliases: ["/administration/access", "/administration/services", "/administration/logistics", "/administration/costing", "/administration/communications", "/administration/policies"], permissions: ["membership:view", "services:catalog:view", "services:packages:view", "services:materials:view", "costing:rules:view", "logistics:rules:view", "communications:templates:view", "personnel:profiles:view", "personnel:capabilities:view", "scheduling:policies:view", "scheduling:exceptions:request", "scheduling:exceptions:approve", "scheduling:exceptions:respond"], mode: "ANY", roles: [], explicit: true, denyScope: "PERMISSION" },
  { appId: "human-resources", route: "/hr", permissions: ["hr:view"], mode: "ALL", roles: ["A", "I"] },
  { appId: "osi-survey", route: "/mobile/survey", aliases: ["/survey"], permissions: ["survey:assignment:view"], mode: "ALL", roles: [], explicit: true, suite: "osi-plus-mobile" },
  { appId: "packing-calculator", route: "/mobile/packing", permissions: ["pipeline:view"], mode: "ALL", roles: [], explicit: true, suite: "osi-plus-mobile", external: "https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html" },
]);

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length && expected.every((item) => actual.includes(item));
}

export function validateCommercialCatalog(source) {
  const matches = readFrozenCatalog(source, "HUB_APPLICATIONS").filter((application) => application.appId === "commercial-crm");
  invariant(matches.length === 1, "Comercial requiere un descriptor único");
  const application = matches[0];
  const contract = CONTRACTS[0];
  invariant(application.route === contract.route && sameMembers(application.routeAliases, contract.aliases), "rutas CRM equivalentes divergentes");
  invariant(sameMembers(application.requiredPermissions, contract.permissions) && application.permissionMode === contract.mode
    && application.requiresExplicitPermissions === true && sameMembers(application.baselineRoles, contract.roles), "autoridad Comercial explícita A/V + pipeline:view ausente");
  return application;
}

export function validateHubCatalog(source) {
  const applications = readFrozenCatalog(source, "HUB_APPLICATIONS");
  invariant(sameMembers(applications.map((application) => application.appId), CONTRACTS.map((contract) => contract.appId)), "inventario de aplicaciones distinto del contrato vigente");
  const suites = readFrozenCatalog(source, "HUB_SUITES");
  invariant(suites.length === 1 && suites[0].suiteId === "osi-plus-mobile" && suites[0].route === "/mobile", "suite Mobile no canónica");
  const routes = new Set([suites[0].route]);
  for (const contract of CONTRACTS) {
    const application = applications.find((item) => item.appId === contract.appId);
    invariant(application.route === contract.route && sameMembers(application.routeAliases || [], contract.aliases || []), `rutas o alias alterados:${contract.appId}`);
    invariant(sameMembers(application.requiredPermissions, contract.permissions) && application.permissionMode === contract.mode
      && sameMembers(application.baselineRoles, contract.roles) && (application.requiresExplicitPermissions === true) === Boolean(contract.explicit), `autoridad alterada:${contract.appId}`);
    invariant(application.suiteId === contract.suite && application.externalHref === contract.external, `suite o destino externo alterado:${contract.appId}`);
    invariant(application.denyScope === contract.denyScope, `alcance de denegación alterado:${contract.appId}`);
    invariant(application.lazy === true && application.directAccessAllowed === true, `contrato lazy/ruta directa alterado:${contract.appId}`);
    for (const route of [application.route, ...(application.routeAliases || [])]) {
      invariant(/^\/[a-z][a-z-]*(?:\/[a-z][a-z-]*)*$/.test(route) && !routes.has(route), `ruta insegura o duplicada:${route}`);
      routes.add(route);
    }
  }
  return { applications, suites, routes: [...routes] };
}
