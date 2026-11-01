import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateAppliedMigrationHistory } from "./canonical-migrations.mjs";
import {
  CANONICAL_35_CATALOG, CANONICAL_35_SQL_ONLY_COUNTS, CANONICAL_35_PROFILE,
  CANONICAL_36_USER_IDENTITY_CATALOG, CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS,
  CANONICAL_37_FLEET_DRIVERS_CATALOG, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS,
  CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG, CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS,
  CATALOG_SQL, SQL_ONLY_SQL, PRISMA_EMPTY_DIFF_SHA256,
  HISTORICAL_22_CATALOG, HISTORICAL_22_SQL_ONLY_COUNTS,
  inspectCrm01b1SqlDriftBaseline, mapSqlOnlyObjects, sqlDriftProfileForDatabase,
  summarizeCrm01b1Catalog, validateCrm01b1CatalogSummary,
  validateCrm01b1MigrationHistory, validateCrm01b1SqlExtensions, validateSqlOnlyInventory,
} from "./crm-01b1-sql-drift-baseline.mjs";
import { FLEET_DRIVER_MIGRATION, FLEET_DRIVER_CATALOG_TABLES, FLEET_DRIVER_CATALOG_FUNCTIONS, partitionFleetDriverCatalog } from "./capture-v17-fleet-drivers-catalog.mjs";

import { WAREHOUSE_CONFIGURATION_MIGRATION, WAREHOUSE_CONFIGURATION_TABLES, WAREHOUSE_CONFIGURATION_FUNCTIONS, WAREHOUSE_CONFIGURATION_ENUMS, partitionWarehouseConfigurationCatalog } from "./capture-v17-warehouse-configuration-catalog.mjs";

const root = process.cwd();
const results = [];
const clone = (value) => structuredClone(value);
function check(name, action) {
  action();
  results.push({ name, passed: true });
}
function rejected(name, action, pattern) {
  check(name, () => assert.throws(action, pattern));
}
const migrations = CANONICAL_MIGRATIONS.map((name) => [name,
  readFileSync(resolve(root, "prisma", "migrations", name, "migration.sql"), "utf8"),
]);
const history = migrations.map(([name, sql]) => ({
  migration_name: name,
  checksum: createHash("sha256").update(sql).digest("hex"),
  finished_at: new Date("2026-10-29T00:00:00Z"),
  rolled_back_at: null,
  applied_steps_count: 1,
}));
const extensionFixture = JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/btree-gist-1.8-members.json"), "utf8"));
const extensionEvidence = {
  extensions: [{ extension_name: extensionFixture.extension, version: extensionFixture.version, schema_name: extensionFixture.schema }],
  members: extensionFixture.functionIdentities.map((object_name) => ({
    extension_name: extensionFixture.extension,
    version: extensionFixture.version,
    extension_schema: extensionFixture.schema,
    kind: "function",
    object_name,
  })),
};
const canonicalDatabase = "osi_db01n_ci";
const historicalDatabase = "osi_crm01b_local";
const canonicalInventory = { counts: CANONICAL_35_SQL_ONLY_COUNTS, unmapped: [] };
const identityInventory = { counts: CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS, unmapped: [] };
const identityFixture = JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/user-identity-19c-catalog.json"), "utf8"));
const fleetInventory = { counts: CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS, unmapped: [] };
const fleetFixture = JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/fleet-drivers-19f-catalog.json"), "utf8"));

const warehouseFixture = JSON.parse(readFileSync(resolve(root, "tests/crm-01b1/warehouse-configuration-20b-catalog.json"), "utf8"));

