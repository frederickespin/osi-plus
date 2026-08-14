import React from "react";
import { createRoot } from "react-dom/client";
import { EvaluatorCanonicalModule } from "@/evaluator-canonical/EvaluatorCanonicalModule";
import { EvaluatorApi } from "@/evaluator-canonical/api";
import { getAppEnv, ENV_LABELS } from "@/lib/env";
import { resolveModuleFromPath } from "@/lib/moduleRouting";
import { deriveInventoryVolumeM3, deriveWeightFromDensity } from "@/modules/evaluator-app/domain/evaluatorWeight";
import { deriveEvaluatorAccessPlan } from "@/modules/evaluator-app/domain/evaluatorAccessPolicy";
import { createEmptyEvaluatorVisitDraft, createInventoryItem, type EvaluatorVisitTask } from "@/modules/evaluator-app/domain/evaluatorVisitDraft";
import { summarizeModernPipelineRows } from "@/crm-relational/modernPipelineAdapter";
import type { CrmPipelineCase } from "@/crm-relational/types";
import "@/index.css";

const task: EvaluatorVisitTask = {
  visitId: "fixture-visit", caseId: "fixture-case", caseCode: "FIXTURE", clientName: "Fixture",
  serviceType: "LOCAL", mode: "LOCAL", surveyMethod: "PRESENTIAL", captureChannel: "EVALUATOR_PRESENTIAL",
  verificationLevel: "HIGH", scheduledDate: "2026-08-14", scheduledTimeLabel: "09:00",
  originAddress: "Local", picName: "Fixture", picPhone: "000", surveyorName: "Fixture",
  status: "ASSIGNED", syncStatus: "LOCAL_DRAFT",
};
const draft = createEmptyEvaluatorVisitDraft(task);
draft.accessConditions.originFloorLevel = "5";
draft.accessConditions.originElevatorAvailable = false;
const inventory = createInventoryItem({ itemName: "Fixture", lengthCm: 100, widthCm: 100, heightCm: 100 });
const volume = deriveInventoryVolumeM3(inventory);
const weight = deriveWeightFromDensity(inventory, 100);
const access = deriveEvaluatorAccessPlan(draft.accessConditions, [inventory], []);

function crmCase(id: string, owner: CrmPipelineCase["owner"]): CrmPipelineCase {
  return Object.freeze({
    id, caseCode: `CASE-${id}`, clientName: "Fixture", mode: "LOCAL", serviceType: "Moving",
    customerType: "PERSON", status: "NEW_INBOX", estimatedCbm: 1, requiresSurvey: true,
    surveyMethod: "PRESENTIAL", originLocation: "A", destinationLocation: "B", destinationContracted: true,
    assetsCount: 0, owner, quoteCount: 0, eventCount: 0,
    createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z",
  });
}
const pipeline = summarizeModernPipelineRows([
  crmCase("1", Object.freeze({ displayName: "Vendedor", role: "V", membershipStatus: "ACTIVE" })),
  crmCase("2", null),
]);

const capturedHeaderNames: string[] = [];
const api = new EvaluatorApi(
  (async (_input: RequestInfo | URL, init?: RequestInit) => {
    new Headers(init?.headers).forEach((_value, name) => capturedHeaderNames.push(name));
    return new Response(JSON.stringify({ total: 0, data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch,
  () => "synthetic-memory-token",
);

void api.listVisits({ page: 1, pageSize: 20 }).then(() => {
  document.documentElement.dataset.apiHeaders = capturedHeaderNames.sort().join(",");
});

document.documentElement.dataset.environment = ENV_LABELS[getAppEnv()];
document.documentElement.dataset.pipelineRoute = resolveModuleFromPath("/sales/pipeline") ?? "";
document.documentElement.dataset.volume = String(volume);
document.documentElement.dataset.weight = String(weight);
document.documentElement.dataset.accessErrors = String(access.validationErrors.length);
document.documentElement.dataset.pipelineDistribution = `${pipeline.total}/${pipeline.assigned}/${pipeline.unassigned}`;

createRoot(document.getElementById("root")!).render(<EvaluatorCanonicalModule />);
