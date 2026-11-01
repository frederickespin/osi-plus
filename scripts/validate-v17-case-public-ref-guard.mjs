import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const V17_CASE_PUBLIC_REF_MIGRATION = "20260821010000_v17_pipeline_case_public_ref";
const V17_CLIENT_PUBLIC_REF_MIGRATION = "20260824010000_v17_client_public_ref_case_mutations";
const V17_MEMBERSHIP_PUBLIC_REF_MIGRATION = "20260827010000_v17_tenant_membership_public_ref";
const V17_ADMIN_IDENTITY_INVITATION_MIGRATION = "20260827020000_v17_admin_identity_invitation";
const V17_CRM_ICP_FOUNDATION_MIGRATION = "20260831010000_v17_crm_icp_foundation";
const PREVIOUS_MIGRATION_HASHES = Object.freeze({
  "20260801000000_production_baseline": "59a6060c78107a73cf9793da65cc5fc1a35d9d3c5e60ae37e04e5f395812bb2c",
  "20260801001000_mt01a_tenant_memberships": "015c8bd39f050f71fbe1bea0f94198091149296269fed77905bcefd23094cd44",
  "20260801002000_commercial_audit_log": "b7f2a68d769b1d3564a042d282e98e84bed9b8ceb2c5c2369c96e8d66d346206",
  "20260801003000_approval_requests": "5802a029f4e83aa4a76e8a1f753bb4ebd71449d2538d2ba20edaa37c225a782a",
  "20260801004000_risk_engine_rules_evaluations": "2575855557b64ee46166e85c61768339f08770aa6af3f18d77b5d3b62da00b08",
  "20260801005000_logistic_override_approvals": "15a864aa487a66457e39e459b4767871863c5798d76f1a607f96a628986385df",
  "20260801006000_quote_change_orders": "91cccaf3f19cebb9880fcdec880ffa8ed0e6ece1975e4b38924b5794b86b1f6c",
  "20260801007000_logistics_geography_zone_rules": "77c32308f74d6ceb9e6ef9f45856d2cfe7169f9b3162f32808208bc30adae04b",
  "20260801008000_vehicle_engine_settings": "4f61d20698ec8e61f5324f436e8012e63dc29c1e883b6e3922cc3cc9696499b3",
  "20260801009000_logistics_rate_metadata": "8852e835e027fc76d828d9a3ab2e1c40f251f817ab4f573296bb39224b425899",
  "20260801010000_crate_settings": "d834b99fe7083e5d9907a7b0c49ac6d0d3ff1f577de638e098c04ea9513f5310",
  "20260801011000_mt01b_auth_sessions": "8d707e9b93d1bd6c1d15a7feee54189bef2a55718a85fb50c57048383c37f57c",
  "20260801012000_mt01c1a_employee_profiles": "8da805f6923e7b3ef30c8cf4cd46dfddfafefe39d758023102c9eaa1b5f53131",
  "20260801013000_mt01c1b1_provisioning_persistence": "38585d10feca36a488bdee93c7056880545bf2c7fcea333736e6e36d90c46bae",
  "20260801014000_mt01c2b1_commercial_tenant_foundation": "776e0c167cb0d7561537745cced0438299dea90af1e7bc010325822519d1811b",
  "20260801015000_crm01b_pipeline_mutation_authority": "77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8",
  "20260801020000_v17_pipeline_case_client_authority": "7ca9bb66584016879e00b9753da04521238ad164581ab6f755c73783a9feed1d",
});

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_CASE_PUBLIC_REF_GUARD: ${message}`);
}
function normalizedSha(source) {
  return createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");
}
function modelBlock(source, name) {
  const match = source.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  invariant(match, `modelo ${name} ausente`);
  return match[1];
}
function runtimeSources(root) {
  const result = {};
  for (const namespace of ["api", "src"]) {
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) result[path.slice(root.length + 1).replaceAll("\\", "/")] = readFileSync(path, "utf8");
      }
    };
    walk(resolve(root, namespace));
  }
  return result;
}
function containsLegacyFrontendIdentifier(source) {
  return /\b(?:const|let|var)\s+(?:clientName|caseNumber)\b/.test(source)
    || /(?:\.|\{|,)\s*(?:clientName|caseNumber)\s*(?::|=|,|\})/.test(source)
    || /["'](?:clientName|caseNumber)["']\s*:/.test(source);
}

// An exact inventory classifies the reference, not merely the directory. A
// registered consumer must also retain its tenant-bound queries below; adding a
// filename here never exempts its database operations from validation.
export const PUBLIC_REFERENCE_CONTRACTS = Object.freeze({
  "api/_lib/adminIdentityInvitationDomain.js": ["INVITATION", "MEMBERSHIP"],
  "api/_lib/adminMembershipDomain.js": ["MEMBERSHIP"],
  "api/_lib/adminUserEnrollmentDomain.js": ["MEMBERSHIP"],
  "api/_lib/adminUserIdentityDomain.js": ["MEMBERSHIP"],
  "api/_lib/authContext.js": ["MEMBERSHIP"],
  "api/_lib/authorizationContext.js": ["MEMBERSHIP"],
  "api/_lib/clientTemporaryAccessDomain.js": ["CASE"],
  "api/_lib/commercialRelationshipsDomain.js": ["CASE", "CLIENT"],
  "api/_lib/commercialTenancyWrite.js": ["MEMBERSHIP", "CLIENT"],
  "api/_lib/communicationsDomain.js": ["CASE", "MEMBERSHIP"],
  "api/_lib/costingDomain.js": ["CASE"],
  "api/_lib/crmCaseMutationDomain.js": ["CASE", "CLIENT"],
  "api/_lib/crmClientOptions.js": ["CLIENT"],
  "api/_lib/crmIcpV2ApiDomain.js": ["CASE", "CLIENT"],
  "api/_lib/crmIcpV2Domain.js": ["CASE", "CLIENT"],
  "api/_lib/crmPipelineRead.js": ["CASE", "CLIENT"],
  "api/_lib/crmServicesApiDomain.js": ["CASE"],
  "api/_lib/crmSurveyDomain.js": ["CASE", "MEMBERSHIP"],
  "api/_lib/fleetActor.js": ["MEMBERSHIP"],
  "api/_lib/fleetDriversDomain.js": ["MEMBERSHIP"],
  "api/_lib/logisticsEngineDomain.js": ["CASE"],
  "api/_lib/logisticsTransportDomain.js": ["CASE"],
  "api/_lib/logisticsTransportZones.js": ["MEMBERSHIP"],
  "api/_lib/materialsInventoryDomain.js": ["CASE"],
  "api/_lib/personnelPoliciesDomain.js": ["CASE", "CLIENT", "MEMBERSHIP"],
  "api/_lib/quoteDomain.js": ["CASE", "CLIENT"],
  "api/_lib/servicePackagesDomain.js": ["CASE"],
  "api/_lib/surveySchedulingDomain.js": ["CASE", "CLIENT", "MEMBERSHIP"],
  "api/_lib/toolsEquipmentDomain.js": ["CASE", "MEMBERSHIP"],
  "api/_lib/warehouseSheetDomain.js": ["MEMBERSHIP"],
});
for (const kinds of Object.values(PUBLIC_REFERENCE_CONTRACTS)) Object.freeze(kinds);
const REFERENCE_MODELS = Object.freeze({
  pipelineCase: "CASE", client: "CLIENT", tenantMembership: "MEMBERSHIP",
  pipelineCaseCommand: "CASE", costingCalculation: "CASE", costingRevision: "CASE",
  costingOverride: "CASE", logisticsCalculation: "CASE", logisticsPlanRevision: "CASE",
  communicationRecord: "CASE", afterHoursVisitRequest: "CASE",
});
const REFERENCE_TABLES = Object.freeze({
  osi_pipeline_cases: "CASE", osi_clients: "CLIENT", tenant_memberships: "MEMBERSHIP",
  admin_identity_invitations: "INVITATION", osi_users: "MEMBERSHIP", auth_sessions: "MEMBERSHIP",
});

function visitNodes(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visitNodes(child, visitor));
}
function propertyValue(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const matches = object.properties.filter((property) => property.name
    && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name);
  if (matches.length !== 1) return undefined;
  return ts.isShorthandPropertyAssignment(matches[0]) ? matches[0].name : matches[0].initializer;
}
function constInitializer(identifier) {
  if (!identifier || !ts.isIdentifier(identifier)) return undefined;
  for (let parent = identifier.parent; parent; parent = parent.parent) {
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      for (const statement of parent.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const declaration = statement.declarationList.declarations.find((entry) => ts.isIdentifier(entry.name) && entry.name.text === identifier.text);
        if (declaration) return (statement.declarationList.flags & ts.NodeFlags.Const) && declaration.pos < identifier.pos ? declaration.initializer : undefined;
      }
    }
    if (ts.isFunctionLike(parent) && parent.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text)) return undefined;
  }
  return undefined;
}
function enclosingFunction(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent)) return parent.name?.text;
  }
  return null;
}
function trustedTenantValue(node, source, bindings = new Map(), seen = new Set()) {
  if (!node || seen.has(node)) return false;
  const next = new Set(seen).add(node);
  if (ts.isIdentifier(node) && bindings.has(node.text)) return trustedTenantValue(bindings.get(node.text), source, new Map(), next);
  const text = node.getText(source).replace(/\s+/g, "");
  return /^(?:tenantId|(?:who|actor|context)\.tenantId|String\(tenantId\))$/.test(text);
}

function validateReferenceConsumer(path, content, kinds) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  invariant(source.parseDiagnostics.length === 0, "consumidor publicRef con sintaxis inválida: " + path);
  const clean = ts.createPrinter({ removeComments: true }).printFile(source);
  const compact = clean.replace(/\s+/g, "");
  const definitions = new Map(source.statements.filter(ts.isFunctionDeclaration).map((node) => [node.name?.text, node]));
  const fail = (message) => invariant(false, path + ": contrato tenant-first " + message);

  // Return 1 for a guaranteed trusted tenant, 0 for no tenant, 2 for an optional
  // trusted tenant, and -1 for an unknown/unsafe overwrite. Spreads are checked
  // in source order, so a later raw spread cannot replace an authorized tenant.
  function tenantState(node, bindings = new Map(), seen = new Set()) {
    if (!node || seen.has(node)) return -1;
    const next = new Set(seen).add(node);
    if (ts.isParenthesizedExpression(node)) return tenantState(node.expression, bindings, next);
    if (ts.isIdentifier(node)) return tenantState(constInitializer(node) ?? bindings.get(node.text), bindings, next);
    if (ts.isConditionalExpression(node)) {
      const yes = tenantState(node.whenTrue, bindings, next), no = tenantState(node.whenFalse, bindings, next);
      return yes < 0 || no < 0 ? -1 : yes === no ? yes : 2;
    }
    if (ts.isObjectLiteralExpression(node)) {
      let state = 0;
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = tenantState(property.expression, bindings, next);
          state = spread === 0 ? state : spread === 2 && state === 1 ? 1 : spread;
        } else if (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
          if (property.name.text === "tenantId") state = trustedTenantValue(ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer, source, bindings) ? 1 : -1;
        } else state = -1;
      }
      return state;
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.getText(source) === "Object.freeze") return tenantState(node.arguments[0], bindings, next);
      if (!ts.isIdentifier(node.expression)) return -1;
      const name = node.expression.text;
      if (path === "api/_lib/crmPipelineRead.js" && name === "resolveCrmPipelineReadScope") {
        // Its role/owner/404 contract is independently checked by the main guard.
        return tenantState(node.arguments[0], bindings, next);
      }
      const definition = definitions.get(name);
      if (!definition?.body) return -1;
      const parameters = new Map(bindings);
      definition.parameters.forEach((parameter, index) => {
        if (ts.isIdentifier(parameter.name)) parameters.set(parameter.name.text, node.arguments[index]);
      });
      const returns = [];
      function returned(child) {
        if (ts.isReturnStatement(child)) returns.push(tenantState(child.expression, parameters, next));
        else if (!ts.isFunctionLike(child)) ts.forEachChild(child, returned);
      }
      returned(definition.body);
      return returns.length === 0 || returns.some((state) => state < 0) ? -1 : returns.every((state) => state === 1) ? 1 : returns.every((state) => state === 0) ? 0 : 2;
    }
    return -1;
  }

  function sqlParts(node) {
    const template = node.template;
    if (ts.isNoSubstitutionTemplateLiteral(template)) return { sql: template.text, values: [] };
    const values = template.templateSpans.map((span) => span.expression);
    return { sql: template.head.text + template.templateSpans.map((span, index) => "<" + index + ">" + span.literal.text).join(""), values };
  }
  function sessionSql(node, sql, values) {
    const name = enclosingFunction(node);
    const normalized = sql.replace(/\s+/g, "");
    const expressions = values.map((value) => value.getText(source).replace(/\s+/g, ""));
    const legacy = path === "api/_lib/authContext.js" && ["resolveLegacyAuthorizationContext", "listLegacyMembershipOptions", "resolveSingleActiveMembership"].includes(name)
      || path === "api/_lib/commercialTenancyWrite.js" && name === "resolveLegacyCommercialContext";
    if (legacy) {
      const principal = name === "listLegacyMembershipOptions" ? "String(userId)" : name === "resolveSingleActiveMembership" ? "userId" : "String(payload.sub)";
      const predicate = name === "resolveSingleActiveMembership" ? 'WHEREtm."user_id"=<0>' : 'WHEREu."id"=<0>';
      return expressions.length === 1 && expressions[0] === principal && normalized.includes(predicate)
        && (normalized.includes('tm."user_id"=u."id"') || normalized.includes('u."id"=tm."user_id"'))
        && normalized.includes('t."id"=tm."tenant_id"') && !/\bOR\b/.test(sql);
    }
    if (path === "api/_lib/authContext.js" && name === "resolveV2Context") {
      return JSON.stringify(expressions) === JSON.stringify(["payload.sid", "payload.tenantId", "payload.membershipId", "payload.sub"])
        && normalized.includes('tm."tenant_id"=s."tenant_id"ANDtm."id"=s."membership_id"ANDtm."user_id"=s."user_id"')
        && normalized.includes('WHEREs."id"=<0>ANDs."tenant_id"=<1>ANDs."membership_id"=<2>ANDs."user_id"=<3>')
        && !/\bOR\b/.test(sql);
    }
    return false;
  }
  function enrollmentTenant(node, value) {
    // Activation obtains its company from the pending, unexpired token row.
    // This exception is specific to that immutable binding and lookup, never
    // to every query in an enrollment file or to a caller-supplied tenant.
    if (path !== "api/_lib/adminUserEnrollmentDomain.js" || enclosingFunction(node) !== "activateUserEnrollment"
      || !value || !ts.isPropertyAccessExpression(value) || value.getText(source) !== "row.tenant_id") return false;
    const bound = constInitializer(value.expression);
    const call = bound && ts.isAwaitExpression(bound) ? bound.expression : null;
    if (!call || !ts.isCallExpression(call) || call.expression.getText(source) !== "activationRow"
      || call.arguments[0]?.getText(source) !== "tx" || call.arguments[1]?.getText(source) !== "tokenHash"
      || propertyValue(call.arguments[2], "lock")?.kind !== ts.SyntaxKind.TrueKeyword) return false;
    const tokenHash = constInitializer(call.arguments[1]);
    if (!tokenHash || !ts.isCallExpression(tokenHash) || tokenHash.expression.getText(source) !== "hashUserEnrollmentToken"
      || tokenHash.arguments.length !== 1 || tokenHash.arguments[0].getText(source) !== "input.token") return false;
    const lookup = definitions.get("activationRow");
    if (!lookup) return false;
    const lookupCode = ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, lookup, source).replace(/\s+/g, "");
    if (!lookupCode.includes("constrow=rows[0];") || !lookupCode.includes("returnrow;")
      || !lookupCode.includes('!row||row.status!=="PENDING"||row.tenant_status!=="ACTIVE"||newDate(row.expires_at)<=now')
      || !lookupCode.includes('(expectedTenantCode&&row.tenant_code!==expectedTenantCode))identityFail("ACTIVATION_INVALID")')) return false;
    let lookups = 0;
    visitNodes(lookup, (query) => {
      if (!ts.isTaggedTemplateExpression(query) || query.tag.getText(source) !== "Prisma.sql") return;
      const parts = sqlParts(query);
      if (parts.sql.replace(/\s+/g, "").includes('FROM"osi"."user_enrollments"eJOIN"osi"."tenants"tONt."id"=e."tenant_id"WHEREe."token_hash"=<0>')
        && parts.values[0]?.getText(source) === "tokenHash" && !/\bOR\b/.test(parts.sql)) lookups += 1;
    });
    return lookups === 1;
  }
  function composedMembershipSql() {
    const handled = new Set(); let queries = 0;
    const warehouseSheet = path === "api/_lib/warehouseSheetDomain.js";
    if (path !== "api/_lib/fleetDriversDomain.js" && !warehouseSheet) return { handled, queries };
    // These consumers share a projection and joins across their read helpers.
    // Validate the expanded SQL at every database call, including both branches
    // of an optional predicate. Registering a projection never exempts its use.
    const helpers = new Set(warehouseSheet ? ["managerSelect", "managerFrom"] : ["personColumns", "personJoins"]);
    function joined(left, right) {
      return { sql: left.sql + right.sql.replace(/<(\d+)>/g, (_, index) => `<${Number(index) + left.values.length}>`),
        values: [...left.values, ...right.values], templates: new Set([...left.templates, ...right.templates]) };
    }
    const literal = (sql) => ({ sql, values: [], templates: new Set() });
    function expand(node, ancestors = new Set()) {
      if (!node || ancestors.has(node)) fail("fragmento SQL circular o ausente");
      const seen = new Set(ancestors).add(node);
      if (ts.isParenthesizedExpression(node)) return expand(node.expression, seen);
      if (node.getText(source) === "Prisma.empty") return [literal("")];
      if (ts.isConditionalExpression(node)) return [...expand(node.whenTrue, seen), ...expand(node.whenFalse, seen)];
      if (ts.isIdentifier(node)) {
        const value = constInitializer(node);
        if (value && (ts.isTaggedTemplateExpression(value) && value.tag.getText(source) === "Prisma.sql"
          || warehouseSheet && ts.isConditionalExpression(value))) return expand(value, seen);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) {
        const definition = definitions.get(node.expression.text);
        const statements = definition?.body?.statements;
        if (node.arguments.length || definition?.parameters.length || statements?.length !== 1
          || !ts.isReturnStatement(statements[0]) || !statements[0].expression
          || !ts.isTaggedTemplateExpression(statements[0].expression)
          || statements[0].expression.tag.getText(source) !== "Prisma.sql") fail("fragmento de membresía no es una proyección SQL local verificable");
        return expand(statements[0].expression, seen);
      }
      if (!ts.isTaggedTemplateExpression(node) || node.tag.getText(source) !== "Prisma.sql") {
        return [{ sql: "<0>", values: [node], templates: new Set() }];
      }
      const template = node.template;
      if (ts.isNoSubstitutionTemplateLiteral(template)) return [{ ...literal(template.text), templates: new Set([node]) }];
      let variants = [{ ...literal(template.head.text), templates: new Set([node]) }];
      for (const span of template.templateSpans) {
        const additions = expand(span.expression, seen);
        variants = variants.flatMap((prefix) => additions.map((addition) => joined(joined(prefix, addition), literal(span.literal.text))));
        if (variants.length > 32) fail("demasiadas variantes SQL para verificar el alcance");
      }
      return variants;
    }
    function topLevelOr(sql) {
      let depth = 0;
      const unquoted = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (value) => " ".repeat(value.length));
      for (const token of unquoted.matchAll(/\(|\)|\bOR\b/giu)) {
        if (token[0] === "(") depth += 1;
        else if (token[0] === ")") depth -= 1;
        else if (depth === 0) return true;
        if (depth < 0) return true;
      }
      return depth !== 0;
    }
    function warehouseCteBody(sql, node) {
      const prefix = /^\s*WITH\s+e\s+AS\s*\(/.exec(sql);
      if (!prefix || enclosingFunction(node) !== "listWarehouseManagerOptions") return null;
      // Only this local, tenant-bound CTE is supported. The complete outer read
      // must consume e; additional tables, CTEs, subqueries and set operations
      // cannot hide outside the membership predicate that is checked below.
      const unquoted = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (value) => " ".repeat(value.length));
      let depth = 1; let end = prefix[0].length;
      for (; end < unquoted.length && depth; end += 1) {
        if (unquoted[end] === "(") depth += 1;
        else if (unquoted[end] === ")") depth -= 1;
      }
      if (depth !== 0) fail("CTE de encargados no está cerrado");
      const body = sql.slice(prefix[0].length, end - 1);
      const outer = sql.slice(end).replace(/\s+/g, " ").trim();
      const search = '(?: AND e\\."display_name" ILIKE <\\d+> ESCAPE \'[^\']*\')?';
      const count = new RegExp('^SELECT COUNT\\(\\*\\)::integer AS "total" FROM e WHERE e\\."eligible"' + search + '$');
      const rows = new RegExp('^SELECT \\* FROM e WHERE e\\."eligible"' + search
        + ' ORDER BY LOWER\\(e\\."display_name"\\),e\\."membership_ref" LIMIT <\\d+> OFFSET <\\d+>$');
      if (!/^\s*SELECT\s/.test(body) || !count.test(outer) && !rows.test(outer)) {
        fail("lectura exterior del CTE de encargados no está limitada a e");
      }
      return body;
    }
    visitNodes(source, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
        || !/^\$(?:queryRaw|executeRaw)$/.test(node.expression.name.text) || node.arguments.length !== 1
        || !ts.isTaggedTemplateExpression(node.arguments[0]) || node.arguments[0].tag.getText(source) !== "Prisma.sql") return;
      const variants = expand(node.arguments[0]);
      if (!variants.some(({ sql }) => /\bpublic_ref\b|\bFROM\s+"osi"\."tenant_memberships"\s+m\b/.test(sql))) return;
      for (const { sql: template, values, templates } of variants) {
        const sql = template.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g, " ");
        const cte = warehouseSheet ? warehouseCteBody(sql, node) : null;
        const scopedSql = cte ?? sql;
        const from = /\bFROM\s+"osi"\."tenant_memberships"\s+m\b/.test(scopedSql);
        const where = scopedSql.match(cte
          ? /\bWHERE\s+m\."tenant_id"\s*=\s*<(\d+)>(?=\s*(?:AND\b|$))/
          : /\bWHERE\s+m\."tenant_id"\s*=\s*<(\d+)>(?=\s+AND\b)/);
        if (!from || !where || !trustedTenantValue(values[Number(where[1])], source)
          || topLevelOr(scopedSql.slice(where.index)) || /\b(?:UNION|INTERSECT|EXCEPT)\b/i.test(sql)) {
          fail("SQL público compuesto perdió el predicado obligatorio de empresa en " + enclosingFunction(node));
        }
        for (const fragment of templates) handled.add(fragment);
      }
      queries += 1;
    });
    return { handled, queries };
  }
  const membershipSql = composedMembershipSql();
  let prismaQueries = 0, sqlQueries = membershipSql.queries;
  visitNodes(source, (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === "tenantId") fail("no admite reasignar tenantId");
    if (ts.isDeleteExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "tenantId") fail("no admite eliminar tenantId");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && /^\$(?:queryRaw|executeRaw)(?:Unsafe)?$/.test(node.expression.name.text)
      && /\bpublic_ref\b/.test(node.arguments.map((argument) => argument.getText(source)).join(" "))
      && (node.arguments.length !== 1 || !ts.isTaggedTemplateExpression(node.arguments[0]) || node.arguments[0].tag.getText(source) !== "Prisma.sql")) {
      fail("SQL público sin parámetros Prisma.sql verificables");
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && /^(?:findFirst|findUnique|findUniqueOrThrow|findMany|count|groupBy|aggregate|create|createMany|update|updateMany|delete|deleteMany|upsert)$/.test(node.expression.name.text)) {
      const target = node.expression.expression;
      const model = ts.isPropertyAccessExpression(target) ? target.name.text : null;
      const args = node.arguments[0];
      if (!["pipelineCase", "client", "tenantMembership"].includes(model) && !/\bpublicRef\b/.test(args?.getText(source) || "")) return;
      const kind = REFERENCE_MODELS[model];
      if (!kind || !kinds.includes(kind)) fail("modelo de referencia sin clasificar: " + model);
      const field = /^(?:create|createMany)$/.test(node.expression.name.text) ? "data" : "where";
      if (tenantState(propertyValue(args, field)) !== 1) fail("ausente o dinámico en " + target.getText(source) + "." + node.expression.name.text);
      prismaQueries += 1;
    }
    if (!ts.isTaggedTemplateExpression(node) || node.tag.getText(source) !== "Prisma.sql" || !/\bpublic_ref\b/.test(node.template.getText(source)) || membershipSql.handled.has(node)) return;
    const parts = sqlParts(node);
    const sql = parts.sql.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g, " ");
    const values = parts.values;
    const table = sql.match(/\b(?:FROM|INSERT INTO|UPDATE)\s+"osi"\."([^"]+)"/)?.[1];
    if (!REFERENCE_TABLES[table] || !kinds.includes(REFERENCE_TABLES[table])) fail("tabla de referencia sin clasificar: " + table);
    let scoped = sessionSql(node, sql, values);
    if (/\bINSERT INTO\b/.test(sql)) {
      const insertion = sql.match(/\bINSERT INTO\s+"osi"\."[^"]+"\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/);
      if (insertion) {
        const column = insertion[1].split(",").map((value) => value.trim()).indexOf('"tenant_id"');
        const token = insertion[2].split(",")[column]?.trim().match(/^<(\d+)>$/);
        const value = token ? values[Number(token[1])] : null;
        const invitationTenant = path === "api/_lib/adminIdentityInvitationDomain.js" && value?.getText(source) === "invitation.tenant_id"
          && ["activateNewAdminIdentity", "acceptExistingAdminIdentity"].includes(enclosingFunction(node));
        scoped = column >= 0 && (trustedTenantValue(value, source) || invitationTenant || enrollmentTenant(node, value));
      }
    } else {
      const tenant = sql.match(/\bWHERE\s+(?:[a-z]+\.)?"tenant_id"\s*=\s*<(\d+)>/);
      if (tenant && trustedTenantValue(values[Number(tenant[1])], source) && !/\bOR\b/.test(sql)) scoped = true;
      // The membership list composes AND predicates; its first term is the
      // revalidated actor's tenant, not a request-supplied identifier.
      const directoryConsumer = (path === "api/_lib/adminMembershipDomain.js" && enclosingFunction(node) === "listTenantMemberships")
        || (path === "api/_lib/adminUserIdentityDomain.js" && enclosingFunction(node) === "listUserIdentityDirectory");
      if (directoryConsumer && /\bWHERE\s+<0>/.test(sql)) {
        const where = constInitializer(values[0]);
        const conditions = where && ts.isCallExpression(where) && where.expression.getText(source) === "Prisma.join"
          && ts.isStringLiteral(where.arguments[1]) && where.arguments[1].text === " AND " ? constInitializer(where.arguments[0]) : null;
        const first = conditions && ts.isArrayLiteralExpression(conditions) ? conditions.elements[0] : null;
        if (first && ts.isTaggedTemplateExpression(first) && first.tag.getText(source) === "Prisma.sql") {
          const initial = sqlParts(first);
          scoped = initial.sql.replace(/\s+/g, "") === 'tm."tenant_id"=<0>' && initial.values[0]?.getText(source) === "actor.tenantId";
        }
      }
    }
    if (!scoped) fail("SQL público perdió el vínculo de empresa/identidad en " + enclosingFunction(node));
    sqlQueries += 1;
  });
  if (path === "api/_lib/authorizationContext.js") {
    invariant(compact.includes("if(!user?.id||!membership?.id||!tenant?.id)")
      && compact.includes("tenantId:frozenTenant.id") && compact.includes("membershipRef:frozenMembership.publicRef"),
    path + ": proyección de membresía sin User/Membership/Tenant canónicos");
  } else if (path === "api/_lib/crmIcpV2Domain.js") {
    invariant(compact.includes('!UUID_V4.test(value))fail("CRM_PIPELINE_RESOURCE_NOT_FOUND",404)')
      && compact.includes("tenantId:authority.tenantId") && compact.includes("requireCrmIcpSearchAuthority(context)"),
    path + ": contrato UUID/404 o autoridad tenant-first ausente");
  } else invariant(prismaQueries + sqlQueries > 0, path + ": consumidor sin contrato tenant-first verificable");
  return { kinds, prismaQueries, sqlQueries };
}

export function validateV17CasePublicRefGuard({
  root = process.cwd(), migrationNames, schemaSource, migrationSource,
  previousMigrationSources, extraRuntimeSources,
} = {}) {
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  invariant(migrations.length >= 22, "se exigen al menos 22 migraciones");
  invariant(new Set(migrations).size === migrations.length && migrations.every((name, index) => index === 0 || migrations[index - 1] < name),
    "las 22 migraciones iniciales y sus extensiones deben conservar el orden sin duplicados");
  invariant(migrations.includes(V17_CASE_PUBLIC_REF_MIGRATION), "migración 18 exacta ausente");
  invariant(migrations.includes(V17_CLIENT_PUBLIC_REF_MIGRATION), "migración 19 exacta ausente");
  invariant(migrations.includes(V17_MEMBERSHIP_PUBLIC_REF_MIGRATION), "migración 20 exacta ausente");
  invariant(migrations.includes(V17_ADMIN_IDENTITY_INVITATION_MIGRATION), "migración 21 exacta ausente");
  invariant(migrations.indexOf(V17_CRM_ICP_FOUNDATION_MIGRATION) === 21, "migración 22 ICP exacta ausente o fuera de orden");

  const schema = schemaSource ?? readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const sql = (migrationSource ?? readFileSync(resolve(root, "prisma/migrations", V17_CASE_PUBLIC_REF_MIGRATION, "migration.sql"), "utf8")).replaceAll("\r\n", "\n");
  const pipeline = modelBlock(schema, "PipelineCase");
  invariant(/^\s*publicRef\s+String\s+@default\(dbgenerated\("gen_random_uuid\(\)"\)\)\s+@map\("public_ref"\)\s+@db\.Uuid\s*$/m.test(pipeline), "publicRef debe ser UUID NOT NULL con default PostgreSQL");
  invariant(/@@unique\(\[tenantId, publicRef\], map: "osi_pipeline_cases_tenant_id_public_ref_key"\)/.test(pipeline), "unicidad tenant-first ausente");
  invariant(!/publicRef\s+String\?/.test(pipeline), "publicRef no puede ser nullable");
  invariant(!/(?:@default\(cuid|@default\(uuid)/.test(pipeline.match(/^\s*publicRef.*$/m)?.[0] || ""), "Prisma no puede generar publicRef");

  invariant((sql.match(/^BEGIN;$/gm) || []).length === 1 && (sql.match(/^COMMIT;$/gm) || []).length === 1,
    "la migración debe declarar una única transacción explícita");
  invariant(/^COMMIT;\s*$/.test(sql.slice(sql.lastIndexOf("COMMIT;"))), "COMMIT debe cerrar el archivo");
  invariant(/to_regprocedure\('pg_catalog\.gen_random_uuid\(\)'\)/.test(sql), "preflight de gen_random_uuid ausente");
  invariant(/ADD COLUMN "public_ref" UUID;/.test(sql), "expansión nullable UUID ausente");
  invariant(/UPDATE "osi"\."osi_pipeline_cases"\s+SET "public_ref" = pg_catalog\.gen_random_uuid\(\)\s+WHERE "public_ref" IS NULL;/m.test(sql), "backfill UUID aleatorio exacto ausente");
  invariant(/WHERE "public_ref" IS NULL;\s+\n\s*(?:--[^\n]*\n)*SET CONSTRAINTS ALL IMMEDIATE;/m.test(sql), "eventos de triggers diferidos no se drenan antes del ALTER TABLE");
  invariant(/ALTER COLUMN "public_ref" SET DEFAULT pg_catalog\.gen_random_uuid\(\),\s+ALTER COLUMN "public_ref" SET NOT NULL;/m.test(sql), "default o NOT NULL ausente");
  invariant(/ADD CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"\s+UNIQUE \("tenant_id", "public_ref"\)/m.test(sql), "constraint tenant-first ausente");
  invariant(/CREATE FUNCTION "osi"\."osi_prevent_pipeline_case_public_ref_change"\(\)/.test(sql), "función de inmutabilidad ausente");
  invariant(/NEW\."public_ref" IS DISTINCT FROM OLD\."public_ref"/.test(sql), "comparación inmutable incorrecta");
  invariant(/RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_IMMUTABLE'\s+USING ERRCODE = '23514'/.test(sql), "rechazo inmutable sanitizado ausente");
  invariant(/CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"\s+BEFORE UPDATE OF "public_ref"/m.test(sql), "trigger de inmutabilidad ausente");
  invariant(!/(?:CREATE EXTENSION|session_replication_role|DISABLE TRIGGER|SECURITY DEFINER|id::uuid|digest\(|jwt|secret)/i.test(sql), "fallback, extensión o debilitamiento prohibido");
  invariant(!/\bEXECUTE\s+(?!FUNCTION\b)/i.test(sql), "SQL dinámico prohibido");
  invariant((sql.match(/^UPDATE\b/gm) || []).length === 1, "sólo se permite el UPDATE técnico de backfill");
  const orderedSteps = [
    "BEGIN;", "to_regprocedure('pg_catalog.gen_random_uuid()')", 'ADD COLUMN "public_ref" UUID;',
    'UPDATE "osi"."osi_pipeline_cases"', "V17_PIPELINE_CASE_PUBLIC_REF_BACKFILL_INCOMPLETE",
    'ALTER COLUMN "public_ref" SET DEFAULT', 'ADD CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"',
    'CREATE FUNCTION "osi"."osi_prevent_pipeline_case_public_ref_change"()',
    'CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"', "COMMIT;",
  ].map((step) => sql.indexOf(step));
  invariant(orderedSteps.every((position) => position >= 0)
    && orderedSteps.every((position, index) => index === 0 || position > orderedSteps[index - 1]),
  "orden expansión/backfill/validación/default/unique/trigger/transacción incorrecto");
  const mutatedTables = [...sql.matchAll(/(?:ALTER TABLE|UPDATE)\s+"osi"\."([^"]+)"/g)].map((match) => match[1]);
  invariant(mutatedTables.length > 0 && mutatedTables.every((table) => table === "osi_pipeline_cases"), "la migración sólo puede modificar PipelineCase");

  const oldSources = previousMigrationSources ?? Object.fromEntries(Object.keys(PREVIOUS_MIGRATION_HASHES).map((name) => [name, readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  for (const [name, expected] of Object.entries(PREVIOUS_MIGRATION_HASHES)) invariant(normalizedSha(oldSources[name] || "") === expected, `migración previa modificada: ${name}`);

  const runtime = extraRuntimeSources ?? runtimeSources(root);
  const canonicalReadPath = "api/_lib/crmPipelineRead.js";
  const publicRefConsumers = Object.entries(runtime)
    .filter(([, source]) => /\bpublicRef\b|\bpublic_ref\b/.test(source))
    .map(([path]) => path);
  invariant(publicRefConsumers.includes(canonicalReadPath)
    && publicRefConsumers.every((path) => Object.hasOwn(PUBLIC_REFERENCE_CONTRACTS, path)),
  `publicRef sólo puede consumirse en backends canónicos tenant-first: ${publicRefConsumers.join(", ")}`);

  const canonicalRead = runtime[canonicalReadPath];
  const canonicalRefStart = canonicalRead.indexOf("function canonicalCaseRef(value)");
  const canonicalRefEnd = canonicalRead.indexOf("\nfunction ", canonicalRefStart + 1);
  const scopeStart = canonicalRead.indexOf("export function resolveCrmPipelineReadScope");
  const scopeEnd = canonicalRead.indexOf("\nfunction pipelineWhere", scopeStart + 1);
  const detailStart = canonicalRead.indexOf("export async function findCrmPipelineCase");
  const detailEnd = canonicalRead.indexOf("\nexport async function summarizeCrmPipelineCases", detailStart + 1);
  invariant(canonicalRefStart >= 0 && canonicalRefEnd > canonicalRefStart,
    "validador UUID canónico de caseRef ausente");
  invariant(scopeStart >= 0 && scopeEnd > scopeStart,
    "alcance READ server-side ausente");
  invariant(detailStart >= 0 && detailEnd > detailStart,
    "lector tenant-first de detalle ausente");
  const canonicalRef = canonicalRead.slice(canonicalRefStart, canonicalRefEnd);
  const readScope = canonicalRead.slice(scopeStart, scopeEnd);
  const detailRead = canonicalRead.slice(detailStart, detailEnd);
  invariant((canonicalRead.match(/publicRef:\s*true/g) || []).length === 3,
    "lista, detalle y Client deben seleccionar publicRef de forma explícita");
  invariant((canonicalRead.match(/caseRef:\s*row\.publicRef/g) || []).length === 2,
    "lista y detalle deben serializar publicRef exclusivamente como caseRef");
  invariant((canonicalRead.match(/caseCode:\s*row\.caseCode/g) || []).length === 2 && !/\bcaseNumber\b/.test(canonicalRead),
    "lista y detalle deben publicar un único caseCode");
  invariant(!/\bclientName\b/.test(canonicalRead),
    "clientName legacy no puede seleccionarse, buscarse ni publicarse");
  invariant((canonicalRead.match(/client:\s*\{\s*select:\s*CLIENT_SELECT\s*\}/g) || []).length === 2
    && (canonicalRead.match(/client:\s*safeClient\(row\.client\)/g) || []).length === 2,
  "lista y detalle deben proyectar exclusivamente Client relacional");
  invariant(/client:\s*\{\s*is:\s*\{\s*name:\s*\{\s*contains:\s*filters\.search/.test(canonicalRead),
    "búsqueda de receptor debe usar Client relacional");
  invariant(/typeof value !== "string"[\s\S]*PUBLIC_CASE_REF_PATTERN\.test\(value\)[\s\S]*invalid\("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404\)[\s\S]*return value/.test(canonicalRef),
    "UUID v4 canónico debe validarse como 404 antes de Prisma");
  invariant(/normalizedRole === "A"\) return Object\.freeze\(\{ tenantId: String\(tenantId\) \}\)/.test(readScope),
    "A debe conservar alcance tenant-first exacto");
  invariant(/if \(!membershipId \|\| !userId\) invalid\("COMMERCIAL_PERMISSION_FORBIDDEN", 403\)/.test(readScope)
    && /tenantId: String\(tenantId\),[\s\S]*ownerMembershipId: String\(membershipId\),[\s\S]*ownerUserId: String\(userId\)/.test(readScope),
  "V debe exigir tenant, Membership y User completos");
  const validatePosition = detailRead.indexOf("const publicRef = canonicalCaseRef(caseRef);");
  const scopePosition = detailRead.indexOf("const scope = resolveCrmPipelineReadScope({ tenantId, role, membershipId, userId });");
  const queryPosition = detailRead.indexOf("prisma.pipelineCase.findFirst({");
  invariant(validatePosition >= 0 && scopePosition > validatePosition && queryPosition > scopePosition,
    "UUID y alcance server-side deben resolverse antes de Prisma");
  invariant(/findFirst\(\{\s*where:\s*\{ \.\.\.scope, publicRef \},\s*select: CASE_DETAIL_SELECT/.test(detailRead),
    "detalle findFirst debe usar todos los predicados tenant-first autorizados");
  invariant((detailRead.match(/prisma\.pipelineCase\.(?:findFirst|findUnique)\s*\(/g) || []).length === 1,
    "detalle no puede usar fallback ni una segunda consulta de identidad");
  invariant(!/where:\s*\{\s*publicRef\b/.test(detailRead), "findFirst genérico únicamente por publicRef prohibido");
  invariant(!/where:\s*\{\s*(?:id|caseRef)\b|findUnique\s*\(|\bcaseRef:\s*(?:row\.)?id\b/.test(detailRead),
    "fallback a PK interna o CUID prohibido");
  invariant(/if \(!row\) invalid\("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404\)/.test(detailRead),
    "caso ajeno, inexistente o cross-tenant debe ser 404 indistinguible");
  invariant(!/caseRef:\s*row\.id\b|\bid:\s*row\.id\b|\bid:\s*true\b|\bcaseId\b/.test(canonicalRead),
    "PK CUID o alias interno prohibido en lectura pública");
  invariant(!/\bpublic_ref\b/.test(canonicalRead), "nombre SQL public_ref prohibido en contratos runtime");
  invariant(/PUBLIC_CASE_REF_PATTERN[\s\S]*CRM_PIPELINE_RESOURCE_NOT_FOUND/.test(canonicalRead),
    "UUID v4 canónico debe rechazarse como 404 antes de Prisma");

  const routePaths = Object.keys(runtime).filter((path) => path.startsWith("api/crm/pipeline-cases/") && /\.js$/.test(path));
  invariant(routePaths.includes("api/crm/pipeline-cases/[caseKey]/index.js"), "ruta pública [caseRef] ausente");
  const dynamicSegments = new Set(routePaths.flatMap((path) => path.match(/\[[^\]]+\]/g) || []));
  invariant(dynamicSegments.size === 1 && dynamicSegments.has("[caseKey]"),
    "Vercel exige un segmento dinámico físico único y neutral para lectura y mutaciones");
  const detailRoute = runtime["api/crm/pipeline-cases/[caseKey]/index.js"] || "";
  invariant(/req\.query\?\.caseKey/.test(detailRoute),
    "la ruta de detalle debe interpretar caseKey exclusivamente como caseRef");
  invariant(/tenantId:\s*context\.tenantId/.test(detailRoute)
    && /role:\s*context\.role/.test(detailRoute)
    && /membershipId:\s*context\.membershipId/.test(detailRoute)
    && /userId:\s*context\.userId/.test(detailRoute),
  "tenant, rol, Membership y User deben proceder del contexto revalidado server-side");
  invariant(!/(?:req\.query|req\.headers|x-osi-|localStorage|sessionStorage)[\s\S]{0,120}(?:tenantId|membershipId|userId|owner)/i.test(detailRoute),
    "query, headers o storage no pueden definir el alcance de detalle");
  invariant(!routePaths.includes("api/crm/pipeline-cases/[id].js"), "alias ambiguo [id] de lectura todavía presente");
  invariant(!Object.entries(runtime).some(([path, source]) => path.startsWith("src/") && /\bpublicRef\b|\bpublic_ref\b/.test(source)),
    "frontend debe usar únicamente caseRef");
  const protectedPublicFrontend = Object.entries(runtime)
    .filter(([path]) => path.startsWith("src/crm-relational/") || path.startsWith("src/commercial-crm/"));
  invariant(!protectedPublicFrontend.some(([, source]) => containsLegacyFrontendIdentifier(source)),
    "frontend público no puede reintroducir clientName legacy ni caseNumber");

  const consumerContracts = Object.fromEntries(publicRefConsumers.map((path) => [
    path, validateReferenceConsumer(path, runtime[path], PUBLIC_REFERENCE_CONTRACTS[path]),
  ]));
  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    runtimeConsumers: publicRefConsumers.length,
    runtimeConsumer: canonicalReadPath,
    consumerContracts,
    publicContract: "caseRef",
    atomic: true,
    immutable: true,
    tenantFirst: true,
    detailLookup: "findFirst(tenantId,publicRef,authorized-owner-scope)",
    migration: V17_CASE_PUBLIC_REF_MIGRATION,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.stdout.write(`${JSON.stringify(validateV17CasePublicRefGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
