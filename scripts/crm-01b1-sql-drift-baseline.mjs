import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";
import { validateAppliedMigrationHistory, validateMigrationFiles } from "./canonical-migrations.mjs";

export const PRISMA_EMPTY_DIFF_SHA256 = "0983c8c2474f18152b093842104ef9aef25f03fb78861c9e681da2249a64a385";
export const LOCAL_15_CATALOG_SHA256 = "cf48b58f82cdaa9f2ce4e7bb3f467848ee32a3b83043977d56a896f27888dd35";
export const LOCAL_16_CATALOG_SHA256 = "f220349f2c2cbdd2ae083f57ba2ae18ee66716873ffbea8057ac60147853dc1d";
export const LOCAL_17_CATALOG_SHA256 = "2fd393729897916bdb3a7135d73e69f8efeefa8cb5b708505dc08323eaef42f9";
export const LOCAL_18_CATALOG_SHA256 = "4ecc54d31708c31c32930273eca91800185b62761ce5b310ed0aa3d195c5ba57";
export const LOCAL_19_CATALOG_SHA256 = "2de9d06124876f1a1ba2fb97898d52746bf45d2fa1f3ef9c09c5460cb651758e";
export const LOCAL_20_CATALOG_SHA256 = "c8301cc67acb2cd4993c3dc10565e6933e45b006520492d71839fde51c39f3d2";
export const LOCAL_21_CATALOG_SHA256 = "a1a4da277070269bbad2452471717ef588c6c58cc2bc0cf55203835abb0cd930";
export const LOCAL_22_CATALOG_SHA256 = "ddf3e8851410807ce123160010ef727ff8c1e757f545b299a871f5bc9ab7427e";
export const LOCAL_35_CATALOG_SHA256 = "2edda06f3606ce0546fcf4ed7435153e5b77986e0cc2d54c3d661785f06002a3";
export const LOCAL_36_USER_IDENTITY_CATALOG_SHA256 = "481649e8c88db832d1f313f7e3a4a785f28a1d49c4277dc21eac179fef16cb54";
export const LOCAL_37_FLEET_DRIVERS_CATALOG_SHA256 = "0431dfd8810a8ef68895b1b40c5e38ae1c06550249dff9b7f07c0a41b5951371";
export const RESTORED_NEON_15_CATALOG_SHA256 = "4d5959dc99b03a7866bc3e038fcaea611fe665a5412cb235522cc05ab5e011d3";

export const HISTORICAL_22_CATALOG = Object.freeze({
  count: 4486,
  sha256: LOCAL_22_CATALOG_SHA256,
  categories: Object.freeze({
    check: Object.freeze({ count: 172, sha256: "0c22d0e00510659e85cbabea9cd830b4242c8281db0ac37b9cbe773fec526b3d" }),
    column: Object.freeze({ count: 1773, sha256: "e7930dfa273a799c57a94b77be8ee12dd59dcd838bb8ef2787c0457ad1567f36" }),
    constraint: Object.freeze({ count: 1303, sha256: "af90211c1bea442b7ec702db1b843b5fe1bd84afe21d036ad5ab9f812293695f" }),
    enum: Object.freeze({ count: 471, sha256: "d7cdb1d874ac8032081d4173dd108acada5dddb93644ae94b773cbc746a57f1f" }),
    foreign_key: Object.freeze({ count: 219, sha256: "6dab0218a95df64515764fec5acfba9a25151d02238734bf82a070a8bf138162" }),
    function: Object.freeze({ count: 39, sha256: "d1599d25efd2b8c3bf51b6d5fc89a6a9563130fd81c7f25a62b90d37340b0423" }),
    index: Object.freeze({ count: 466, sha256: "cfde50179c684b8903ca30f05f49709413193a3993a76c7906115f171725c278" }),
    trigger: Object.freeze({ count: 43, sha256: "43436df3b17d138e22be657081b2a11e414477230abb5c07d999773741067fcb" }),
  }),
});

