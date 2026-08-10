import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = "20260801014000_mt01c2b1_commercial_tenant_foundation";
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
});

const CONTRACT_ROUTES = Object.freeze([
  "api/clients/index.js",
  "api/projects/index.js",
  "api/k/dashboard.js",
  "api/k/project.js",
  "api/k/project-validate.js",
  "api/k/project-release.js",
  "api/_disabled/project-validate.js",
  "api/_disabled/project-release.js",
]);

const EXPECTED_INDEXES = Object.freeze([
  'CREATE UNIQUE INDEX "osi_clients_tenant_id_id_key" ON "osi"."osi_clients"("tenant_id", "id")',
  'CREATE INDEX "osi_clients_tenant_id_status_idx" ON "osi"."osi_clients"("tenant_id", "status")',
  'CREATE UNIQUE INDEX "osi_projects_tenant_id_id_key" ON "osi"."osi_projects"("tenant_id", "id")',
  'CREATE INDEX "osi_projects_tenant_id_status_idx" ON "osi"."osi_projects"("tenant_id", "status")',
  'CREATE INDEX "osi_projects_tenant_id_client_id_idx" ON "osi"."osi_projects"("tenant_id", "clientId")',
  'CREATE UNIQUE INDEX "osi_leads_tenant_id_id_key" ON "osi"."osi_leads"("tenant_id", "id")',
  'CREATE INDEX "osi_leads_tenant_id_status_updated_at_idx" ON "osi"."osi_leads"("tenant_id", "status", "updatedAt")',
  'CREATE INDEX "osi_leads_tenant_id_customer_id_idx" ON "osi"."osi_leads"("tenant_id", "customerId")',
  'CREATE INDEX "osi_leads_tenant_id_project_id_idx" ON "osi"."osi_leads"("tenant_id", "projectId")',
  'CREATE UNIQUE INDEX "osi_pipeline_cases_tenant_id_id_key" ON "osi"."osi_pipeline_cases"("tenant_id", "id")',
  'CREATE INDEX "osi_pipeline_cases_tenant_id_status_updated_at_idx" ON "osi"."osi_pipeline_cases"("tenant_id", "status", "updatedAt")',
  'CREATE INDEX "osi_pipeline_cases_tenant_owner_idx" ON "osi"."osi_pipeline_cases"("tenant_id", "owner_membership_id", "owner_user_id")',
]);

const EXPECTED_FOREIGN_KEYS = Object.freeze([
  ['osi_clients_tenant_id_fkey', '"osi_clients" ("tenant_id")', '"tenants" ("id")'],
  ['osi_projects_tenant_id_fkey', '"osi_projects" ("tenant_id")', '"tenants" ("id")'],
  ['osi_projects_tenant_id_client_id_fkey', '"osi_projects" ("tenant_id", "clientId")', '"osi_clients" ("tenant_id", "id")'],
  ['osi_leads_tenant_id_fkey', '"osi_leads" ("tenant_id")', '"tenants" ("id")'],
  ['osi_leads_tenant_id_customer_id_fkey', '"osi_leads" ("tenant_id", "customerId")', '"osi_clients" ("tenant_id", "id")'],
  ['osi_leads_tenant_id_project_id_fkey', '"osi_leads" ("tenant_id", "projectId")', '"osi_projects" ("tenant_id", "id")'],
  ['osi_pipeline_cases_tenant_id_fkey', '"osi_pipeline_cases" ("tenant_id")', '"tenants" ("id")'],
  ['osi_pipeline_cases_enterprise_owner_fkey', '"osi_pipeline_cases" ("tenant_id", "owner_membership_id", "owner_user_id")', '"tenant_memberships" ("tenant_id", "id", "user_id")'],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`MT01C2B1_GUARD_REJECTED: ${message}`);
}

