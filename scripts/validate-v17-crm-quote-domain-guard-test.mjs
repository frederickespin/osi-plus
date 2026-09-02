import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const domain = readFileSync(new URL("../api/_lib/crmQuoteProposalDomain.js", import.meta.url), "utf8");

const mutations = [
  ["Producción habilitada", domain.replace("productionApiEnabled: false", "productionApiEnabled: true"), /productionApiEnabled:\s*false/],
  ["persistencia habilitada", domain.replace("persistenceEnabled: false", "persistenceEnabled: true"), /persistenceEnabled:\s*false/],
  ["cuarta propuesta", domain.replace("input.proposals.length > 3", "input.proposals.length > 4"), /input\.proposals\.length\s*>\s*3/],
  ["volumen del ICP", `${domain}\nconst estimatedCbm = 10;`, /^((?!estimatedCbm).)*$/s],
  ["impuestos habilitados", domain.replace("taxComputationEnabled: false", "taxComputationEnabled: true"), /taxComputationEnabled:\s*false/],
];

for (const [name, mutated, required] of mutations) {
  assert.equal(required.test(mutated), false, `la guardia negativa no detectó: ${name}`);
}

process.stdout.write(JSON.stringify({ ok: true, assertions: mutations.length, target: "V17_CRM_QUOTE_DOMAIN_08A_NEGATIVE_GUARD" }, null, 2));