export const HISTORICAL_22_SQL_ONLY_COUNTS = Object.freeze({
  "20260801000000_production_baseline": Object.freeze({ check: 5, function: 1, special_index: 2, trigger: 1 }),
  "20260801001000_mt01a_tenant_memberships": Object.freeze({ check: 3, special_index: 1 }),
  "20260801002000_commercial_audit_log": Object.freeze({ check: 2, function: 1, special_index: 1, trigger: 1 }),
  "20260801003000_approval_requests": Object.freeze({ check: 11, function: 1, special_index: 1, trigger: 1 }),
  "20260801004000_risk_engine_rules_evaluations": Object.freeze({ check: 11, function: 2, special_index: 2, trigger: 5 }),
  "20260801005000_logistic_override_approvals": Object.freeze({ check: 2, function: 1, trigger: 1 }),
  "20260801006000_quote_change_orders": Object.freeze({ check: 19, function: 2, special_index: 3, trigger: 3 }),
  "20260801007000_logistics_geography_zone_rules": Object.freeze({ check: 21, function: 5, special_index: 7, trigger: 5 }),
  "20260801008000_vehicle_engine_settings": Object.freeze({ check: 14, function: 2, special_index: 5, trigger: 2 }),
  "20260801009000_logistics_rate_metadata": Object.freeze({ check: 4, function: 2, trigger: 2 }),
  "20260801010000_crate_settings": Object.freeze({ check: 13, function: 3, special_index: 2, trigger: 4 }),
  "20260801011000_mt01b_auth_sessions": Object.freeze({ check: 6, special_index: 1 }),
  "20260801012000_mt01c1a_employee_profiles": Object.freeze({ check: 8, function: 1, trigger: 1 }),
  "20260801013000_mt01c1b1_provisioning_persistence": Object.freeze({ check: 21, function: 3, special_index: 1, trigger: 3 }),
  "20260801014000_mt01c2b1_commercial_tenant_foundation": Object.freeze({ check: 1, function: 1, trigger: 1 }),
  "20260801015000_crm01b_pipeline_mutation_authority": Object.freeze({ check: 13, function: 3, trigger: 3 }),
  "20260801020000_v17_pipeline_case_client_authority": Object.freeze({ check: 1 }),
  "20260821010000_v17_pipeline_case_public_ref": Object.freeze({ function: 1, trigger: 1 }),
  "20260824010000_v17_client_public_ref_case_mutations": Object.freeze({ function: 1, trigger: 1 }),
  "20260827010000_v17_tenant_membership_public_ref": Object.freeze({ function: 1, trigger: 1 }),
  "20260827020000_v17_admin_identity_invitation": Object.freeze({ check: 6, function: 1, special_index: 1, trigger: 1 }),
  "20260831010000_v17_crm_icp_foundation": Object.freeze({ check: 11, function: 7, special_index: 4, trigger: 6 }),
});

// Rebuilt twice from the unchanged, approved 35-migration chain on PostgreSQL 18.
// The historical 22-migration fingerprint was reproduced first; neither query
// nor definition normalization changed. See docs/V17-SQL-CATALOG-BASELINE-35.md.
export const CANONICAL_35_CATALOG = Object.freeze({
  count: 10461,
  sha256: LOCAL_35_CATALOG_SHA256,
  categories: Object.freeze({
    check: Object.freeze({ count: 390, sha256: "5765e81c0268f9b36286ec41acb5b6e01da5c8cef93e0a9ae3745ff87f50597a" }),
    column: Object.freeze({ count: 3732, sha256: "bce9eaf7e7b6a89e95d18abd1bb326b6119e09f353c0cf638e014386c568c01c" }),
    constraint: Object.freeze({ count: 2996, sha256: "9dbaec28b4dac9d6c4182d298c868b54dca01b5239c2a88083494ace0a1faec4" }),
    enum: Object.freeze({ count: 1102, sha256: "229714a4280acac482aa12e074cfe34585a4b51f658ae6922216039b92b7bbaf" }),
    foreign_key: Object.freeze({ count: 656, sha256: "d8b50b8a3717197567b8f6326cb042a5ef3d0049864675b9541c0eb3fb34e554" }),
    function: Object.freeze({ count: 299, sha256: "b8a66bf6c666c819e0170e71400b15a31c50ede5229afde94d76b6f4432d25a9" }),
    index: Object.freeze({ count: 1103, sha256: "16a8727f4b576c35b8f75fab982ce691800f3c0c07e474b3985f08a5469fb733" }),
    trigger: Object.freeze({ count: 183, sha256: "9c328fd35c079ae79a83ccd8551ab184c849ab776d6c8f87990a50297edcbf7f" }),
  }),
});

