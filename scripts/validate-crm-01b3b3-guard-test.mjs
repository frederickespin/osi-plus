import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCrm01b3b3Guard } from "./validate-crm-01b3b3-guard.mjs";

assert.equal(validateCrm01b3b3Guard().ok, true);
const crypto = readFileSync("api/_lib/crmOwnerRef.js", "utf8");
const mutation = readFileSync("api/_lib/pipelineCaseMutationHttp.js", "utf8");
const module = readFileSync("src/crm-relational/RelationalPipelineModule.tsx", "utf8");
const domain = readFileSync("api/_lib/pipelineCaseDomain.js", "utf8");
const negatives = [
  ["TTL", { "api/_lib/crmOwnerRef.js": crypto.replace("CRM_OWNER_REF_TTL_SECONDS = 300", "CRM_OWNER_REF_TTL_SECONDS = 3600") }],
  ["ID body", { "api/_lib/pipelineCaseMutationHttp.js": mutation.replace('["expectedVersion", "ownerRef"]', '["expectedVersion", "ownerMembershipId"]') }],
  ["DOM", { "src/crm-relational/RelationalPipelineModule.tsx": module.replace("value={option.presentationKey}", "value={option.ownerRef}") }],
  ["revalidación transaccional", { "api/_lib/pipelineCaseDomain.js": domain.replace("FOR UPDATE OF m, u", "FOR KEY SHARE OF m, u") }],
];
for (const [name, overrides] of negatives) {
  assert.throws(() => validateCrm01b3b3Guard({ overrides }), /CRM01B3B3_GUARD/, name);
}
assert.throws(() => validateCrm01b3b3Guard({ extraSources: { "api/crm/unprotected-new-route.js": "export default function handler() {}" } }), /inventario recursivo/);
const assertions = negatives.length + 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions, results: [...negatives.map(([name]) => ({ name, passed: true })), { name: "descubrimiento recursivo", passed: true }] }, null, 2)}\n`);
