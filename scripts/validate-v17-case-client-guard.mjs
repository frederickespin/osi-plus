import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const V17_CASE_CLIENT_MIGRATION = "20260801020000_v17_pipeline_case_client_authority";
const EXPECTED_MIGRATIONS = 21;
const V17_CASE_PUBLIC_REF_MIGRATION = "20260821010000_v17_pipeline_case_public_ref";
const V17_CLIENT_PUBLIC_REF_MIGRATION = "20260824010000_v17_client_public_ref_case_mutations";
const V17_MEMBERSHIP_PUBLIC_REF_MIGRATION = "20260827010000_v17_tenant_membership_public_ref";
const V17_ADMIN_IDENTITY_INVITATION_MIGRATION = "20260827020000_v17_admin_identity_invitation";

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_CASE_CLIENT_GUARD: ${message}`);
}
function modelBlock(source, name) {
  const match = source.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  invariant(match, `modelo ${name} ausente`);
  return match[1];
}

export function validateV17CaseClientGuard({
  root = process.cwd(),
  migrationNames,
  schemaSource,
  migrationSource,
  projectAuthorityMigrationSource,
  extraRuntimeSources = {},
} = {}) {
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  invariant(migrations.length === EXPECTED_MIGRATIONS, `se exigen exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(migrations.includes(V17_CASE_CLIENT_MIGRATION), "la migración 17 exacta debe existir");
  invariant(migrations.includes(V17_CASE_PUBLIC_REF_MIGRATION), "la migración 18 autorizada debe existir");
  invariant(migrations.includes(V17_CLIENT_PUBLIC_REF_MIGRATION), "la migración 19 autorizada debe existir");
  invariant(migrations.includes(V17_MEMBERSHIP_PUBLIC_REF_MIGRATION), "la migración 20 autorizada debe existir");
  invariant(migrations.at(-1) === V17_ADMIN_IDENTITY_INVITATION_MIGRATION, "la migración 21 autorizada debe ser la última");

  const schema = schemaSource ?? readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const sql = (migrationSource ?? readFileSync(resolve(root, "prisma/migrations", V17_CASE_CLIENT_MIGRATION, "migration.sql"), "utf8")).replaceAll("\r\n", "\n");
  const projectAuthoritySql = (projectAuthorityMigrationSource ?? readFileSync(resolve(root, "prisma/migrations/20260801015000_crm01b_pipeline_mutation_authority/migration.sql"), "utf8")).replaceAll("\r\n", "\n");
  const pipeline = modelBlock(schema, "PipelineCase");
  const project = modelBlock(schema, "Project");
  const client = modelBlock(schema, "Client");

  invariant(/^\s*clientId\s+String\?\s+@map\("client_id"\)\s*$/m.test(pipeline), "PipelineCase.clientId debe ser nullable, sin default");
  invariant(!/^\s*clientId\s+String\s/m.test(pipeline), "PipelineCase.clientId no puede ser obligatorio");
  invariant(/@relation\("PipelineCaseServiceClient", fields: \[tenantId, clientId\], references: \[tenantId, id\], onDelete: Restrict, onUpdate: Restrict/.test(pipeline), "relación PipelineCase–Client no es tenant-first RESTRICT");
  invariant(/@@unique\(\[tenantId, id, clientId\], map: "osi_pipeline_cases_tenant_id_id_client_id_key"\)/.test(pipeline), "clave compuesta PipelineCase ausente");
  invariant(/@@index\(\[tenantId, clientId, status, updatedAt\], map: "osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx"\)/.test(pipeline), "índice tenant/Client/status/updatedAt ausente");
  invariant(/fields: \[tenantId, pipelineCaseId, clientId\], references: \[tenantId, id, clientId\], onDelete: Restrict, onUpdate: Restrict/.test(project), "Project no exige caso/Client/tenant coherentes");
  invariant(/^\s*clientId\s+String\s*$/m.test(project), "Project.clientId debe conservarse obligatorio");
  invariant(/@@index\(\[tenantId, pipelineCaseId, clientId\], map: "osi_projects_tenant_id_pipeline_case_id_client_id_idx"\)/.test(project), "índice triple Project ausente");
  invariant(/pipelineCases\s+PipelineCase\[\]\s+@relation\("PipelineCaseServiceClient"\)/.test(client), "relación inversa Client ausente");

  invariant(/ADD COLUMN "client_id" TEXT;/.test(sql) && !/ADD COLUMN "client_id"[^;]*(?:NOT NULL|DEFAULT)/i.test(sql), "SQL client_id debe ser nullable y sin default");
  invariant(/osi_pipeline_cases_client_requires_tenant_check/.test(sql), "CHECK client/tenant ausente");
  for (const name of [
    "osi_pipeline_cases_tenant_id_client_id_fkey",
    "osi_projects_tenant_id_pipeline_case_id_client_id_fkey",
    "osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx",
    "osi_projects_tenant_id_pipeline_case_id_client_id_idx",
  ]) invariant(sql.includes(name), `objeto SQL ausente: ${name}`);
  invariant((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) || []).length === 2, "las dos FK nuevas deben ser RESTRICT");
  invariant(!/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im.test(sql), "migration.sql contiene DML/backfill");
  invariant(!/^\s*DROP\s+(?:TABLE|COLUMN|TYPE|FUNCTION|TRIGGER)\b/im.test(sql), "migration.sql contiene DROP destructivo no autorizado");
  invariant(!/(?:email|phone|nombre|name|similar|infer)/i.test(sql), "migration.sql contiene inferencia textual");
  invariant(!/(?:PipelineCaseParty|BusinessEntity|Survey|Quote|Material|ServiceCase|payer|approver)/i.test(sql), "migration.sql excede el alcance autorizado");
  invariant(/osi_projects_pipeline_case_requires_tenant_check/.test(projectAuthoritySql)
    && /CHECK\s*\(\s*"pipeline_case_id"\s+IS NULL\s+OR\s+"tenant_id"\s+IS NOT NULL\s*\)/i.test(projectAuthoritySql),
  "migración 16 debe impedir Project.pipelineCaseId con tenantId NULL");

  const runtimeViolations = [];
  for (const [path, source] of Object.entries(extraRuntimeSources)) {
    if (/^(?:api|src)\//.test(path) && /(?:client_id|PipelineCaseServiceClient|pipelineCase[\s\S]{0,160}clientId)/i.test(source)) runtimeViolations.push(path);
  }
  invariant(runtimeViolations.length === 0, `consumidores runtime nuevos: ${runtimeViolations.join(", ")}`);
  return Object.freeze({ ok: true, migrations: migrations.length, runtimeConsumers: 0, nullable: true, backfill: false });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.stdout.write(`${JSON.stringify(validateV17CaseClientGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