export const CANONICAL_35_SQL_ONLY_COUNTS = Object.freeze({
  ...HISTORICAL_22_SQL_ONLY_COUNTS,
  "20260904010000_v17_services_tenant_first": Object.freeze({ check: 15, function: 4, special_index: 2, trigger: 6 }),
  "20260905010000_v17_survey_foundation": Object.freeze({ check: 10, function: 4, special_index: 2, trigger: 15 }),
  "20260906010000_v17_materials_inventory": Object.freeze({ check: 16, function: 5, special_index: 4, trigger: 17 }),
  // Five application functions plus all 212 pg_depend members of btree_gist 1.8.
  "20260907010000_v17_tools_equipment": Object.freeze({ check: 27, function: 217, special_index: 2, trigger: 17 }),
  "20260908010000_v17_logistics_engine": Object.freeze({ check: 6, function: 4, special_index: 1, trigger: 11 }),
  "20260909010000_v17_costing": Object.freeze({ check: 6, function: 4, special_index: 2, trigger: 12 }),
  "20260910010000_v17_quote": Object.freeze({ check: 5, function: 3, special_index: 1, trigger: 8 }),
  "20260911010000_v17_scheduling_desktop_convergence": Object.freeze({ check: 14, function: 2, special_index: 2, trigger: 5 }),
  "20260912010000_v17_commercial_relationships": Object.freeze({ check: 46, function: 2, special_index: 1, trigger: 15 }),
  "20260913010000_v17_communications_templates": Object.freeze({ check: 10, function: 4, special_index: 1, trigger: 5 }),
  "20260914010000_v17_personnel_operational_policies": Object.freeze({ check: 37, function: 4, special_index: 4, trigger: 12 }),
  "20260915010000_v17_service_packages_resources": Object.freeze({ check: 18, function: 4, special_index: 2, trigger: 9 }),
  "20260916010000_v17_client_temporary_portal": Object.freeze({ check: 8, function: 3, trigger: 8 }),
});

// Measured on PostgreSQL 18.6 in CI run 41059351747, artifact 12978656029.
// Removing only the two 19C tables from the captured rows reproduces every
// frozen 35-migration hash exactly. No catalog query/normalization changed.
// See docs/V17-SQL-CATALOG-BASELINE-36-IDENTITY-19C.md for full provenance.
export const CANONICAL_36_USER_IDENTITY_CATALOG = Object.freeze({
  count: 10569,
  sha256: LOCAL_36_USER_IDENTITY_CATALOG_SHA256,
  categories: Object.freeze({
    check: Object.freeze({ count: 406, sha256: "4782f94ffb2053b76e26284ea39cc109d24b9270968382d4dd8332ca03a34d08" }),
    column: Object.freeze({ count: 3772, sha256: "e1547a3956c42a98dea95f6dc70e8c6d0700762ecc22ef08074ec94fd30f6198" }),
    constraint: Object.freeze({ count: 3032, sha256: "7c6aad78623912ffb109a61ed6daa4a4e0b7f9c59cc0aeaf5b4f15a480e3dd27" }),
    enum: Object.freeze({ count: 1102, sha256: "229714a4280acac482aa12e074cfe34585a4b51f658ae6922216039b92b7bbaf" }),
    foreign_key: Object.freeze({ count: 661, sha256: "dafe8a1869adc492c54470edd78cf8a047994752b157e11a2ceee42ecb0a65c6" }),
    function: Object.freeze({ count: 299, sha256: "b8a66bf6c666c819e0170e71400b15a31c50ede5229afde94d76b6f4432d25a9" }),
    index: Object.freeze({ count: 1114, sha256: "78ef61c51409718fe718d1dc6a1a25be1b484414f10e6e28105990f05efa72b3" }),
    trigger: Object.freeze({ count: 183, sha256: "9c328fd35c079ae79a83ccd8551ab184c849ab776d6c8f87990a50297edcbf7f" }),
  }),
});
export const CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS = Object.freeze({
  ...CANONICAL_35_SQL_ONLY_COUNTS,
  "20261030010000_v17_user_identity_enrollment": Object.freeze({ check: 16, special_index: 2 }),
});

