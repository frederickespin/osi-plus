import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This closed inventory is shared by canonical CI and historical guards.
// A new migration requires an explicit update; count-only allowances are rejected.
export const CANONICAL_MIGRATIONS = Object.freeze([
  "20260801000000_production_baseline",
  "20260801001000_mt01a_tenant_memberships",
  "20260801002000_commercial_audit_log",
  "20260801003000_approval_requests",
  "20260801004000_risk_engine_rules_evaluations",
  "20260801005000_logistic_override_approvals",
  "20260801006000_quote_change_orders",
  "20260801007000_logistics_geography_zone_rules",
  "20260801008000_vehicle_engine_settings",
  "20260801009000_logistics_rate_metadata",
  "20260801010000_crate_settings",
  "20260801011000_mt01b_auth_sessions",
  "20260801012000_mt01c1a_employee_profiles",
  "20260801013000_mt01c1b1_provisioning_persistence",
  "20260801014000_mt01c2b1_commercial_tenant_foundation",
  "20260801015000_crm01b_pipeline_mutation_authority",
  "20260801020000_v17_pipeline_case_client_authority",
  "20260821010000_v17_pipeline_case_public_ref",
  "20260824010000_v17_client_public_ref_case_mutations",
  "20260827010000_v17_tenant_membership_public_ref",
  "20260827020000_v17_admin_identity_invitation",
  "20260831010000_v17_crm_icp_foundation",
  "20260904010000_v17_services_tenant_first",
  "20260905010000_v17_survey_foundation",
  "20260906010000_v17_materials_inventory",
  "20260907010000_v17_tools_equipment",
  "20260908010000_v17_logistics_engine",
  "20260909010000_v17_costing",
  "20260910010000_v17_quote",
  "20260911010000_v17_scheduling_desktop_convergence",
  "20260912010000_v17_commercial_relationships",
  "20260913010000_v17_communications_templates",
  "20260914010000_v17_personnel_operational_policies",
  "20260915010000_v17_service_packages_resources",
  "20260916010000_v17_client_temporary_portal",
  "20261030010000_v17_user_identity_enrollment",
  "20261031010000_v17_fleet_driver_authority",
  "20261101010000_v17_warehouse_configuration",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`CANONICAL_MIGRATIONS: ${message}`);
}

function assertNames(names) {
  invariant(Array.isArray(names) && names.every((name) => typeof name === "string"), "inventario de nombres inválido");
  invariant(JSON.stringify([...names].sort()) === JSON.stringify([...CANONICAL_MIGRATIONS].sort()),
    `La cadena activa no coincide con las ${CANONICAL_MIGRATIONS.length} migraciones canónicas`);
}

export function validateMigrationFiles(root = process.cwd()) {
  const migrationRoot = resolve(root, "prisma/migrations");
  invariant(lstatSync(migrationRoot).isDirectory(), "prisma/migrations debe ser un directorio real");
  const entries = readdirSync(migrationRoot, { withFileTypes: true });
  invariant(entries.every((entry) => entry.isDirectory() || (["migration_lock.toml", "README.md"].includes(entry.name) && entry.isFile())),
    "prisma/migrations contiene entradas inesperadas o enlaces simbólicos");
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assertNames(names);
  for (const name of names) {
    const directory = resolve(migrationRoot, name);
    const children = readdirSync(directory, { withFileTypes: true });
    invariant(children.length === 1 && children[0].name === "migration.sql" && children[0].isFile(),
      `${name} debe contener sólo un archivo regular migration.sql`);
    const bytes = readFileSync(resolve(directory, "migration.sql"));
    invariant(bytes.length > 0, `${name}/migration.sql está vacío`);
    invariant(!bytes.includes(0), `${name}/migration.sql contiene bytes nulos`);
    const sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    invariant(sql.trim().length > 0, `${name}/migration.sql está vacío`);
  }
  return names;
}

export function validateMigrationInventory(root, names) {
  assertNames(names);
  return validateMigrationFiles(root);
}

export function validateMigrationPaths(root, paths) {
  invariant(Array.isArray(paths) && paths.every((entry) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(entry)),
    "inventario de rutas de migración inválido");
  validateMigrationInventory(root, paths.map((entry) => entry.split("/")[2]));
  return [...paths].sort();
}

// Isolated historical domain fixtures stop at a named, approved checkpoint.
// Canonical CI omits throughMigration and must contain the full closed inventory.
export function validateAppliedMigrationHistory(rows, { throughMigration } = {}) {
  const checkpoint = throughMigration === undefined
    ? CANONICAL_MIGRATIONS.length - 1
    : CANONICAL_MIGRATIONS.indexOf(throughMigration);
  invariant(checkpoint >= 0, "checkpoint de migraciones desconocido");
  const expected = CANONICAL_MIGRATIONS.slice(0, checkpoint + 1);
  invariant(Array.isArray(rows) && rows.every((row) => row && typeof row.migration_name === "string"),
    "historial aplicado inválido");
  const names = rows.map((row) => row.migration_name).sort();
  invariant(JSON.stringify(names) === JSON.stringify(expected),
    `historial aplicado no coincide con las ${expected.length} migraciones canónicas esperadas`);
  invariant(rows.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1),
    "historial contiene migraciones incompletas, revertidas o con pasos inválidos");
  return names;
}
