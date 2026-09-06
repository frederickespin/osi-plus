import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CASE_REF = "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ASSIGNMENT_REF = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const DECISION_REF = "438f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const schedulingPermissions = ["survey:schedule:view", "survey:schedule:manage", "survey:schedule:assign", "survey:schedule:reschedule", "survey:visit-fee:view", "survey:visit-fee:approve"];

async function session(page: Page, access: "manager" | "viewer" | "deny" = "manager") {
  const permissions = ["pipeline:view", "survey:assignment:view", "survey:read", ...(access === "deny" ? [] : access === "manager" ? schedulingPermissions : ["survey:schedule:view"] )];
  const deniedPermissions = access === "deny" ? ["survey:schedule:view"] : [];
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.scheduling.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Persona sintética", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] }));
  }, { membershipRef: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Persona sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true }] } }) }));
}

async function crm(page: Page) {
  const detail = { caseRef: CASE_REF, caseCode: "CS-2026-1101", version: 1, status: "SURVEY_SCHEDULED", mode: "LOCAL", serviceType: "MOVING_LOCAL", customerType: "L4_PERSONAL", estimatedCbm: 12, requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Origen estructurado", destinationLocation: "Destino estructurado", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 3, client: { clientRef: "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Ventas", isCurrentActor: true }, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z" };
  const byStatus = Object.fromEntries(["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"].map((status) => [status, status === "SURVEY_SCHEDULED" ? 1 : 0]));
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: [detail], total: 1, page: 1, pageSize: 25 }) }));
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 1, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: detail }) }));
  await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: detail.caseCode, status: detail.status, version: 1, mode: "LOCAL", serviceType: "MOVING_LOCAL", volume: { status: "ESTIMATED", estimatedCbm: 12, source: "ICP" }, requiresSurvey: true, surveyMethod: "PRESENCIAL", intakeChannel: "REFERRED", clientProfileType: "PERSONAL", requirementNotes: null, serviceDefinitionStatus: "DEFINED", surveyDecisionStatus: "DEFINED", ownerName: "Ventas", caseContact: { displayName: "Contacto sintético", phone: "+18095550100", email: null }, client: detail.client, route: { contractVersion: 2, revision: 1, destinationStatus: "CONFIRMED", origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: null, streetAndNumber: "Origen sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, destination: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: null, streetAndNumber: "Destino sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, additionalStops: [] }, createdAt: detail.createdAt, updatedAt: detail.updatedAt } }) }));
  await page.route("**/api/crm/survey/assignments", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: [] }) }));
}

function workspace(communications = 0) {
  return {
    caseRef: CASE_REF,
    caseCode: "CS-2026-1101",
    routeVersion: 1,
    decision: { decisionRef: DECISION_REF, method: "IN_PERSON", state: "SCHEDULED", informationSource: "COMMERCIAL", rationaleCode: null, routeVersion: 1, version: 2, createdAt: "2026-09-11T12:00:00.000Z" },
    assignment: { assignmentRef: ASSIGNMENT_REF, scheduledStart: "2026-09-14T13:00:00.000Z", scheduledEnd: "2026-09-14T16:00:00.000Z", evaluator: { displayName: "Evaluadora sintética" }, slotKey: "MORNING", profile: "METRO", zoneCode: "METRO_SANTO_DOMINGO", status: "ASSIGNED", version: 1, instruction: "Confirmar acceso", routeStale: false, surveyRef: null },
    policy: { policyRef: "638f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", version: 1, timezone: "America/Santo_Domingo", profiles: [{ code: "METRO", dailyCapacity: 2 }], slots: [{ profile: "METRO", key: "MORNING", label: "Mañana", startTime: "09:00", endTime: "12:00", capacity: 1 }, { profile: "METRO", key: "AFTERNOON", label: "Tarde", startTime: "14:00", endTime: "16:30", capacity: 1 }], closedWeekdays: [0], closedDates: [], saturdayRequiresApproval: true },
    schedulingContext: { profile: "METRO", zoneCode: "METRO_SANTO_DOMINGO", distanceStatus: "KNOWN", distanceKm: 15 },
    availability: { date: "2026-09-14", profile: "METRO", dayOccupied: 1, dayCapacity: 2, closed: false, saturdayApprovalRequired: false, slots: [{ key: "MORNING", occupied: 1, capacity: 1, available: false }, { key: "AFTERNOON", occupied: 0, capacity: 1, available: true }] },
    evaluatorCandidates: [{ membershipRef: MEMBERSHIP_REF, displayName: "Evaluadora sintética", capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"] }],
    visitFee: null,
    communications: communications ? [{ communicationRef: "738f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", templateCode: "PIC_CLIENT_VISIT", templateVersion: 1, audience: "CLIENT", channel: "WHATSAPP", status: "PREPARED", preparedAt: "2026-09-11T12:30:00.000Z" }] : [],
    history: [{ eventRef: "838f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", type: "SCHEDULED", reasonCode: null, notificationRequired: true, createdAt: "2026-09-11T12:15:00.000Z" }],
    publication: null,
  };
}

async function schedulingApi(page: Page) {
  let communications = 0;
  let mutations = 0;
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    if (route.request().method() === "POST") {
      mutations += 1;
      const body = route.request().postDataJSON();
      if (body.operation === "PREPARE_COMMUNICATION") communications = 1;
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { status: body.operation === "PREPARE_COMMUNICATION" ? "PREPARED" : "ASSIGNED", version: 2 } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: workspace(communications) }) });
  });
  return () => mutations;
}

test("integra Evaluación, Agenda, Visit Fee, PIC e historial sin reescribir Survey App", async ({ page }, testInfo) => {
  await session(page); await crm(page); const mutations = await schedulingApi(page);
  const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Evaluación" }).click();
  await expect(page.getByTestId("survey-scheduling-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evaluación" })).toBeVisible();
  await expect(page.getByText("Evaluadora sintética · METRO · METRO_SANTO_DOMINGO · MORNING")).toBeVisible();
  await expect(page.getByText("Pendiente de cálculo por Motor Logístico y Costing. Scheduling no estima importes.")).toBeVisible();
  await expect(page.getByText("Visita programada")).toBeVisible();
  await page.getByRole("button", { name: "PIC cliente" }).click();
  await expect(page.getByText("1 comunicación(es) preparada(s)")).toBeVisible();
  expect(mutations()).toBe(1);
  await expect(page.getByText("PREPARED no envía mensajes externos.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  if (["chromium-desktop", "chromium-mobile"].includes(testInfo.project.name)) {
    const evidence = resolve(process.cwd(), ".artifacts", "v17-scheduling-desktop-convergence-11b"); mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, `evaluation-${testInfo.project.name}.png`), fullPage: true });
  }
});

test("viewer consulta agenda sin controles de gestión", async ({ page }) => {
  await session(page, "viewer"); await crm(page); await schedulingApi(page);
  await page.goto(`/commercial/cases/${CASE_REF}`); await page.getByRole("tab", { name: "Evaluación" }).click();
  await expect(page.getByTestId("survey-scheduling-workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PIC cliente" })).toHaveCount(0);
});

test("deny prevalece y evita chunk y request de Scheduling", async ({ page }) => {
  await session(page, "deny"); await crm(page); let schedulingRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/crm/survey/scheduling") schedulingRequests += 1; });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await expect(page.getByRole("tab", { name: "Evaluación" })).toHaveCount(0);
  expect(schedulingRequests).toBe(0);
  const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("SurveyCasePanel")));
  expect(chunks).toHaveLength(0);
});
