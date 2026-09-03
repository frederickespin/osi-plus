import assert from "node:assert/strict";
import { validateV17CrmSurveyPreviewGuard } from "./validate-v17-crm-survey-preview-guard.mjs";

const route = 'export const CRM_SURVEY_VISUAL_PREVIEW_BRANCH = "feature/v17-crm-survey-preview-09a"; pathname === "/experience-preview/survey"; runtime.vercelEnvironment === "preview";';
assert.throws(() => validateV17CrmSurveyPreviewGuard({ overrides: { "src/crm-survey-preview/clientMode.ts": route.replace('runtime.vercelEnvironment === "preview"', "true") } }), /ruta visual incompleta/);
assert.throws(() => validateV17CrmSurveyPreviewGuard({ overrides: { "src/crm-survey-preview/SurveyVisualPreview.tsx": "fetch('/api/surveys')" } }), /Preview incompleto|realiza red/);
process.stdout.write(`${JSON.stringify({ ok: true, negativeCases: 2 }, null, 2)}\n`);
