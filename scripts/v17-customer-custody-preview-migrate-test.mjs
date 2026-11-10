import assert from "node:assert/strict";
import {
  CUSTOMER_CUSTODY_MIGRATION,
  CUSTOMER_CUSTODY_MIGRATION_CHECKSUM,
  RETAINED_PREVIEW_EXTENSION,
  previewMigrationManifest,
  previewMigrationOperation,
  validatePreviewHistory,
  validatePreviewRelationState,
} from "./v17-customer-custody-preview-migrate.mjs";

const sha = "1".repeat(40);
const base = {
  V17_CUSTOMER_CUSTODY_PREVIEW_MIGRATION: `APPLY:${sha}`,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feature/v17-customer-custody-21a",
  VERCEL_GIT_COMMIT_SHA: sha,
  CUSTOMER_CUSTODY_API_MODE: "PREVIEW_REHEARSAL",
  CUSTOMER_CUSTODY_API_BATCH: "V17-CUSTOMER-CUSTODY-21A-PREVIEW",
  VITE_CUSTOMER_CUSTODY_UI_MODE: "PREVIEW_REHEARSAL",
  VITE_CUSTOMER_CUSTODY_UI_BATCH: "V17-CUSTOMER-CUSTODY-21A-PREVIEW",
  DIRECT_URL: "postgresql://synthetic.example.invalid/v17_consolidated_preview_10b?sslmode=require&schema=osi",
  DATABASE_URL: "postgresql://synthetic-pooler.example.invalid/v17_consolidated_preview_10b?sslmode=require&schema=osi",
};

assert.deepEqual(previewMigrationOperation(base), { commit: sha });
for (const patch of [
  { VERCEL_ENV: "production" },
  { VERCEL_GIT_COMMIT_REF: "main" },
  { VERCEL_GIT_COMMIT_SHA: "2".repeat(40) },
  { CUSTOMER_CUSTODY_API_MODE: "DISABLED" },
  { DIRECT_URL: base.DATABASE_URL },
]) {
  assert.throws(() => previewMigrationOperation({ ...base, ...patch }), /CUSTOMER_CUSTODY_PREVIEW_MIGRATION_/u);
}
assert.equal(previewMigrationOperation({}), null);
assert.equal(previewMigrationOperation({ V17_CUSTOMER_CUSTODY_PREVIEW_MIGRATION: "DISABLED" }), null);

const manifest = previewMigrationManifest();
assert.equal(manifest[CUSTOMER_CUSTODY_MIGRATION], CUSTOMER_CUSTODY_MIGRATION_CHECKSUM);
const row = (migration_name, checksum) => ({ migration_name, checksum, finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 });
const before = Object.entries(manifest).filter(([name]) => name !== CUSTOMER_CUSTODY_MIGRATION).map(([name, checksum]) => row(name, checksum));
before.push(row(RETAINED_PREVIEW_EXTENSION.name, RETAINED_PREVIEW_EXTENSION.checksum));
assert.deepEqual(validatePreviewHistory(before, manifest), { alreadyApplied: false, applied: 46 });
assert.deepEqual(validatePreviewHistory([...before, row(CUSTOMER_CUSTODY_MIGRATION, CUSTOMER_CUSTODY_MIGRATION_CHECKSUM)], manifest), { alreadyApplied: true, applied: 47 });
assert.throws(() => validatePreviewHistory(before.slice(1), manifest), /HISTORY_INVALID/u);
assert.throws(() => validatePreviewHistory([...before, row("unexpected", "0".repeat(64))], manifest), /HISTORY_INVALID/u);

const baseRelations = {
  grants_exists: true, lots_exists: true, items_exists: true, commands_exists: true,
  movements_exists: true, storage_groups_exists: true, reception_workflow_exists: true,
  scan_first_exists: true, authorizations_exists: false, lot_authorization_exists: false,
};
assert.doesNotThrow(() => validatePreviewRelationState(baseRelations, false));
assert.doesNotThrow(() => validatePreviewRelationState({ ...baseRelations, authorizations_exists: true, lot_authorization_exists: true }, true));
assert.throws(() => validatePreviewRelationState({ ...baseRelations, scan_first_exists: false }, false), /RELATION_STATE_INVALID/u);

process.stdout.write("v17 customer custody preview migration: ok\n");
