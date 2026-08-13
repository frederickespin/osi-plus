import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCrm01b3b3Guard } from "./validate-crm-01b3b3-guard.mjs";

assert.equal(validateCrm01b3b3Guard().ok, true);
const crypto = readFileSync("api/_lib/crmOwnerRef.js", "utf8");
const mutation = readFileSync("api/_lib/pipelineCaseMutationHttp.js", "utf8");
const module = readFileSync("src/crm-relational/RelationalPipelineModule.tsx", "utf8");
const domain = readFileSync("api/_lib/pipelineCaseDomain.js", "utf8");
const access = readFileSync("api/_lib/crmPipelineAccess.js", "utf8");
const negatives = [
  ["TTL", { "api/_lib/crmOwnerRef.js": crypto.replace("CRM_OWNER_REF_TTL_SECONDS = 300", "CRM_OWNER_REF_TTL_SECONDS = 3600") }],
  ["ID body", { "api/_lib/pipelineCaseMutationHttp.js": mutation.replace('["expectedVersion", "ownerRef"]', '["expectedVersion", "ownerMembershipId"]') }],
  ["DOM", { "src/crm-relational/RelationalPipelineModule.tsx": module.replace("value={option.presentationKey}", "value={option.ownerRef}") }],
  ["revalidación transaccional", { "api/_lib/pipelineCaseDomain.js": domain.replace("FOR UPDATE OF m, u", "FOR KEY SHARE OF m, u") }],
  ["fallback JWT", { "api/_lib/crmOwnerRef.js": crypto.replace("const secret = env.CRM_PIPELINE_OWNER_REF_SECRET;", "const secret = env.CRM_PIPELINE_OWNER_REF_SECRET || env.JWT_SECRET;") }],
  ["secreto VITE", { "api/_lib/crmOwnerRef.js": crypto.replace("env.CRM_PIPELINE_OWNER_REF_SECRET", "env.VITE_CRM_PIPELINE_OWNER_REF_SECRET") }],
  ["AES sin HKDF", { "api/_lib/crmOwnerRef.js": crypto.replace("Buffer.from(hkdfSync(", "Buffer.from((") }],
  ["secreto requerido siempre", { "api/_lib/crmPipelineAccess.js": access.replace("if (localWrite || productionWrite) assertCrmOwnerRefSecretConfigured(env);", "assertCrmOwnerRefSecretConfigured(env);") }],
  ["secreto en frontend", {}, { "src/unsafe-owner-secret.ts": "export const leaked = process.env.CRM_PIPELINE_OWNER_REF_SECRET;" }],
];
for (const [name, overrides, extraSources] of negatives) {
  assert.throws(() => validateCrm01b3b3Guard({ overrides, extraSources }), /CRM01B3B3_GUARD/, name);
}
assert.throws(() => validateCrm01b3b3Guard({ extraSources: { "api/crm/unprotected-new-route.js": "export default function handler() {}" } }), /inventario recursivo/);
const assertions = negatives.length + 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions, results: [...negatives.map(([name]) => ({ name, passed: true })), { name: "descubrimiento recursivo", passed: true }] }, null, 2)}\n`);
