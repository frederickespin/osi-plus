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
  VERCEL_GIT_COMMIT_REF: "feature/v17-storage-commercial-contract-22a",
  VERCEL_GIT_COMMIT_SHA: sha,
  CUSTOMER_CUSTODY_API_MODE: "PREVIEW_REHEARSAL",
  CUSTOMER_CUSTODY_API_BATCH: "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW",
  VITE_CUSTOMER_CUSTODY_UI_MODE: "PREVIEW_REHEARSAL",
  VITE_CUSTOMER_CUSTODY_UI_BATCH: "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW",
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
assert.deepEqual(validatePreviewHistory(before, manifest), { alreadyApplied: false, applied: 50 });
assert.deepEqual(validatePreviewHistory([...before, row(CUSTOMER_CUSTODY_MIGRATION, CUSTOMER_CUSTODY_MIGRATION_CHECKSUM)], manifest), { alreadyApplied: true, applied: 51 });
assert.throws(() => validatePreviewHistory(before.slice(1), manifest), /HISTORY_INVALID/u);
assert.throws(() => validatePreviewHistory([...before, row("unexpected", "0".repeat(64))], manifest), /HISTORY_INVALID/u);

const baseRelations = {
  grants_exists: true, lots_exists: true, items_exists: true, commands_exists: true,
  movements_exists: true, storage_groups_exists: true, reception_workflow_exists: true,
  scan_first_exists: true, authorizations_exists: true, lot_authorization_exists: true,
  agreements_exists: true, authorization_agreement_exists: true,
  inventory_number_exists: true, next_item_number_exists: true,
  catalog_exists: true, package_form_code_exists: true, package_form_label_exists: true,
  warehouse_unload_target_exists: false, lot_unload_target_exists: false, unloading_started_exists: false,
  unloading_finished_exists: false, vehicle_evidence_exists: false,
};
assert.doesNotThrow(() => validatePreviewRelationState(baseRelations, false));
assert.doesNotThrow(() => validatePreviewRelationState({ ...baseRelations, warehouse_unload_target_exists: true, lot_unload_target_exists: true, unloading_started_exists: true, unloading_finished_exists: true, vehicle_evidence_exists: true }, true));
assert.throws(() => validatePreviewRelationState({ ...baseRelations, scan_first_exists: false }, false), /RELATION_STATE_INVALID/u);

process.stdout.write("v17 customer custody preview migration: ok\n");
