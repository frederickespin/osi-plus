import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateAppliedMigrationHistory } from "./canonical-migrations.mjs";
import {
  CANONICAL_35_CATALOG, CANONICAL_35_SQL_ONLY_COUNTS, CANONICAL_35_PROFILE,
  CANONICAL_36_USER_IDENTITY_CATALOG, CANONICAL_36_USER_IDENTITY_SQL_ONLY_COUNTS,
  HISTORICAL_22_CATALOG, HISTORICAL_22_SQL_ONLY_COUNTS,
  inspectCrm01b1SqlDriftBaseline, mapSqlOnlyObjects, sqlDriftProfileForDatabase,
  summarizeCrm01b1Catalog, validateCrm01b1CatalogSummary,
  validateCrm01b1MigrationHistory, validateCrm01b1SqlExtensions, validateSqlOnlyInventory,
} from "./crm-01b1-sql-drift-baseline.mjs";

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

try {
  check("CI selecciona perfil36 de identidad por destino aprobado", () => {
    const profile = sqlDriftProfileForDatabase(canonicalDatabase);
    assert.equal(profile.id, "canonical-36-user-identity-19c");
    assert.equal(profile.migrations, 36);
    assert.equal(profile.catalog, CANONICAL_36_USER_IDENTITY_CATALOG);
    assert.equal(profile.approvedMigrationChecksums[identityFixture.migration.name], identityFixture.migration.sha256);
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

  check("historial36 exacto y checksums fuente aceptados", () => {
    assert.equal(validateCrm01b1MigrationHistory(history, migrations, canonicalDatabase).complete, 36);
  });
  check("historial22 exacto conserva checkpoint histórico", () => {
    assert.equal(validateCrm01b1MigrationHistory(history.slice(0, 22), migrations, historicalDatabase).complete, 22);
  });
  rejected("CI no selecciona22 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 22), migrations, canonicalDatabase), /36 migraciones/);
  rejected("CI no retrocede a35 por conteo observado", () => validateCrm01b1MigrationHistory(history.slice(0, 35), migrations, canonicalDatabase), /36 migraciones/);
  rejected("fixture histórico no asciende a36 por conteo observado", () => validateCrm01b1MigrationHistory(history, migrations, historicalDatabase), /22 migraciones/);
  const duplicate = clone(history);
  duplicate[34] = clone(history[33]);
  rejected("duplicado con conteo36 rechazado", () => validateCrm01b1MigrationHistory(duplicate, migrations, canonicalDatabase), /36 migraciones/);
  const renamed = clone(history);
  renamed[20].migration_name = "20260827020000_unapproved_same_count";
  rejected("nombre sustituido con conteo36 rechazado", () => validateCrm01b1MigrationHistory(renamed, migrations, canonicalDatabase), /36 migraciones/);
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

  check("histórico22 no requiere extensión posterior", () => {
    assert.equal(validateCrm01b1SqlExtensions({ extensions: [], members: [] }, historicalDatabase).functionMembers, 0);
  });
  check("212 funciones reales btree_gist1.8 aceptadas con huella congelada", () => {
    assert.equal(validateCrm01b1SqlExtensions(extensionEvidence, canonicalDatabase).functionMembers, 212);
  });
  rejected("extensión posterior rechazada en histórico22", () => validateCrm01b1SqlExtensions(extensionEvidence, historicalDatabase), /extensiones, versiones o esquemas/);
  rejected("canonical36 sin btree_gist rechazada", () => validateCrm01b1SqlExtensions({ extensions: [], members: [] }, canonicalDatabase), /extensiones, versiones o esquemas/);
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