function text(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

function modelBlock(schema, name) {
  const match = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(schema);
  invariant(match, `modelo ${name} ausente`);
  return match[1];
}

function compactSql(value) {
  return value.replace(/\s+/g, " ").replace(/\s*;\s*$/, "").trim();
}

export function validateMt01c2b1Guard(root = process.cwd()) {
  const schema = text(root, "prisma/schema.prisma");
  for (const model of ["Client", "Project", "Lead", "PipelineCase"]) {
    const block = modelBlock(schema, model);
    invariant(/^\s*tenantId\s+String\?\s+@map\("tenant_id"\)/m.test(block), `${model}.tenantId debe permanecer nullable`);
    invariant(/@@unique\(\[tenantId, id\]/.test(block), `${model} requiere unicidad compuesta tenantId,id`);
  }
  const pipeline = modelBlock(schema, "PipelineCase");
  invariant(/^\s*ownerMembershipId\s+String\?/m.test(pipeline) && /^\s*ownerUserId\s+String\?/m.test(pipeline), "owner empresarial debe permanecer nullable");
  invariant(/references:\s*\[tenantId, id, userId\]/.test(pipeline), "owner empresarial no usa la FK compuesta aprobada");
  invariant(/ownerId\s+String\?/.test(pipeline) && /owner\s+User\?/.test(pipeline), "owner heredado fue retirado");
  for (const [model, relation] of [["Project", "ProjectTenantClient"], ["Lead", "LeadTenantCustomer"], ["Lead", "LeadTenantProject"]]) {
    invariant(modelBlock(schema, model).includes(`@relation(\"${relation}\"`), `${relation} ausente`);
  }
  for (const [model, field] of [["Client", "code"], ["Project", "code"], ["Lead", "code"], ["PipelineCase", "caseCode"]]) {
    invariant(new RegExp(`^\\s*${field}\\s+String[^\\n]*@unique`, "m").test(modelBlock(schema, model)), `${model}.${field} no puede cambiar su unicidad global en B1`);
  }

  const migrationPath = `prisma/migrations/${MIGRATION}/migration.sql`;
  const migrationBytes = readFileSync(resolve(root, migrationPath));
  invariant(!migrationBytes.includes(0), "migration.sql contiene NUL");
  const migration = new TextDecoder("utf-8", { fatal: true }).decode(migrationBytes);
  invariant(!/^\s*(?:DROP|DELETE|TRUNCATE|RENAME|UPDATE|INSERT|UPSERT)\b/im.test(migration), "la migración no es estrictamente aditiva");
  invariant(!/IPACKERS-DO/i.test(migration), "la migración asigna un tenant concreto");
  invariant((migration.match(/ADD COLUMN "tenant_id" TEXT/g) || []).length === 4, "tenant_id debe agregarse nullable exactamente cuatro veces");
  invariant((migration.match(/ADD COLUMN "owner_(?:membership|user)_id" TEXT/g) || []).length === 2, "owner empresarial debe agregar exactamente dos columnas nullable");
  invariant(/enterprise_owner_complete_check/.test(migration), "CHECK de owner incompleto ausente");
  invariant((migration.match(/ON DELETE RESTRICT/g) || []).length === 8, "todas las FK empresariales deben usar RESTRICT");

  const indexStatements = [...migration.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^;]+;/gi)].map((match) => compactSql(match[0]));
  invariant(indexStatements.length === EXPECTED_INDEXES.length, `se esperaban ${EXPECTED_INDEXES.length} índices MT-01C2B1`);
  for (const expected of EXPECTED_INDEXES) invariant(indexStatements.includes(expected), `índice ausente o divergente: ${expected}`);
  const indexSignatures = indexStatements.map((statement) => statement.replace(/^CREATE (?:UNIQUE )?INDEX "[^"]+" ON /, ""));
  invariant(new Set(indexSignatures).size === indexSignatures.length, "existe un índice MT-01C2B1 exactamente redundante");

  for (const [name, child, parent] of EXPECTED_FOREIGN_KEYS) {
    const childColumns = child.slice(child.indexOf(" (") + 1);
    const expected = compactSql(`ADD CONSTRAINT "${name}" FOREIGN KEY ${childColumns} REFERENCES "osi".${parent.replace(" (", "(")} ON DELETE RESTRICT ON UPDATE CASCADE`);
    invariant(compactSql(migration).includes(expected), `FK física ausente o divergente: ${name}`);
  }
  invariant((migration.match(/FOREIGN KEY/g) || []).length === EXPECTED_FOREIGN_KEYS.length, "cantidad de FK MT-01C2B1 inesperada");
  const ownerCheck = compactSql(`ADD CONSTRAINT "osi_pipeline_cases_enterprise_owner_complete_check" CHECK (
    ("owner_membership_id" IS NULL AND "owner_user_id" IS NULL)
    OR
    ("tenant_id" IS NOT NULL AND "owner_membership_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)
  )`);
  invariant(compactSql(migration).includes(ownerCheck), "semántica NULL exacta del owner divergente");
  invariant(compactSql(migration).includes(compactSql(`CREATE TRIGGER "osi_clients_tenant_project_restrict_trigger"
    BEFORE DELETE ON "osi"."osi_clients"
    FOR EACH ROW
    EXECUTE FUNCTION "osi"."mt01c2b1_restrict_tenant_client_delete"()`)), "guarda RESTRICT tenantizada Project→Client ausente");
  invariant(/IF OLD\."tenant_id" IS NOT NULL AND EXISTS[\s\S]*p\."tenant_id" = OLD\."tenant_id"[\s\S]*p\."clientId" = OLD\."id"[\s\S]*ERRCODE = '23503'/m.test(migration), "guarda RESTRICT tenantizada Project→Client divergente");

  for (const expectedMap of [
    "osi_clients_tenant_id_fkey", "osi_projects_tenant_id_fkey", "osi_projects_tenant_id_client_id_fkey",
    "osi_leads_tenant_id_fkey", "osi_leads_tenant_id_customer_id_fkey", "osi_leads_tenant_id_project_id_fkey",
    "osi_pipeline_cases_tenant_id_fkey", "osi_pipeline_cases_enterprise_owner_fkey",
    "osi_clients_tenant_id_id_key", "osi_projects_tenant_id_id_key", "osi_leads_tenant_id_id_key", "osi_pipeline_cases_tenant_id_id_key",
  ]) invariant(schema.includes(`map: "${expectedMap}"`), `mapping Prisma ausente: ${expectedMap}`);

  for (const [name, expected] of Object.entries(PREVIOUS_MIGRATION_HASHES)) {
    const normalizedBytes = readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8").replaceAll("\r\n", "\n");
    const actual = createHash("sha256").update(normalizedBytes, "utf8").digest("hex");
    invariant(actual === expected, `la migración histórica ${name} cambió`);
  }

  const contractResults = {};
  for (const route of CONTRACT_ROUTES) {
    const source = text(root, route);
    const queryCount = (source.match(/prisma\.(?:client|project)\.(?:findMany|findUnique|create|update)\s*\(/g) || []).length;
    const omitCount = (source.match(/omit:\s*\{\s*tenantId:\s*true\s*\}/g) || []).length;
    invariant(queryCount === omitCount, `${route} puede exponer tenantId (${omitCount}/${queryCount} consultas protegidas)`);
    invariant(!/(?:where|data)\s*:\s*\{[^}]*tenantId/s.test(source), `${route} usa tenantId como autoridad runtime`);
    invariant(!/owner(?:Membership|User)Id/.test(source), `${route} consume owner empresarial antes de activación`);
    contractResults[route] = { prismaQueries: queryCount, explicitOmits: omitCount };
  }

  const env = text(root, ".env.example");
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(env), "LEGACY no es el modo predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(env), "tenant switch no está desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(env), "cliente V2 no está desactivado");

  return {
    nullableRoots: 4,
    exactForeignKeys: EXPECTED_FOREIGN_KEYS.length,
    exactIndexes: EXPECTED_INDEXES.length,
    tenantizedProjectClientDeleteGuard: true,
    previousMigrationHashes: Object.keys(PREVIOUS_MIGRATION_HASHES).length,
    runtimeTenantAuthorityConsumers: 0,
    contractResults,
    modes: { legacy: true, hybrid: false, tenantSwitch: false, clientV2: false },
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateMt01c2b1Guard() }, null, 2)}\n`);
