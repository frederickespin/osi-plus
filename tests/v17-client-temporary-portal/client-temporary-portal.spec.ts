import { expect, test, type Page } from "@playwright/test";

const ACCESS_REF = "11111111-1111-4111-8111-111111111111";
const ASSIGNMENT_REF = "22222222-2222-4222-8222-222222222222";
const EVALUATOR_REF = "33333333-3333-4333-8333-333333333333";
const REASON_REF = "44444444-4444-4444-8444-444444444444";
const ARTICLE_REF = "55555555-5555-4555-8555-555555555555";
const TOKEN = "a".repeat(43);
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };

function portalData() {
  return {
    accessRef: ACCESS_REF,
    purpose: "VISIT",
    expiresAt: "2026-09-20T12:00:00.000Z",
    credentialKind: "TOKEN",
    scopes: ["VISIT_VIEW", "VISIT_CONFIRM", "VISIT_CHANGE_REQUEST", "VISIT_CANCEL_REQUEST", "VISIT_QR_CONFIRM", "MINI_SURVEY_EDIT", "SURVEY_INFO_UPLOAD"],
    contactName: "Contacto sintético",
    case: { caseCode: "PORTAL-001" },
    visit: {
      visitRef: ASSIGNMENT_REF,
      method: "IN_PERSON",
      scheduledStart: "2026-09-18T14:00:00.000Z",
      scheduledEnd: "2026-09-18T16:00:00.000Z",
      status: "ASSIGNED",
      instructions: "Presentar acceso al llegar",
      reason: "Evaluación inicial",
      evaluator: { evaluatorRef: EVALUATOR_REF, displayName: "Evaluadora autorizada", role: "Evaluador" },
      route: [
        { role: "ORIGIN", order: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Piantini", streetAndNumber: "Dirección sintética", buildingResidential: null, floorUnit: null, arrivalReference: null },
        { role: "DESTINATION", order: 0, countryCode: "DO", provinceState: "Santiago", cityMunicipality: "Santiago", sector: null, streetAndNumber: "Destino sintético", buildingResidential: null, floorUnit: null, arrivalReference: null },
      ],
      fee: { disposition: "CLIENT_CHARGE", amount: 1500, currency: "DOP" },
      clientResponse: { state: "PENDING", version: 0 },
    },
    reasons: [{ reasonRef: REASON_REF, name: "Cambio solicitado por cliente", kind: "RESCHEDULE" }],
    miniCatalog: [{ articleRef: ARTICLE_REF, name: "Caja sintética" }],
    contribution: null,
    notices: { surveySource: "CLIENT_SUPPLIED", quoteAcceptanceAvailable: false, externalTransportEnabled: false },
  };
}

async function installPortal(page: Page) {
  const data = portalData();
  const calls: string[] = [];
  await page.route(`**/api/client-access/${ACCESS_REF}**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${pathname}`);
    expect(request.headers().authorization).toBe(`ClientAccess ${TOKEN}`);
    if (pathname.endsWith("/visit")) {
      const body = request.postDataJSON() as { action: string };
      const state = body.action === "VISIT_CONFIRM" ? "CONFIRMED" : body.action === "VISIT_CHANGE_REQUEST" ? "CHANGE_REQUESTED" : "CANCEL_REQUESTED";
      data.visit.clientResponse = { state, version: data.visit.clientResponse.version + 1 };
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { ...data.visit.clientResponse, accepted: true, schedulingChanged: false } }) });
    }
    if (pathname.endsWith("/mini")) {
      data.contribution = { contributionRef: "66666666-6666-4666-8666-666666666666", revision: 1, version: 0, status: "SUBMITTED", source: "CLIENT_SUPPLIED", notes: null, estimatedWeightKg: 4.5, estimatedVolumeM3: 0.12, metricLabel: "Información suministrada por el cliente / Mini Survey", items: [{ itemRef: "77777777-7777-4777-8777-777777777777", articleRef: ARTICLE_REF, name: "Caja sintética", quantity: 1, measurements: null, notes: null, unitWeightKg: 4.5, unitVolumeM3: 0.12 }], assets: [] } as never;
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { contribution: data.contribution, missingMetricCount: 0 } }) });
    }
    if (pathname.endsWith("/upload")) return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { assetRef: "88888888-8888-4888-8888-888888888888", category: "PHOTO" } }) });
    if (pathname.endsWith("/qr")) return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { verified: true } }) });
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data }) });
  });
  return calls;
}

test("acceso temporal ejecuta visita, Mini, carga y QR sin montar el ERP", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  const calls = await installPortal(page);
  await page.goto(`/client-access/${ACCESS_REF}#token=${TOKEN}`);
  await expect(page).toHaveURL(new RegExp(`/client-access/${ACCESS_REF}$`));
  await expect(page.getByRole("heading", { name: "Su visita" })).toBeVisible();
  await expect(page.getByText("Evaluadora autorizada")).toBeVisible();
  await expect(page.getByText("Dirección sintética", { exact: false })).toBeVisible();
  await expect(page.getByText("Destino sintético", { exact: false })).toBeVisible();
  await expect(page.getByText("OSi Plus Hub")).toHaveCount(0);

  await page.getByRole("button", { name: "Confirmar visita" }).click();
  await expect(page.getByText("CONFIRMED")).toBeVisible();
  await page.getByRole("button", { name: "Solicitar cambio" }).click();
  await page.getByLabel("Razón").selectOption(REASON_REF);
  await page.getByLabel("Disponibilidad sugerida").fill("2026-09-19T10:00");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText("CHANGE REQUESTED")).toBeVisible();

  await page.getByRole("button", { name: "Agregar tipo de artículo" }).click();
  await page.getByRole("button", { name: "Completar Mini" }).click();
  await expect(page.getByText("4.5 kg")).toBeVisible();
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({ name: "portal.webp", mimeType: "image/webp", buffer: Buffer.from("synthetic-image") });
  await page.getByLabel("Código QR de visita").fill(`osi-visit:v1:${ASSIGNMENT_REF}:${EVALUATOR_REF}`);
  await page.getByRole("button", { name: "Verificar código" }).click();

  expect(calls.some((entry) => entry.endsWith("/visit"))).toBeTruthy();
  expect(calls.some((entry) => entry.endsWith("/mini"))).toBeTruthy();
  expect(calls.some((entry) => entry.endsWith("/upload"))).toBeTruthy();
  await expect.poll(() => calls.some((entry) => entry.endsWith("/qr"))).toBeTruthy();
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
});

test("inválido, expirado y revocado son indistinguibles y no revelan contexto", async ({ page }) => {
  await page.route(`**/api/client-access/${ACCESS_REF}`, (route) => route.fulfill({ status: 404, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CLIENT_TEMPORARY_ACCESS_UNAVAILABLE" }) }));
  await page.goto(`/client-access/${ACCESS_REF}#token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Acceso temporal" })).toBeVisible();
  await expect(page.getByText("Este acceso ya no está disponible.")).toBeVisible();
  await expect(page.getByText("PORTAL-001")).toHaveCount(0);
  await expect(page.getByText("Evaluadora autorizada")).toHaveCount(0);
  expect(await page.context().cookies()).toEqual([]);
});
