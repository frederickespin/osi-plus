import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSurveyFoundationSources } from "./validate-v17-survey-foundation-guard.mjs";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8"); const base = { schema: await read("prisma/schema.prisma"), migration: await read("prisma/migrations/20260905010000_v17_survey_foundation/migration.sql"), domain: await read("api/_lib/crmSurveyDomain.js"), http: await read("api/_lib/crmSurveyHttp.js"), ui: await read("src/survey/SurveyApp.tsx"), pdf: await read("api/_lib/crmSurveyPdf.js"), hub: await read("src/hub/HubWorkspace.tsx"), catalog: await read("src/hub/appCatalog.ts"), rbac: await read("api/_lib/rbac.js"), env: await read(".env.example") };
assert.deepEqual(validateSurveyFoundationSources(base), []);
const cases = [
  ["modelo", { schema: base.schema.replace("model SurveyPublication {", "model RemovedPublication {") }],
  ["blob inline", { schema: base.schema.replace("model SurveyBlobObject {", "model SurveyBlobObject {\n  bytes Bytes") }],
  ["inmutabilidad", { migration: base.migration.replace("survey_publication_items_immutable", "removed_guard") }],
  ["tenant", { domain: base.domain.replaceAll("tenantId: who.tenantId", "tenantId: context.tenantId") }],
  ["foto daño", { domain: base.domain.replaceAll("SURVEY_DAMAGE_PHOTO_REQUIRED", "REMOVED_DAMAGE_RULE") }],
  ["journal", { domain: base.domain.replaceAll("surveyMutationCommand", "removedCommand") }],
  ["legacy client", { domain: `${base.domain}\nconst clientName = 'legacy';` }],
  ["production", { http: base.http.replace('PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL"', 'PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL", PRODUCTION_WRITE: "PRODUCTION_WRITE"') }],
  ["default enabled", { env: base.env.replace('CRM_SURVEY_API_MODE="DISABLED"', 'CRM_SURVEY_API_MODE="PRODUCTION"') }],
  ["storage browser", { ui: `${base.ui}\nlocalStorage.setItem('survey','x');` }],
  ["material manual", { ui: `${base.ui}\n<select name="materials"></select>` }],
  ["pdf private", { pdf: base.pdf.replace("price|cost|margin|internal", "internal") }],
  ["lazy", { hub: base.hub.replace("const SurveyApp = lazy(", "const SurveyApp = eager(") }],
  ["permission", { catalog: base.catalog.replace("survey:assignment:view", "survey:assigned:view") }],
];
for (const [name, change] of cases) assert.ok(validateSurveyFoundationSources({ ...base, ...change }).length > 0, `negative guard: ${name}`);
process.stdout.write(`${JSON.stringify({ ok: true, negativeCases: cases.length }, null, 2)}\n`);
