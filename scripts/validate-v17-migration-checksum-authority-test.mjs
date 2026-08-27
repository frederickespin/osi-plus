import { strict as assert } from "node:assert";
import {
  MIGRATION_SQL_ATTRIBUTE,
  inspectSqlBytes,
  validateAttributes,
  validateMigrationBytes,
} from "./validate-v17-migration-checksum-authority.mjs";

const results = [];
function check(name, action, expectedCode = null) {
  let error = null;
  try { action(); } catch (caught) { error = caught; }
  const passed = expectedCode ? String(error?.message || "").startsWith(expectedCode) : !error;
  results.push({ name, passed });
  assert.equal(passed, true, `${name}: ${error?.message || "expected failure not observed"}`);
}

const lf = Buffer.from("SELECT 1;\nSELECT 2;\n", "utf8");
const crlf = Buffer.from("SELECT 1;\r\nSELECT 2;\r\n", "utf8");
const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), lf]);
check("exact gitattributes rule accepted", () => validateAttributes(`${MIGRATION_SQL_ATTRIBUTE}\n`));
check("missing rule rejected", () => validateAttributes("*.sql text\n"), "MIGRATION_SQL_LF_ATTRIBUTE_REQUIRED");
check("duplicate rule rejected", () => validateAttributes(`${MIGRATION_SQL_ATTRIBUTE}\n${MIGRATION_SQL_ATTRIBUTE}\n`), "MIGRATION_SQL_LF_ATTRIBUTE_REQUIRED");
check("LF without BOM accepted", () => validateMigrationBytes({ path: "migration.sql", working: lf, blob: lf, expected: inspectSqlBytes(lf).sha256 }));
check("CRLF rejected", () => validateMigrationBytes({ path: "migration.sql", working: crlf, blob: crlf }), "MIGRATION_SQL_LF_REQUIRED");
check("BOM rejected", () => validateMigrationBytes({ path: "migration.sql", working: bom, blob: bom }), "MIGRATION_SQL_BOM_FORBIDDEN");
check("working tree divergence rejected", () => validateMigrationBytes({ path: "migration.sql", working: lf, blob: Buffer.from("SELECT 3;\n") }), "MIGRATION_SQL_WORKTREE_BLOB_MISMATCH");
check("wrong canonical checksum rejected", () => validateMigrationBytes({ path: "migration.sql", working: lf, blob: lf, expected: "0".repeat(64) }), "MIGRATION_SQL_CANONICAL_CHECKSUM_MISMATCH");
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
