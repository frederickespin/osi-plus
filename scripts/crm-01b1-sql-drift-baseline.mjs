import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

export const PRISMA_EMPTY_DIFF_SHA256 = "0983c8c2474f18152b093842104ef9aef25f03fb78861c9e681da2249a64a385";
export const LOCAL_15_CATALOG_SHA256 = "cf48b58f82cdaa9f2ce4e7bb3f467848ee32a3b83043977d56a896f27888dd35";
export const LOCAL_16_CATALOG_SHA256 = "f220349f2c2cbdd2ae083f57ba2ae18ee66716873ffbea8057ac60147853dc1d";
export const LOCAL_17_CATALOG_SHA256 = "2fd393729897916bdb3a7135d73e69f8efeefa8cb5b708505dc08323eaef42f9";
export const RESTORED_NEON_15_CATALOG_SHA256 = "4d5959dc99b03a7866bc3e038fcaea611fe665a5412cb235522cc05ab5e011d3";

const EXPECTED_CATALOG = Object.freeze({
  count: 4265,
  sha256: LOCAL_17_CATALOG_SHA256,
  categories: Object.freeze({
    check: Object.freeze({ count: 155, sha256: "81b32a33efc0c24c760d871165ad15179674913e02ba465cd07d3d0f6209080f" }),
    column: Object.freeze({ count: 1703, sha256: "829187d26e7d59d9d437adfd5dbefa88887cc2bff29835d9fa6706c349eb9123" }),
    constraint: Object.freeze({ count: 1251, sha256: "c1f2854097ad6628e0b6876b6cb88aef31a23c2f68319d1b36aed67733fafd7f" }),
    enum: Object.freeze({ count: 442, sha256: "1d576d17b8ec777d73cb19cb8c5e6179bf1eb08966a483bee884a2fa4a8e2319" }),
    foreign_key: Object.freeze({ count: 210, sha256: "e927d1e37e0b1ceedda9c78da6b4e0d40d8d8c874188d92babec9087c9698ec0" }),
    function: Object.freeze({ count: 28, sha256: "bea675390e2405d8921d5c53a8e3733838b1ea5693e7bf1604272dc201175d79" }),
    index: Object.freeze({ count: 443, sha256: "e903f3cb4883de4810e09bba88c12088b66e9dc1f650a58a9dbeb85e4f31bf47" }),
    trigger: Object.freeze({ count: 33, sha256: "46a656f501dd37ca44e79ded5cdf16360b4109077b24406be0eded22b164d5c6" }),
  }),
});

const EXPECTED_SQL_ONLY_COUNTS = Object.freeze({
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
});

const CATALOG_SQL = `
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

const SQL_ONLY_SQL = `
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

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM01B1_SQL_DRIFT_BASELINE: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeDefinition(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function validateCrm01b1CatalogSummary(actual, expected = EXPECTED_CATALOG) {
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

function mapSqlOnlyObjects(rows, migrations) {
  const counts = {};
  const unmapped = [];
  for (const row of rows) {
    const bareName = row.object_name.replace(/\(.*$/, "");
    const migration = migrations.find(([, sql]) => sql.includes(`"${bareName}"`) || sql.includes(bareName))?.[0];
    if (!migration) {
      unmapped.push(`${row.kind}:${row.object_name}`);
      continue;
    }
    counts[migration] ??= {};
    counts[migration][row.kind] = (counts[migration][row.kind] ?? 0) + 1;
  }
  return { counts, unmapped };
}

function validateSqlOnlyInventory(inventory) {
  invariant(inventory.unmapped.length === 0, `objetos SQL-only sin migracion: ${inventory.unmapped.join(", ")}`);
  const normalizeCounts = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([migration, kinds]) => [migration, Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)))]));
  invariant(JSON.stringify(normalizeCounts(inventory.counts)) === JSON.stringify(normalizeCounts(EXPECTED_SQL_ONLY_COUNTS)), "inventario SQL-only cambio");
  return Object.freeze({
    total: Object.values(inventory.counts).reduce((sum, kinds) => sum + Object.values(kinds).reduce((a, b) => a + b, 0), 0),
    migrations: Object.keys(inventory.counts).length,
  });
}

export async function inspectCrm01b1SqlDriftBaseline({ root = process.cwd(), rawUrl } = {}) {
  const { prisma, target } = await createCrm01b1LocalPrisma(rawUrl);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      const [history] = await tx.$queryRawUnsafe(`
        SELECT count(*)::integer AS complete,
               count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::integer AS failed
        FROM "osi"."_prisma_migrations"
        WHERE rolled_back_at IS NULL
      `);
      invariant(history.complete === 17 && history.failed === 0, "historial no es 17/17 completo");
      const rows = (await tx.$queryRawUnsafe(CATALOG_SQL)).map((row) => Object.freeze({
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
      const catalog = validateCrm01b1CatalogSummary(Object.freeze({
        count: rows.length,
        sha256: sha256(rows),
        categories: Object.freeze(categories),
      }));
      const sqlOnlyRows = await tx.$queryRawUnsafe(SQL_ONLY_SQL);
      const sqlOnly = validateSqlOnlyInventory(mapSqlOnlyObjects(sqlOnlyRows, await loadMigrationSql(root)));
      return Object.freeze({ ok: true, target, history, catalog, sqlOnly, prismaDiffSha256: PRISMA_EMPTY_DIFF_SHA256 });
    }, { maxWait: 5_000, timeout: 35_000 });
  } finally {
    await prisma.$disconnect();
  }
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