// Measured on disposable local PostgreSQL 18.6 after reproducing the frozen
// 36-migration profile. Removing only the two 19F tables and their two trigger
// functions reproduces every prior hash; query/normalization remain unchanged.
// See docs/V17-SQL-CATALOG-BASELINE-37-FLEET-19F.md for measurement provenance.
export const CANONICAL_37_FLEET_DRIVERS_CATALOG = Object.freeze({
  count: 10679,
  sha256: LOCAL_37_FLEET_DRIVERS_CATALOG_SHA256,
  categories: Object.freeze({
    check: Object.freeze({ count: 416, sha256: "0260b09b54cae0193f32788cc5cae658c15dddbe22a2cd3e319c642cddd2400f" }),
    column: Object.freeze({ count: 3812, sha256: "b0f56d1776ec95433a3134ac49c52f52a9a4951d5f82dd3c10f6f356a5a4c3ef" }),
    constraint: Object.freeze({ count: 3060, sha256: "9096cde62504e915ebef7741829457428b88d1fee31f19f38f88c039b24e4848" }),
    enum: Object.freeze({ count: 1102, sha256: "229714a4280acac482aa12e074cfe34585a4b51f658ae6922216039b92b7bbaf" }),
    foreign_key: Object.freeze({ count: 672, sha256: "4b503da6d52c4ae156c9db6225fda53b939cfe22a5b1aebd277028c04d3debe7" }),
    function: Object.freeze({ count: 301, sha256: "5c0bd83ba528c9b31991731c4270421c56aea8303377784b4b041d5ab983e820" }),
    index: Object.freeze({ count: 1131, sha256: "d89b6cb1687dddb788e2d85838b3ab55829d97b72e81007500e8c3fd41308139" }),
    trigger: Object.freeze({ count: 185, sha256: "d43bbfb8192a5c755cc870d0fc01d813be2a92b32e3bacc28c585418dbd15a28" }),
  }),
});
export const CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS = Object.freeze({
  ...CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS,
  "20261031010000_v17_fleet_driver_authority": Object.freeze({ check: 10, function: 2, special_index: 2, trigger: 2 }),
});

