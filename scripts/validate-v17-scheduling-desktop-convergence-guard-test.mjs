import assert from "node:assert/strict";
import fs from "node:fs";
import { validateSchedulingConvergence } from "./validate-v17-scheduling-desktop-convergence-guard.mjs";

const read = (file) => fs.readFileSync(file, "utf8");
const cases = [
  ["store local", "api/_lib/surveySchedulingDomain.js", (value) => `${value}\n// localStorage`],
  ["tenant", "api/_lib/surveySchedulingDomain.js", (value) => value.replace("tenantId: who.tenantId, publicRef: caseRef", "publicRef: caseRef")],
  ["serializable", "api/_lib/surveySchedulingDomain.js", (value) => value.replace("Prisma.TransactionIsolationLevel.Serializable", '"ReadCommitted"')],
  ["motor/costing", "api/_lib/surveySchedulingDomain.js", (value) => value.replaceAll("costingLine", "removedEconomicLine")],
  ["zona Motor", "api/_lib/logisticsEngineContract.js", (value) => value.replace("zoneType: r.zoneType, zoneCode: r.zoneCode", "zoneAuthorityRemoved: true")],
  ["capacidad operacional", "api/_lib/surveySchedulingContract.js", (value) => value.replaceAll("CAN_PERFORM_IN_PERSON_SURVEY", "REMOVED_CAPABILITY")],
  ["permisos explícitos", "api/_lib/rbac.js", (value) => value.replace("  PERMS.SURVEY_SCHEDULE_ASSIGN,\n", "")],
  ["sábado", "api/_lib/surveySchedulingContract.js", (value) => value.replace("saturdayRequiresApproval: true", "saturdayRequiresApproval: false")],
  ["historial", "prisma/migrations/20260911010000_v17_scheduling_desktop_convergence/migration.sql", (value) => value.replace("survey_assignment_events_append_only", "removed_event_guard")],
  ["PIC", "src/survey/SurveyCasePanel.tsx", (value) => value.replace("PREPARED no envía mensajes externos", "Mensaje enviado")],
  ["CORS", "scripts/protected-cors-route-inventory.json", (value) => value.replace('      "/api/crm/survey/scheduling",\n', "")],
  ["contexto Evaluador", "api/_lib/surveySchedulingDomain.js", (value) => value.replace("contextSnapshot: evaluatorContext(pipelineCase, serviceRevision, nextDecision, policy, zone)", "contextSnapshot: { services: [] }")],
  ["método en App", "src/survey/SurveyApp.tsx", (value) => value.replace("Método · {label[row.evaluationMethod] || row.evaluationMethod}", "Método sin autoridad")],
  ["Preview como autoridad", "src/survey/SurveyApp.tsx", (value) => `${value}\n// SurveyVisualPreview`],
];
let checks = 0;
for (const [name, file, mutate] of cases) {
  assert.throws(() => validateSchedulingConvergence({ [file]: mutate(read(file)) }), undefined, name);
  checks += 1; process.stdout.write(`PASS negativa ${name}\n`);
}
process.stdout.write(`Scheduling 11B guard negatives: ${checks}/${checks}\n`);