try {
  check("CI selecciona perfil38 de almacenes por destino aprobado", () => {
    const profile = sqlDriftProfileForDatabase(canonicalDatabase);
    assert.equal(profile.id, "canonical-38-warehouse-configuration-20b");
    assert.equal(profile.migrations, 38);
    assert.equal(profile.catalog, CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG);
    assert.equal(profile.approvedMigrationChecksums[identityFixture.migration.name], identityFixture.migration.sha256);
    assert.equal(profile.approvedMigrationChecksums[FLEET_DRIVER_MIGRATION], fleetFixture.migration.sha256);
    assert.equal(profile.approvedMigrationChecksums[WAREHOUSE_CONFIGURATION_MIGRATION], warehouseFixture.migration.sha256);
    assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.catalog.categories));
  });
  check("perfil35 conserva su checkpoint y catálogo congelado", () => {
    assert.equal(CANONICAL_35_PROFILE.migrations, 35);
    assert.equal(CANONICAL_35_PROFILE.throughMigration, "20260916010000_v17_client_temporary_portal");
    assert.equal(CANONICAL_35_PROFILE.catalog, CANONICAL_35_CATALOG);
    assert.equal(validateAppliedMigrationHistory(history.slice(0, 35), { throughMigration: CANONICAL_35_PROFILE.throughMigration }).length, 35);
  });
  for (const database of [historicalDatabase, "osi_v17_case_client_local", "osi_v17_case_public_ref_local"]) {
    check(`destino histórico ${database} exige22`, () => {
      const profile = sqlDriftProfileForDatabase(database);
      assert.equal(profile.id, "historical-22");
      assert.equal(profile.throughMigration, "20260831010000_v17_crm_icp_foundation");
      assert.equal(profile.catalog, HISTORICAL_22_CATALOG);
    });
  }
  for (const database of [undefined, "neondb", "osi_db01n_ci_other", "osi_crm01b_local/../osi_db01n_ci"]) {
    rejected(`destino sin perfil rechazado: ${database}`, () => sqlDriftProfileForDatabase(database), /destino sin perfil/);
  }

  check("historial38 exacto y checksums fuente aceptados", () => {
    assert.equal(validateCrm01b1MigrationHistory(history, migrations, canonicalDatabase).complete, 38);
  });
  check("historial22 exacto conserva checkpoint histórico", () => {
    assert.equal(validateCrm01b1MigrationHistory(history.slice(0, 22), migrations, historicalDatabase).complete, 22);
  });
  rejected("CI no selecciona22 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 22), migrations, canonicalDatabase), /38 migraciones/);
  rejected("CI no retrocede a35 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 35), migrations, canonicalDatabase), /38 migraciones/);
  rejected("CI no retrocede a36 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 36), migrations, canonicalDatabase), /38 migraciones/);
  rejected("fixture histórico no asciende a38 por conteo observado", () => validateCrm01b1MigrationHistory(history, migrations, historicalDatabase), /22 migraciones/);
  rejected("CI no retrocede a37 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 37), migrations, canonicalDatabase), /38 migraciones/);
  const duplicate = clone(history);
  duplicate[34] = clone(history[33]);
  rejected("duplicado con conteo38 rechazado", () => validateCrm01b1MigrationHistory(duplicate, migrations, canonicalDatabase), /38 migraciones/);
  const renamed = clone(history);
  renamed[20].migration_name = "20260827020000_unapproved_same_count";
  rejected("nombre sustituido con conteo38 rechazado", () => validateCrm01b1MigrationHistory(renamed, migrations, canonicalDatabase), /38 migraciones/);
  for (const [property, value] of [["finished_at", null], ["rolled_back_at", new Date()], ["applied_steps_count", 0], ["applied_steps_count", 2]]) {
    const altered = clone(history);
    altered[5][property] = value;
    rejected(`estado de migración rechazado: ${property}=${value}`, () => validateCrm01b1MigrationHistory(altered, migrations, canonicalDatabase), /incompletas, revertidas o con pasos inválidos/);
  }
  for (const checksum of [undefined, "", "0".repeat(64), "not-a-checksum"]) {
    const altered = clone(history);
    altered[6].checksum = checksum;
    rejected(`checksum ausente o distinto rechazado: ${checksum}`, () => validateCrm01b1MigrationHistory(altered, migrations, canonicalDatabase), /checksum aplicado/);
  }
  const changedSources = clone(migrations);
  changedSources[6][1] += "\n-- changed SQL source\n";
  rejected("checksum aplicado debe coincidir con bytes de fuente", () => validateCrm01b1MigrationHistory(history, changedSources, canonicalDatabase), /checksum aplicado/);
  rejected("fuente de migración ausente rechazada", () => validateCrm01b1MigrationHistory(history, migrations.slice(1), canonicalDatabase), /checksum aplicado/);
  const changedIdentitySources = clone(migrations);
  changedIdentitySources[35][1] += "\n-- unreviewed identity source\n";
  const changedIdentityHistory = clone(history);
  changedIdentityHistory[35].checksum = createHash("sha256").update(changedIdentitySources[35][1]).digest("hex");
  rejected("19C no acepta SQL nuevo aunque coincida con su historial aplicado", () => validateCrm01b1MigrationHistory(changedIdentityHistory, changedIdentitySources, canonicalDatabase), /checksum fuente fuera de la medición aprobada/);
  const changedFleetSources = clone(migrations);
  changedFleetSources[36][1] += "\n-- unreviewed fleet authority source\n";
  const changedFleetHistory = clone(history);
  changedFleetHistory[36].checksum = createHash("sha256").update(changedFleetSources[36][1]).digest("hex");
  rejected("19F no acepta SQL nuevo aunque coincida con su historial aplicado", () => validateCrm01b1MigrationHistory(changedFleetHistory, changedFleetSources, canonicalDatabase), /checksum fuente fuera de la medición aprobada/);

  const changedWarehouseSources = clone(migrations);
  changedWarehouseSources[37][1] += "\n-- unreviewed warehouse configuration\n";
  const changedWarehouseHistory = clone(history);
  changedWarehouseHistory[37].checksum = createHash("sha256").update(changedWarehouseSources[37][1]).digest("hex");
  rejected("20B no acepta SQL nuevo aunque coincida con el historial", () => validateCrm01b1MigrationHistory(changedWarehouseHistory, changedWarehouseSources, canonicalDatabase), /checksum fuente fuera de la medición aprobada/);

  check("hash histórico22 conservado", () => {
    assert.equal(validateCrm01b1CatalogSummary(HISTORICAL_22_CATALOG).sha256,
      "ddf3e8851410807ce123160010ef727ff8c1e757f545b299a871f5bc9ab7427e");
  });
  check("catálogo35 congelado aceptado", () => {
    assert.equal(validateCrm01b1CatalogSummary(CANONICAL_35_CATALOG, CANONICAL_35_CATALOG).count, 10461);
  });
  rejected("catálogo22 no reemplaza catálogo35", () => validateCrm01b1CatalogSummary(HISTORICAL_22_CATALOG, CANONICAL_35_CATALOG), /conteo total/);
  for (const [field, value, pattern] of [["count", 10462, /conteo total/], ["sha256", "0".repeat(64), /firma total/]]) {
    const altered = clone(CANONICAL_35_CATALOG);
    altered[field] = value;
    rejected(`cambio global ${field} rechazado`, () => validateCrm01b1CatalogSummary(altered, CANONICAL_35_CATALOG), pattern);
  }
  for (const kind of Object.keys(CANONICAL_35_CATALOG.categories)) {
    for (const field of ["count", "sha256"]) {
      const altered = clone(CANONICAL_35_CATALOG);
      altered.categories[kind][field] = field === "count" ? altered.categories[kind].count + 1 : "0".repeat(64);
      rejected(`cambio ${kind}.${field} rechazado aunque total coincida`, () => validateCrm01b1CatalogSummary(altered, CANONICAL_35_CATALOG), /conteo .* cambio|definiciones .* cambiaron/);
    }
  }
  for (const mutation of ["missing", "extra"]) {
    const altered = clone(CANONICAL_35_CATALOG);
    if (mutation === "missing") delete altered.categories.trigger;
    else altered.categories.unknown = { count: 1, sha256: "0".repeat(64) };
    rejected(`categoría ${mutation} rechazada`, () => validateCrm01b1CatalogSummary(altered, CANONICAL_35_CATALOG), /categorias/);
  }
  check("catálogo36 y delta provienen del artifact revisado", () => {
    assert.equal(identityFixture.provenance.workflowRun, 41059351747);
    assert.equal(identityFixture.provenance.head, "6db6c366f5bb61b9f11cd8cfe0d2336b75df7324");
    assert.deepEqual(identityFixture.catalog, CANONICAL_36_USER_IDENTITY_CATALOG);
    assert.deepEqual(identityFixture.previousCatalog, CANONICAL_35_CATALOG);
    assert.equal(validateCrm01b1CatalogSummary(identityFixture.catalog, CANONICAL_36_USER_IDENTITY_CATALOG).count, 10569);
    assert.equal(identityFixture.migration.sha256, history[35].checksum);
    assert.deepEqual(summarizeCrm01b1Catalog(identityFixture.delta.rows), identityFixture.delta.catalog);
    assert.equal(identityFixture.delta.catalog.count, 108);
    assert.ok(identityFixture.delta.rows.every((row) => row.schema_name === "osi" && identityFixture.delta.tables.includes(row.table_name)));
    for (const [kind, summary] of Object.entries(CANONICAL_36_USER_IDENTITY_CATALOG.categories)) {
      assert.equal(summary.count, CANONICAL_35_CATALOG.categories[kind].count + (identityFixture.delta.catalog.categories[kind]?.count || 0));
    }
  });
  rejected("catálogo35 no reemplaza catálogo36", () => validateCrm01b1CatalogSummary(CANONICAL_35_CATALOG, CANONICAL_36_USER_IDENTITY_CATALOG), /conteo total/);
  for (const kind of Object.keys(CANONICAL_36_USER_IDENTITY_CATALOG.categories)) {
    for (const field of ["count", "sha256"]) {
      const altered = clone(CANONICAL_36_USER_IDENTITY_CATALOG);
      altered.categories[kind][field] = field === "count" ? altered.categories[kind].count + 1 : "0".repeat(64);
      rejected(`perfil36 rechaza cambio ${kind}.${field} aunque total coincida`, () => validateCrm01b1CatalogSummary(altered, CANONICAL_36_USER_IDENTITY_CATALOG), /conteo .* cambio|definiciones .* cambiaron/);
    }
  }
  const deltaRows = identityFixture.delta.rows;
  const removedPhotoCheck = deltaRows.filter((row) => row.object_name !== "tenant_user_identities_photo_check");
  check("mutante elimina exactamente un CHECK de fotografía", () => assert.equal(removedPhotoCheck.length, deltaRows.length - 1));
  rejected("catálogo medido rechaza eliminar CHECK de fotografía", () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(removedPhotoCheck), identityFixture.delta.catalog), /conteo total/);
  for (const [kind, name, before, after] of [
    ["check", "user_enrollments_role_check", "<> 'A'", "= 'A'"],
    ["check", "tenant_user_identities_photo_check", "262144", "262145"],
    ["foreign_key", "tenant_user_identities_membership_fkey", "membership_id", "unknown_membership_id"],
    ["index", "user_enrollments_pending_email_key", "PENDING", "REVOKED"],
    ["column", "photo_bytes", "bytea", "text"],
  ]) {
    const altered = clone(deltaRows);
    const row = altered.find((item) => item.kind === kind && item.object_name === name);
    assert.ok(row?.definition.includes(before), `mutation must change measured ${kind}:${name}`);
    row.definition = row.definition.replace(before, after);
    rejected(`catálogo medido rechaza cambiar ${kind}:${name} sin alterar conteo`, () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(altered), identityFixture.delta.catalog), /firma total/);
  }
  check("normalización histórica preserva espacios y definiciones", () => {
    const row = { kind: "function", schema_name: "osi", table_name: "", object_name: "fixture()", definition: " SELECT\n  1; " };
    assert.deepEqual(summarizeCrm01b1Catalog([row]), summarizeCrm01b1Catalog([{ ...row, definition: "SELECT 1;" }]));
    assert.notEqual(summarizeCrm01b1Catalog([row]).sha256, summarizeCrm01b1Catalog([{ ...row, definition: "SELECT 2;" }]).sha256);
  });

  check("catálogo37 medido localmente conserva consultas, perfil36 y diff Prisma vacío", () => {
    assert.equal(fleetFixture.provenance.kind, "LOCAL_DISPOSABLE_POSTGRESQL");
    assert.equal(fleetFixture.provenance.server.version_number, "180006");
    assert.equal(fleetFixture.provenance.previousProfileReproducedBeforeMigration, true);
    assert.equal(fleetFixture.provenance.previousObjectsUnchangedAfterMigration, true);
    assert.equal(createHash("sha256").update(CATALOG_SQL).digest("hex"), fleetFixture.provenance.catalogQuerySha256);
    assert.equal(createHash("sha256").update(SQL_ONLY_SQL).digest("hex"), fleetFixture.provenance.sqlOnlyQuerySha256);
    assert.equal(fleetFixture.provenance.prismaDiffSha256, PRISMA_EMPTY_DIFF_SHA256);
    assert.deepEqual(fleetFixture.catalog, CANONICAL_37_FLEET_DRIVERS_CATALOG);
    assert.deepEqual(fleetFixture.previousCatalog, CANONICAL_36_USER_IDENTITY_CATALOG);
    assert.equal(validateCrm01b1CatalogSummary(fleetFixture.catalog, CANONICAL_37_FLEET_DRIVERS_CATALOG).count, 10679);
    assert.equal(fleetFixture.migration.name, FLEET_DRIVER_MIGRATION);
    assert.equal(fleetFixture.migration.sha256, history[36].checksum);
    assert.deepEqual(fleetFixture.extensions, sqlDriftProfileForDatabase(canonicalDatabase).extensions);
    assert.deepEqual(fleetFixture.extensionMembers, sqlDriftProfileForDatabase(canonicalDatabase).extensionMembers);
  });
  check("110 objetos19F medidos se limitan a dos tablas y dos funciones propias", () => {
    assert.deepEqual(fleetFixture.delta.tables, FLEET_DRIVER_CATALOG_TABLES);
    assert.deepEqual(fleetFixture.delta.functions, FLEET_DRIVER_CATALOG_FUNCTIONS);
    assert.deepEqual(summarizeCrm01b1Catalog(fleetFixture.delta.rows), fleetFixture.delta.catalog);
    assert.equal(fleetFixture.delta.catalog.count, 110);
    assert.deepEqual(partitionFleetDriverCatalog(fleetFixture.delta.rows), { previousRows: [], deltaRows: fleetFixture.delta.rows });
    for (const [kind, summary] of Object.entries(CANONICAL_37_FLEET_DRIVERS_CATALOG.categories)) {
      assert.equal(summary.count, CANONICAL_36_USER_IDENTITY_CATALOG.categories[kind].count + (fleetFixture.delta.catalog.categories[kind]?.count || 0));
    }
  });
  check("partición19F conserva extensiones históricas, prefijos parecidos, sobrecargas y otros esquemas", () => {
    const preserved = [
      { kind: "column", schema_name: "osi", table_name: "engineering_crating", object_name: "id", definition: "1|text|true|||" },
      { kind: "trigger", schema_name: "osi", table_name: "fleet_driver_authorizations_archive", object_name: "fleet_driver_authorization_guard", definition: "historical trigger" },
      { kind: "function", schema_name: "osi", table_name: "", object_name: "fleet_driver_authorization_guard(text)", definition: "historical overload" },
      { kind: "function", schema_name: "public", table_name: "", object_name: "fleet_driver_primary_immutable()", definition: "other schema" },
      { kind: "column", schema_name: "public", table_name: "fleet_driver_primary_events", object_name: "id", definition: "other schema" },
    ];
    assert.deepEqual(partitionFleetDriverCatalog([...preserved, ...fleetFixture.delta.rows]), { previousRows: preserved, deltaRows: fleetFixture.delta.rows });
  });
  rejected("catálogo36 no reemplaza catálogo37", () => validateCrm01b1CatalogSummary(CANONICAL_36_USER_IDENTITY_CATALOG, CANONICAL_37_FLEET_DRIVERS_CATALOG), /conteo total/);
  for (const kind of Object.keys(CANONICAL_37_FLEET_DRIVERS_CATALOG.categories)) {
    for (const field of ["count", "sha256"]) {
      const altered = clone(CANONICAL_37_FLEET_DRIVERS_CATALOG);
      altered.categories[kind][field] = field === "count" ? altered.categories[kind].count + 1 : "0".repeat(64);
      rejected(`perfil37 rechaza cambio ${kind}.${field} aunque total coincida`, () => validateCrm01b1CatalogSummary(altered, CANONICAL_37_FLEET_DRIVERS_CATALOG), /conteo .* cambio|definiciones .* cambiaron/);
    }
  }
  const removedDriverTrigger = fleetFixture.delta.rows.filter((row) => row.kind !== "trigger" || row.object_name !== "fleet_driver_authorization_guard");
  check("mutante elimina exactamente el trigger de autorización", () => assert.equal(removedDriverTrigger.length, fleetFixture.delta.rows.length - 1));
  rejected("catálogo19F rechaza eliminar el guard de autorización", () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(removedDriverTrigger), fleetFixture.delta.catalog), /conteo total/);
  for (const [kind, name, before, after] of [
    ["check", "fleet_driver_authorization_seal_check", "authorized_by_user_id <> driver_user_id", "authorized_by_user_id = driver_user_id"],
    ["check", "fleet_driver_authorization_interval_check", "ends_at > starts_at", "ends_at >= starts_at"],
    ["foreign_key", "fleet_driver_authorization_driver_fkey", "tenant_id, driver_membership_id, driver_user_id", "driver_membership_id, driver_user_id"],
    ["index", "fleet_driver_authorization_decision_request_key", "IS NOT NULL", "IS NULL"],
    ["function", "fleet_driver_authorization_guard()", "IS DISTINCT FROM 'FLEET_DRIVER_TEMPORARY'", "<> 'FLEET_DRIVER_TEMPORARY'"],
    ["function", "fleet_driver_authorization_guard()", 'NEW."authorized_at" < (approval_row."decided_at"', 'NEW."authorized_at" > (approval_row."decided_at"'],
    ["column", "authorized_at", "timestamp(3) with time zone", "timestamp(3) without time zone"],
  ]) {
    const altered = clone(fleetFixture.delta.rows);
    const row = altered.find((item) => item.kind === kind && item.object_name === name);
    assert.ok(row?.definition.includes(before), `mutation must change measured ${kind}:${name}`);
    row.definition = row.definition.replace(before, after);
    rejected(`catálogo19F rechaza cambiar ${kind}:${name} (${before}) sin alterar conteo`, () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(altered), fleetFixture.delta.catalog), /firma total/);
  }

  check("histórico22 no requiere extensión posterior", () => {
    assert.equal(validateCrm01b1SqlExtensions({ extensions: [], members: [] }, historicalDatabase).functionMembers, 0);
  });
  check("212 funciones reales btree_gist1.8 aceptadas con huella congelada", () => {
    assert.equal(validateCrm01b1SqlExtensions(extensionEvidence, canonicalDatabase).functionMembers, 212);
  });
  rejected("extensión posterior rechazada en histórico22", () => validateCrm01b1SqlExtensions(extensionEvidence, historicalDatabase), /extensiones, versiones o esquemas/);
  check("catálogo38 medido conserva perfil37 y agrega solo los objetos de20B", () => {
    assert.equal(warehouseFixture.provenance.kind, "LOCAL_DISPOSABLE_POSTGRESQL");
    assert.equal(warehouseFixture.provenance.previousObjectsUnchangedAfterMigration, true);
    assert.equal(warehouseFixture.provenance.catalogQuerySha256, createHash("sha256").update(CATALOG_SQL).digest("hex"));
    assert.deepEqual(warehouseFixture.catalog, CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG);
    assert.deepEqual(warehouseFixture.previousCatalog, CANONICAL_37_FLEET_DRIVERS_CATALOG);
    assert.equal(warehouseFixture.migration.sha256, history[37].checksum);
    assert.deepEqual(warehouseFixture.delta.tables, WAREHOUSE_CONFIGURATION_TABLES);
    assert.deepEqual(warehouseFixture.delta.functions, WAREHOUSE_CONFIGURATION_FUNCTIONS);
    assert.deepEqual(warehouseFixture.delta.enums, WAREHOUSE_CONFIGURATION_ENUMS);
    assert.deepEqual(summarizeCrm01b1Catalog(warehouseFixture.delta.rows), warehouseFixture.delta.catalog);
    assert.equal(warehouseFixture.delta.catalog.count, 87);
    assert.deepEqual(partitionWarehouseConfigurationCatalog(warehouseFixture.delta.rows), { previousRows: [], deltaRows: warehouseFixture.delta.rows });
    for (const [kind, summary] of Object.entries(CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG.categories)) {
      assert.equal(summary.count, CANONICAL_37_FLEET_DRIVERS_CATALOG.categories[kind].count + (warehouseFixture.delta.catalog.categories[kind]?.count || 0));
    }
    assert.deepEqual(validateSqlOnlyInventory({ counts: CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS, unmapped: [] }, CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS), { total: 971, migrations: 38 });
  });
  check("partición20B no absorbe tablas, funciones ni enums parecidos", () => {
    const preserved = [
      { kind: "column", schema_name: "osi", table_name: "warehouse_area_uses_archive", object_name: "id", definition: "old" },
      { kind: "function", schema_name: "osi", table_name: "", object_name: "v17_warehouse_configuration_identity_guard(text)", definition: "old" },
      { kind: "enum", schema_name: "osi", table_name: "", object_name: "WarehouseAreaUsePurposeArchive:1", definition: "old" },
      { kind: "enum", schema_name: "public", table_name: "", object_name: "WarehouseAreaUsePurpose:1", definition: "old" },
    ];
    assert.deepEqual(partitionWarehouseConfigurationCatalog([...preserved, ...warehouseFixture.delta.rows]), { previousRows: preserved, deltaRows: warehouseFixture.delta.rows });
  });
  rejected("catálogo37 no reemplaza catálogo38", () => validateCrm01b1CatalogSummary(CANONICAL_37_FLEET_DRIVERS_CATALOG, CANONICAL_38_WAREHOUSE_CONFIGURATION_CATALOG), /conteo total/);
  rejected("inventario37 no reemplaza inventario38", () => validateSqlOnlyInventory(fleetInventory, CANONICAL_38_WAREHOUSE_CONFIGURATION_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  for (const kind of ["check", "foreign_key", "function", "trigger", "enum"]) {
    const changed = clone(warehouseFixture.delta.rows);
    const selected = changed.find((row) => row.kind === kind);
    assert.ok(selected);
    selected.definition += " altered";
    rejected(`catálogo20B rechaza cambios en ${kind}`, () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(changed), warehouseFixture.delta.catalog), /firma total/);
    const removed = warehouseFixture.delta.rows.filter((row) => row !== warehouseFixture.delta.rows.find((entry) => entry.kind === kind));
    rejected(`catálogo20B rechaza ausencia de ${kind}`, () => validateCrm01b1CatalogSummary(summarizeCrm01b1Catalog(removed), warehouseFixture.delta.catalog), /conteo total/);
  }
  rejected("canonical37 sin btree_gist rechazada", () => validateCrm01b1SqlExtensions({ extensions: [], members: [] }, canonicalDatabase), /extensiones, versiones o esquemas/);
  for (const [field, value] of [["extension_name", "unexpected_extension"], ["version", "1.7"], ["schema_name", "public"]]) {
    const altered = clone(extensionEvidence);
    altered.extensions[0][field] = value;
    rejected(`metadato extensión alterado: ${field}`, () => validateCrm01b1SqlExtensions(altered, canonicalDatabase), /extensiones, versiones o esquemas/);
  }
  for (const mutation of ["missing", "extra"]) {
    const altered = clone(extensionEvidence);
    if (mutation === "missing") altered.members.pop();
    else altered.members.push({ ...altered.members[0], object_name: "unexpected()" });
    rejected(`miembro extensión ${mutation} rechazado`, () => validateCrm01b1SqlExtensions(altered, canonicalDatabase), /cantidad de miembros/);
  }
  for (const [field, value] of [["extension_name", "unexpected_extension"], ["version", "1.7"], ["extension_schema", "public"], ["kind", "trigger"], ["object_name", "unexpected()"]]) {
    const altered = clone(extensionEvidence);
    altered.members[0][field] = value;
    rejected(`atribución pg_depend alterada: ${field}`, () => validateCrm01b1SqlExtensions(altered, canonicalDatabase), /identidades o atribución pg_depend/);
  }
  const extensionRow = { kind: "function", object_name: extensionEvidence.members[0].object_name };
  check("función dependiente atribuida sólo a migración que instala btree_gist", () => {
    const inventory = mapSqlOnlyObjects([extensionRow], migrations, [extensionEvidence.members[0]]);
    assert.deepEqual(inventory, { counts: { "20260907010000_v17_tools_equipment": { function: 1 } }, unmapped: [] });
  });
  check("prefijo parecido sin pertenencia pg_depend no se acepta", () => {
    assert.deepEqual(mapSqlOnlyObjects([extensionRow], migrations).unmapped, [`function:${extensionRow.object_name}`]);
  });
  for (const [field, value] of [["extension_name", "unexpected_extension"], ["version", "1.7"], ["extension_schema", "public"]]) {
    check(`mapper no atribuye extensión no aprobada: ${field}`, () => {
      assert.equal(mapSqlOnlyObjects([extensionRow], migrations, [{ ...extensionEvidence.members[0], [field]: value }]).unmapped.length, 1);
    });
  }
  check("mapper exige instalación en migración exacta", () => {
    const sources = migrations.filter(([name]) => name !== "20260907010000_v17_tools_equipment");
    assert.equal(mapSqlOnlyObjects([extensionRow], sources, [extensionEvidence.members[0]]).unmapped.length, 1);
  });
  check("mapper exige sentencia de extensión en fuente aprobada", () => {
    const sources = migrations.map(([name, sql]) => [name, sql.replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", "-- removed")]);
    assert.equal(mapSqlOnlyObjects([extensionRow], sources, [extensionEvidence.members[0]]).unmapped.length, 1);
  });
  rejected("atribución duplicada de extensión rechazada", () => mapSqlOnlyObjects([extensionRow], migrations,
    [extensionEvidence.members[0], extensionEvidence.members[0]]), /atribución de extensión ambigua/);

  check("inventario histórico285 preservado", () => {
    assert.deepEqual(validateSqlOnlyInventory({ counts: HISTORICAL_22_SQL_ONLY_COUNTS, unmapped: [] }), { total: 285, migrations: 22 });
  });
  check("inventario canonical927 en35 migraciones aceptado", () => {
    assert.deepEqual(validateSqlOnlyInventory(canonicalInventory, CANONICAL_35_SQL_ONLY_COUNTS), { total: 927, migrations: 35 });
  });
  check("inventario36 exige945 objetos SQL-only con16checks y2índices19C", () => {
    assert.deepEqual(validateSqlOnlyInventory(identityInventory, CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS), { total: 945, migrations: 36 });
  });
  rejected("inventario35 no sustituye inventario36", () => validateSqlOnlyInventory(canonicalInventory, CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  const missingIdentityIndex = clone(identityInventory);
  missingIdentityIndex.counts[identityFixture.migration.name].special_index--;
  rejected("perfil36 detecta índice parcial de altas ausente", () => validateSqlOnlyInventory(missingIdentityIndex, CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  check("inventario37 exige961 objetos SQL-only y16 nuevos atribuibles a19F", () => {
    assert.deepEqual(validateSqlOnlyInventory(fleetInventory, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS), { total: 961, migrations: 37 });
    assert.deepEqual(fleetFixture.delta.sqlOnlyCounts, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS[FLEET_DRIVER_MIGRATION]);
    const sqlOnlyRows = fleetFixture.delta.rows.flatMap((row) => {
      if (["check", "function", "trigger"].includes(row.kind)) return [{ kind: row.kind, object_name: row.object_name }];
      if (row.kind === "index" && row.definition.includes(" WHERE ")) return [{ kind: "special_index", object_name: row.object_name }];
      return [];
    });
    assert.equal(sqlOnlyRows.length, 16);
    assert.deepEqual(mapSqlOnlyObjects(sqlOnlyRows, migrations), { counts: { [FLEET_DRIVER_MIGRATION]: fleetFixture.delta.sqlOnlyCounts }, unmapped: [] });
  });
  rejected("inventario36 no sustituye inventario37", () => validateSqlOnlyInventory(identityInventory, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  for (const kind of ["check", "function", "special_index", "trigger"]) {
    const altered = clone(fleetInventory);
    altered.counts[FLEET_DRIVER_MIGRATION][kind]--;
    rejected(`perfil37 detecta ${kind} propio de19F ausente`, () => validateSqlOnlyInventory(altered, CANONICAL_37_FLEET_DRIVERS_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  }
  rejected("SQL-only desconocido rechazado", () => validateSqlOnlyInventory({ ...canonicalInventory, unmapped: ["function:unexpected()"] }, CANONICAL_35_SQL_ONLY_COUNTS), /sin migracion/);
  const movedCount = clone(canonicalInventory);
  movedCount.counts["20260907010000_v17_tools_equipment"].function--;
  movedCount.counts["20260801000000_production_baseline"].function++;
  rejected("conteo total igual con migración incorrecta rechazado", () => validateSqlOnlyInventory(movedCount, CANONICAL_35_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  const missingTrigger = clone(canonicalInventory);
  missingTrigger.counts["20260916010000_v17_client_temporary_portal"].trigger--;
  rejected("trigger SQL-only faltante rechazado", () => validateSqlOnlyInventory(missingTrigger, CANONICAL_35_SQL_ONLY_COUNTS), /inventario SQL-only cambio/);
  rejected("inventario histórico no acepta objetos35", () => validateSqlOnlyInventory(canonicalInventory), /inventario SQL-only cambio/);

  for (const options of [{ expectedCatalog: null }, { validateInventory: false }, { profile: "historical-22" }]) {
    await assert.rejects(inspectCrm01b1SqlDriftBaseline(options), /no admite reemplazos de baseline/);
    results.push({ name: `inspector rechaza bypass ${Object.keys(options)[0]} antes de conectar`, passed: true });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