const BTREE_GIST_MIGRATION = "20260907010000_v17_tools_equipment";
const HISTORICAL_22_PROFILE = Object.freeze({
  id: "historical-22", migrations: 22,
  throughMigration: "20260831010000_v17_crm_icp_foundation",
  catalog: HISTORICAL_22_CATALOG,
  sqlOnlyCounts: HISTORICAL_22_SQL_ONLY_COUNTS,
  extensions: Object.freeze([]),
  extensionMembers: Object.freeze({ count: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" }),
});
export const CANONICAL_35_PROFILE = Object.freeze({
  id: "canonical-35", migrations: 35,
  throughMigration: "20260916010000_v17_client_temporary_portal",
  catalog: CANONICAL_35_CATALOG,
  sqlOnlyCounts: CANONICAL_35_SQL_ONLY_COUNTS,
  extensions: Object.freeze([Object.freeze({ extension_name: "btree_gist", version: "1.8", schema_name: "osi" })]),
  extensionMembers: Object.freeze({ count: 212, sha256: "5768fa15ad9dc973614d90b162eeb87fbef323dc2b76e019e0f07a454623d5cc" }),
});
const CANONICAL_36_USER_IDENTITY_PROFILE = Object.freeze({
  id: "canonical-36-user-identity-19c", migrations: 36,
  catalog: CANONICAL_36_USER_IDENTITY_CATALOG,
  sqlOnlyCounts: CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS,
  extensions: CANONICAL_35_PROFILE.extensions,
  extensionMembers: CANONICAL_35_PROFILE.extensionMembers,
  approvedMigrationChecksums: Object.freeze({
    "20261030010000_v17_user_identity_enrollment": "328529a4c68c8203d279c148c33bb70562c1b9fb6024b0d9f09c390976d3ca50",
  }),
});

const CANONICAL_37_FLEET_DRIVERS_PROFILE = Object.freeze({
  id: "canonical-37-fleet-drivers-19f", migrations: 37,
  catalog: CANONICAL_37_FLEET_DRIVERS_CATALOG,
  sqlOnlyCounts: CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS,
  extensions: CANONICAL_36_USER_IDENTITY_PROFILE.extensions,
  extensionMembers: CANONICAL_36_USER_IDENTITY_PROFILE.extensionMembers,
  approvedMigrationChecksums: Object.freeze({
    ...CANONICAL_36_USER_IDENTITY_PROFILE.approvedMigrationChecksums,
    "20261031010000_v17_fleet_driver_authority": "3a6db22d52441aa1614e13c0bd619ef4bba84230f9af91a3c794f31496d2bd14",
  }),
});

export const CATALOG_SQL = `
SELECT kind, schema_name, table_name, object_name, definition
FROM (
  SELECT 'column' AS kind, n.nspname AS schema_name, c.relname AS table_name,
         a.attname AS object_name,
         concat_ws('|', a.attnum, format_type(a.atttypid, a.atttypmod), a.attnotnull,
           coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attidentity, a.attgenerated) AS definition
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'osi' AND c.relkind IN ('r', 'p')
    AND c.relname <> '_prisma_migrations' AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'enum', n.nspname, '', t.typname || ':' || e.enumsortorder, e.enumlabel
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid WHERE n.nspname = 'osi'
  UNION ALL
  SELECT CASE con.contype WHEN 'f' THEN 'foreign_key' WHEN 'c' THEN 'check' ELSE 'constraint' END,
         n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true)
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'osi' AND c.relname <> '_prisma_migrations'
  UNION ALL
  SELECT 'index', n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid)
  FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_class i ON i.oid = x.indexrelid
  WHERE n.nspname = 'osi' AND c.relname <> '_prisma_migrations'
  UNION ALL
  SELECT 'function', n.nspname, '',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'osi'
  UNION ALL
  SELECT 'trigger', n.nspname, c.relname, tg.tgname, pg_get_triggerdef(tg.oid, true)
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'osi' AND NOT tg.tgisinternal
) catalog
ORDER BY kind, schema_name, table_name, object_name, definition`;

export const SQL_ONLY_SQL = `
SELECT kind, object_name
FROM (
  SELECT 'check' AS kind, con.conname AS object_name
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'osi' AND con.contype = 'c'
  UNION ALL
  SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'osi'
  UNION ALL
  SELECT 'trigger', tg.tgname
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'osi' AND NOT tg.tgisinternal
  UNION ALL
  SELECT 'special_index', i.relname
  FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_class i ON i.oid = x.indexrelid
  WHERE n.nspname = 'osi' AND c.relname <> '_prisma_migrations'
    AND (x.indpred IS NOT NULL OR x.indexprs IS NOT NULL)
) sql_only
ORDER BY kind, object_name`;

// Supplemental provenance only: the historical catalog/SQL-only queries above
// remain unchanged. Cast to name just as their UNION does, so identity keys match.
export const EXTENSIONS_SQL = `
SELECT e.extname AS extension_name, e.extversion AS version, n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE n.nspname = 'osi' ORDER BY e.extname`;

export const EXTENSION_MEMBERS_SQL = `
SELECT e.extname AS extension_name, e.extversion AS version,
       en.nspname AS extension_schema, 'function' AS kind,
       (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::name::text AS object_name
FROM pg_depend d
JOIN pg_extension e ON e.oid = d.refobjid
JOIN pg_namespace en ON en.oid = e.extnamespace
JOIN pg_proc p ON p.oid = d.objid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE d.classid = 'pg_proc'::regclass AND d.refclassid = 'pg_extension'::regclass
  AND d.deptype = 'e' AND n.nspname = 'osi'
ORDER BY e.extname, object_name`;

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM01B1_SQL_DRIFT_BASELINE: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeDefinition(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function sqlDriftProfileForDatabase(database) {
  if (database === "osi_db01n_ci") return CANONICAL_37_FLEET_DRIVERS_PROFILE;
  if (["osi_crm01b_local", "osi_v17_case_client_local", "osi_v17_case_public_ref_local"].includes(database)) {
    return HISTORICAL_22_PROFILE;
  }
  throw new Error("CRM01B1_SQL_DRIFT_BASELINE: destino sin perfil de catálogo aprobado");
}

export function validateCrm01b1MigrationHistory(history, migrations, database) {
  const profile = sqlDriftProfileForDatabase(database);
  const names = validateAppliedMigrationHistory(history, { throughMigration: profile.throughMigration });
  invariant(names.length === profile.migrations, "perfil requiere una actualización explícita de migraciones");
  const checksums = new Map(migrations.map(([name, sql]) => [name, createHash("sha256").update(sql).digest("hex")]));
  invariant(Object.entries(profile.approvedMigrationChecksums || {}).every(([name, checksum]) => checksums.get(name) === checksum),
    "checksum fuente fuera de la medición aprobada del perfil");
  invariant(history.every((row) => typeof row.checksum === "string" && /^[0-9a-f]{64}$/.test(row.checksum)
    && checksums.has(row.migration_name) && row.checksum === checksums.get(row.migration_name)),
    "checksum aplicado no coincide con la fuente de migración");
  return Object.freeze({ complete: names.length, failed: 0, migrations: names });
}

export function validateCrm01b1SqlExtensions({ extensions, members }, database) {
  const profile = sqlDriftProfileForDatabase(database);
  invariant(JSON.stringify(extensions) === JSON.stringify(profile.extensions),
    "extensiones, versiones o esquemas fuera del perfil aprobado");
  invariant(members.length === profile.extensionMembers.count, "cantidad de miembros de extensión cambió");
  invariant(sha256(members) === profile.extensionMembers.sha256,
    "identidades o atribución pg_depend de extensión cambiaron");
  return Object.freeze({ extensions, functionMembers: members.length, sha256: sha256(members) });
}

export function validateCrm01b1CatalogSummary(actual, expected = HISTORICAL_22_CATALOG) {
  invariant(actual.count === expected.count, `conteo total ${actual.count}; esperado ${expected.count}`);
  invariant(actual.sha256 === expected.sha256, `firma total ${actual.sha256}; esperada ${expected.sha256}`);
  const actualKinds = Object.keys(actual.categories).sort();
  const expectedKinds = Object.keys(expected.categories).sort();
  invariant(JSON.stringify(actualKinds) === JSON.stringify(expectedKinds), "categorias de catalogo cambiaron");
  for (const kind of expectedKinds) {
    invariant(actual.categories[kind].count === expected.categories[kind].count, `conteo ${kind} cambio`);
    invariant(actual.categories[kind].sha256 === expected.categories[kind].sha256, `definiciones ${kind} cambiaron`);
  }
  return Object.freeze({ ok: true, ...actual });
}

async function loadMigrationSql(root) {
  const directory = join(root, "prisma", "migrations");
  const migrations = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const result = [];
  for (const migration of migrations) {
    result.push([migration, await readFile(join(directory, migration, "migration.sql"), "utf8")]);
  }
  return result;
}

export function mapSqlOnlyObjects(rows, migrations, extensionMembers = []) {
  const counts = {};
  const unmapped = [];
  const dependencies = new Map(extensionMembers.map((member) => [`${member.kind}:${member.object_name}`, member]));
  invariant(dependencies.size === extensionMembers.length, "atribución de extensión ambigua");
  for (const row of rows) {
    const bareName = row.object_name.replace(/\(.*$/, "");
    const dependency = dependencies.get(`${row.kind}:${row.object_name}`);
    const migration = dependency
      ? (dependency.extension_name === "btree_gist" && dependency.version === "1.8"
        && dependency.extension_schema === "osi" && dependency.kind === "function"
        ? migrations.find(([name, sql]) => name === BTREE_GIST_MIGRATION
          && /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+btree_gist\s*;/i.test(sql))?.[0] : undefined)
      : migrations.find(([, sql]) => sql.includes(`"${bareName}"`) || sql.includes(bareName))?.[0];
    if (!migration) {
      unmapped.push(`${row.kind}:${row.object_name}`);
      continue;
    }
    counts[migration] ??= {};
    counts[migration][row.kind] = (counts[migration][row.kind] ?? 0) + 1;
  }
  return { counts, unmapped };
}

export function validateSqlOnlyInventory(inventory, expectedCounts = HISTORICAL_22_SQL_ONLY_COUNTS) {
  invariant(inventory.unmapped.length === 0, `objetos SQL-only sin migracion: ${inventory.unmapped.join(", ")}`);
  const normalizeCounts = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([migration, kinds]) => [migration, Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)))]));
  invariant(JSON.stringify(normalizeCounts(inventory.counts)) === JSON.stringify(normalizeCounts(expectedCounts)), "inventario SQL-only cambio");
  return Object.freeze({
    total: Object.values(inventory.counts).reduce((sum, kinds) => sum + Object.values(kinds).reduce((a, b) => a + b, 0), 0),
    migrations: Object.keys(inventory.counts).length,
  });
}

