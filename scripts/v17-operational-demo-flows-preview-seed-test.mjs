import assert from "node:assert/strict";
import { operationalDemoSeedOperation } from "./v17-operational-demo-flows-preview-seed.mjs";

const commit = "a".repeat(40);
const valid = {
  V17_OPERATIONAL_DEMO_FLOWS_SEED: `APPLY:${commit}`,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feature/v17-commercial-storage-services-23a",
  VERCEL_GIT_COMMIT_SHA: commit,
  CUSTOMER_CUSTODY_API_MODE: "PREVIEW_REHEARSAL",
  CUSTOMER_CUSTODY_API_BATCH: "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW",
  DIRECT_URL: "postgresql://preview.invalid@ep-demo.us-east-2.aws.neon.tech/v17_consolidated_preview_10b?schema=osi&sslmode=require",
  DATABASE_URL: "postgresql://preview.invalid@ep-demo-pooler.us-east-2.aws.neon.tech/v17_consolidated_preview_10b?schema=osi&sslmode=require",
};

assert.equal(operationalDemoSeedOperation({}), null);
assert.equal(operationalDemoSeedOperation({ V17_OPERATIONAL_DEMO_FLOWS_SEED: "DISABLED" }), null);
assert.deepEqual(operationalDemoSeedOperation(valid), { commit });

for (const patch of [
  { VERCEL_ENV: "production" },
  { VERCEL_GIT_COMMIT_REF: "main" },
  { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
  { DATABASE_URL: "postgresql://preview.invalid@ep-demo-pooler.us-east-2.aws.neon.tech/neondb?schema=osi" },
  { DIRECT_URL: "postgresql://preview.invalid@ep-other.us-east-2.aws.neon.tech/v17_consolidated_preview_10b?schema=osi" },
  { CUSTOMER_CUSTODY_API_MODE: "PRODUCTION" },
]) assert.throws(() => operationalDemoSeedOperation({ ...valid, ...patch }), /OPERATIONAL_DEMO_FLOWS_SEED_/u);

process.stdout.write("v17 operational demo flows Preview seed guard: ok\n");