export function summarizeCrm01b1Catalog(catalogRows) {
  const rows = catalogRows.map((row) => Object.freeze({
    kind: row.kind,
    schema: row.schema_name,
    table: row.table_name,
    name: row.object_name,
    definition: normalizeDefinition(row.definition),
  }));
  const categories = {};
  for (const kind of [...new Set(rows.map((row) => row.kind))].sort()) {
    const subset = rows.filter((row) => row.kind === kind);
    categories[kind] = Object.freeze({ count: subset.length, sha256: sha256(subset) });
  }
  return Object.freeze({ count: rows.length, sha256: sha256(rows), categories: Object.freeze(categories) });
}

// A capture is evidence, never an accepted baseline. It cannot return ok:true
// and cannot update a frozen profile from the database it is observing.
export async function collectCrm01b1SqlDriftEvidence({ root = process.cwd(), rawUrl } = {}) {
  validateMigrationFiles(root);
  const migrations = await loadMigrationSql(root);
  const { prisma, target } = await createCrm01b1LocalPrisma(rawUrl);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      const [server] = await tx.$queryRawUnsafe(`
        SELECT current_setting('server_version_num') AS version_number,
               current_setting('server_version') AS version,
               datcollate AS collation, datctype AS character_type
        FROM pg_database WHERE datname = current_database()
      `);
      invariant(Number(server.version_number) >= 180000 && Number(server.version_number) < 190000,
        "la baseline de catálogo requiere PostgreSQL 18");
      const history = await tx.$queryRawUnsafe(`
        SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
        FROM "osi"."_prisma_migrations" ORDER BY migration_name
      `);
      const historySummary = validateCrm01b1MigrationHistory(history, migrations, target.database);
      const migrationChecksums = Object.fromEntries(migrations.map(([name, sql]) => [name,
        createHash("sha256").update(sql).digest("hex"),
      ]));
      const catalogRows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const extensionEvidence = Object.freeze({
        extensions: await tx.$queryRawUnsafe(EXTENSIONS_SQL),
        members: await tx.$queryRawUnsafe(EXTENSION_MEMBERS_SQL),
      });
      return Object.freeze({
        evidenceOnly: true, target, server, history, historySummary,
        migrationChecksums,
        catalog: summarizeCrm01b1Catalog(catalogRows),
        sqlOnly: mapSqlOnlyObjects(sqlOnlyRows, migrations, extensionEvidence.members),
        extensionEvidence,
        catalogRows, sqlOnlyRows,
      });
    }, { maxWait: 5_000, timeout: 35_000 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function inspectCrm01b1SqlDriftBaseline(options = {}) {
  invariant(options && typeof options === "object" && !Array.isArray(options)
    && Object.keys(options).every((key) => ["root", "rawUrl"].includes(key)),
  "el inspector no admite reemplazos de baseline ni desactivar inventarios");
  const evidence = await collectCrm01b1SqlDriftEvidence(options);
  const profile = sqlDriftProfileForDatabase(evidence.target.database);
  const extensions = validateCrm01b1SqlExtensions(evidence.extensionEvidence, evidence.target.database);
  const catalog = validateCrm01b1CatalogSummary(evidence.catalog, profile.catalog);
  const sqlOnly = validateSqlOnlyInventory(evidence.sqlOnly, profile.sqlOnlyCounts);
  return Object.freeze({
    ok: true, profile: profile.id, target: evidence.target, server: evidence.server,
    history: evidence.historySummary, catalog, sqlOnly, extensions,
    prismaDiffSha256: PRISMA_EMPTY_DIFF_SHA256,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await inspectCrm01b1SqlDriftBaseline();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
