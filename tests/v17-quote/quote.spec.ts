import { expect, test, type Page } from "@playwright/test";

const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const MEMBERSHIP_REF = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const COSTING_REF = "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const LINE_REF = "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const permissions = ["pipeline:view", "costing:view", "quote:view", "quote:create", "quote:update", "quote:publish", "quote:send", "quote:record-client-decision", "quote:override-price", "quote:internal-cost:view", "quote:tenant"];
const costing = { revisionRef: COSTING_REF, revision: 1, status: "PUBLISHED", baseCurrency: "USD", logicalSha256: "c".repeat(64), publishedAt: "2026-09-10T12:00:00.000Z", totals: { ownCosts: "300", externalCosts: "0", disbursements: "0", risks: "0", currencyCompensation: "0", totalCost: "300", suggestedPrice: "400", expectedMarginBps: 2500 }, lines: [{ lineRef: LINE_REF, logisticsItemRef: null, family: "LABOR", concept: "Equipo operativo", classification: "PR", source: "ADMIN", sourceRef: "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", sourceVersion: 2, quantity: "1", unit: "SERVICE", originalCurrency: "USD", originalUnitCost: "300", exchangeRateRef: null, exchangeRateVersion: null, exchangeRate: "1", baseCurrency: "USD", baseUnitCost: "300", totalCost: "300", minimumMarginBps: 2000, recommendedMarginBps: 2500, suggestedPrice: "400", priceStatus: "RECOMMENDED", position: 1 }], issues: [], overrides: [] };

async function session(page: Page, deny = false, additionalPermissions: string[] = [], deniedPermissions: string[] = []) {
  const denied = deny ? ["quote:view", ...deniedPermissions] : deniedPermissions;
  const membership = { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true };
  await page.addInitScript((fixture) => {
    localStorage.setItem("osi-plus.token", "synthetic.quote.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({
      name: "Cotizador sintético", role: "A", membershipRef: fixture.membershipRef, memberships: [fixture],
    }));
  }, membership);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ok: true, user: {
    name: "Cotizador sintético", role: "A", status: "ACTIVE", permissions: [...permissions, ...additionalPermissions],
    deniedPermissions: denied, membership, memberships: [membership],
  } } }));
}
async function crm(page: Page) { const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" }; const byStatus = Object.fromEntries(["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"].map((status) => [status, 0])); await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 25 }) })); await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { total: 0, assigned: 0, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) })); await page.route("**/api/crm/pipeline-cases/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0901", version: 1, status: "PRICING_IN_PROGRESS", mode: "LOCAL", serviceType: "MOVING_LOCAL", customerType: "L4_PERSONAL", estimatedCbm: 20, requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Origen estructurado", destinationLocation: "Destino estructurado", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 2, client: { clientRef: "528f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Cotizador sintético", isCurrentActor: true }, createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-10T12:00:00.000Z" } }) })); await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0901", status: "PRICING_IN_PROGRESS", version: 1, mode: "LOCAL", serviceType: "MOVING_LOCAL", volume: { status: "ESTIMATED", estimatedCbm: 20, source: "ICP" }, requiresSurvey: true, surveyMethod: "PRESENCIAL", intakeChannel: "REFERRED", clientProfileType: "PERSONAL", requirementNotes: null, serviceDefinitionStatus: "DEFINED", surveyDecisionStatus: "DEFINED", ownerName: "Cotizador sintético", caseContact: { displayName: "Contacto sintético", phone: "+18095550100", email: null }, client: { clientRef: "528f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, route: { contractVersion: 2, revision: 1, destinationStatus: "CONFIRMED", origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: null, streetAndNumber: "Origen sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, destination: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: null, streetAndNumber: "Destino sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, additionalStops: [] }, createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-10T12:00:00.000Z" } }) })); }
function proposal(position: number, state = "DRAFT", revision = 1) { return { proposalRef: `${position}38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012`, reference: `Q-2026-00000${position}-${String.fromCharCode(64 + position)}`, position, state, revisionRef: `${position}48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012`, revision, proposalName: `Opción ${position}`, costingRevisionRef: COSTING_REF, costingLogicalSha256: "c".repeat(64), currency: "USD", issueDate: "2026-09-10", validUntil: "2026-10-10", commercialContext: { leadAccount: null, booker: null, tariff: null, referral: null, associations: [] }, payer: { displayName: "Pagador autorizado", sourceVersion: 1 }, terms: {}, exchange: null, discount: null, totals: { capturedCost: 300, suggestedPrice: 400, grossQuotedPrice: position === 1 ? 350 : 400 + position * 25, discountAmount: 0, totalQuotedPrice: position === 1 ? 350 : 400 + position * 25 }, lines: [{ lineRef: `${position}58f6d8f-8d11-4f39-8a2d-1b6c7e8f9012`, sourceKind: "COSTING", concept: "Equipo operativo", quantity: "1", unit: "SERVICE", economicClass: "PR", capturedCost: "300", suggestedPrice: "400", quotedPrice: position === 1 ? "350" : String(400 + position * 25), currency: "USD", priceStatus: "CONFIRMED", position: 1 }], issues: [], logicalSha256: "d".repeat(64) }; }

test("usa costos publicados, crea, publica, envía y registra decisión", async ({ page }) => {
  await session(page);
  await crm(page);
  let proposals: ReturnType<typeof proposal>[] = [];
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: costing } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=addons&currency=*`, (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({
    json: { ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0901", destinationStatus: "CONFIRMED", proposals } },
  }));
  await page.route("**/api/quote/proposals/create", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      costingRevisionRef: COSTING_REF,
      lines: [{ sourceKind: "COSTING", costingLineRef: LINE_REF, quotedPrice: "350" }],
    });
    proposals = [proposal(1)];
    return route.fulfill({ status: 201, json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/publish", (route) => {
    proposals = [proposal(1, "READY", 2)];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/send", (route) => {
    proposals = [proposal(1, "SENT", 3)];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/decision", (route) => {
    proposals = [proposal(1, "ACCEPTED", 3)];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Cotización" }).click();
  await page.getByRole("button", { name: "Nueva propuesta 1" }).click();
  await page.getByRole("button", { name: "Usar costos publicados" }).click();
  await page.getByLabel("Precio cotizado Equipo operativo").fill("350");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Debajo del sugerido")).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.getByRole("button", { name: "Registrar envío" }).click();
  await page.getByRole("button", { name: "Registrar aceptación" }).click();
  await expect(page.getByText("ACCEPTED").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
test("muestra tres propuestas con referencias y posiciones estables", async ({ page }) => { await session(page); await crm(page); const proposals = [proposal(1), proposal(2), proposal(3)]; await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: costing }) })); await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0901", destinationStatus: "CONFIRMED", proposals } }) })); await page.goto(`/commercial/cases/${CASE_REF}`); await page.getByRole("tab", { name: "Cotización" }).click(); await expect(page.getByRole("button", { name: "Propuesta 1 Q-2026-000001-A" })).toBeVisible(); await expect(page.getByRole("button", { name: "Propuesta 2 Q-2026-000002-B" })).toBeVisible(); await expect(page.getByRole("button", { name: "Propuesta 3 Q-2026-000003-C" })).toBeVisible(); await expect(page.getByRole("button", { name: /Nueva propuesta/ })).toHaveCount(0); });
test("registra rechazo explícito sin eliminar la revisión enviada", async ({ page }) => { await session(page); await crm(page); let proposals: Record<string, unknown>[] = [proposal(1, "SENT", 3)]; await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: costing }) })); await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0901", destinationStatus: "CONFIRMED", proposals } }) })); await page.route("**/api/quote/proposals/decision", (route) => { proposals = [proposal(1, "REJECTED", 3)]; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: proposals[0] }) }); }); await page.goto(`/commercial/cases/${CASE_REF}`); await page.getByRole("tab", { name: "Cotización" }).click(); await page.getByRole("button", { name: "Registrar rechazo" }).click(); await expect(page.getByText("REJECTED").last()).toBeVisible(); await expect(page.getByText("Revisión 3")).toBeVisible(); });
test("deny no carga chunk ni solicita APIs Quote", async ({ page }) => { await session(page, true); await crm(page); let requests = 0; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/quote/")) requests += 1; }); await page.goto(`/commercial/cases/${CASE_REF}`); await expect(page.getByRole("tab", { name: "Cotización" })).toHaveCount(0); expect(requests).toBe(0); const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("QuotePanel"))); expect(chunks).toHaveLength(0); });

test("abre el borrador desde el catálogo y revisa la propuesta enviada", async ({ page }) => {
  await session(page, false, [], ["costing:view"]);
  await crm(page);
  const serviceName = "Descarga en destino";
  const serviceRef = "438f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const lineRef = "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const catalog = { ruleRef: serviceRef, version: 2, unitPrice: "50.00" };
  const groupName = "Transporte de contenedor";
  const record = proposal(1);
  const directProposal = {
    ...record, sourceMode: "CATALOG", groupName, currency: "DOP", validUntil: "2099-12-31", terms: { groupName, scope: groupName },
    totals: { capturedCost: 70, suggestedPrice: 100, grossQuotedPrice: 100, discountAmount: 0, totalQuotedPrice: 100 },
    lines: [{ ...record.lines[0], catalog, lineRef, sourceKind: "MANUAL", concept: serviceName, quantity: "2",
      unit: "servicio", currency: "DOP", capturedCost: "70", suggestedPrice: "100", quotedPrice: "100.00" }],
  };
  let proposals: typeof directProposal[] = [];
  const costingOperations: string[] = [];
  page.on("request", (request) => {
    const { pathname, searchParams } = new URL(request.url());
    if (pathname.startsWith("/api/costing/") && searchParams.get("view") !== "addons") costingOperations.push(pathname);
  });
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=addons&currency=DOP`, (route) => route.fulfill({
    json: { ok: true, data: [{ ...catalog, name: serviceName, family: "LABOR", unit: "servicio", currency: "DOP", classification: "PR" }] },
  }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: { caseRef: CASE_REF, proposals } } }));
  await page.route("**/api/quote/proposals/create", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      costingRevisionRef: null,
      terms: { groupName },
      lines: [{
        sourceKind: "MANUAL", concept: serviceName, quantity: "2", quotedPrice: "100.00",
        manualAuthority: { kind: "QUOTE_CATALOG_COMPONENT", reference: serviceRef, version: 2 },
      }],
    });
    proposals = [directProposal];
    return route.fulfill({ status: 201, json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/publish", (route) => {
    proposals = [{ ...directProposal, state: "READY", revision: 2 }];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/send", (route) => {
    proposals = [{ ...directProposal, state: "SENT", revision: 3 }];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });
  await page.route("**/api/quote/proposals/revise", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      costingRevisionRef: null, proposalRef: record.proposalRef, expectedRevision: 3, position: 1,
      terms: { groupName },
      lines: [{ lineRef, sourceKind: "MANUAL", concept: serviceName, quantity: "3", quotedPrice: "150.00", manualAuthority: null }],
    });
    proposals = [{
      ...directProposal, revision: 4, lines: [{ ...directProposal.lines[0], quantity: "3", quotedPrice: "150.00" }],
      totals: { ...directProposal.totals, suggestedPrice: 150, grossQuotedPrice: 150, totalQuotedPrice: 150 },
    }];
    return route.fulfill({ json: { ok: true, data: proposals[0] } });
  });

  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Cotización", exact: true }).click();
  await page.getByRole("button", { name: "Nueva propuesta 1" }).click();
  const search = page.getByLabel("Buscar servicio, producto o combinación", { exact: true });
  await search.fill("descarga");
  await expect(page.getByRole("button", { name: "Agregar " + serviceName, exact: true })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByLabel("Cantidad de " + serviceName)).toHaveValue("1");
  await page.getByLabel("Cantidad de " + serviceName).fill("2");
  await page.getByLabel("Nombre del grupo", { exact: true }).fill(groupName);
  await expect(page.getByLabel("Totales de la propuesta").getByText(/100[.,]00/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.getByRole("button", { name: "Registrar envío" }).click();
  await page.getByRole("button", { name: /Editar propuesta|Nueva revisión/ }).click();
  await expect(page.getByLabel("Nombre del grupo", { exact: true })).toHaveValue(groupName);
  await expect(page.getByLabel("Cantidad de " + serviceName)).toHaveValue("2");
  await page.getByLabel("Cantidad de " + serviceName).fill("3");
  await page.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(page.getByText("Revisión 4", { exact: false })).toBeVisible();
  expect(proposals[0].proposalRef).toBe(record.proposalRef);
  expect(costingOperations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

for (const authorized of [false, true]) {
  test(authorized ? "autoriza y publica el descuento con motivo" : "mantiene bloqueada la publicación del descuento sin autorización", async ({ page }) => {
    await session(page, false, authorized ? ["costing:authorize-margin"] : [], ["costing:view"]);
    await crm(page);
    const record = proposal(1);
    const issue = {
      code: "MARGIN_AUTHORIZATION_REQUIRED", severity: "BLOCKER", status: "OPEN",
      message: "El descuento requiere autorización administrativa.",
    };
    let current = { ...record, sourceMode: "CATALOG", issues: [issue] };
    const requests: Record<string, unknown>[] = [];
    await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: { caseRef: CASE_REF, proposals: [current] } } }));
    await page.route("**/api/quote/proposals/publish", (route) => {
      requests.push(route.request().postDataJSON());
      current = { ...current, revision: 2, state: "READY", issues: [] };
      return route.fulfill({ json: { ok: true, data: current } });
    });
    await page.goto(`/commercial/cases/${CASE_REF}`);
    await page.getByRole("tab", { name: "Cotización", exact: true }).click();
    await expect(page.getByText(issue.message)).toBeVisible();
    const reason = page.getByLabel("Motivo de autorización");
    const authorize = page.getByRole("button", { name: "Autorizar y publicar" });
    if (!authorized) {
      await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
      await expect(reason).toHaveCount(0);
      await expect(authorize).toHaveCount(0);
      expect(requests).toEqual([]);
      return;
    }
    const justification = "Se confirma el descuento para este traslado";
    await expect(authorize).toBeDisabled();
    await reason.fill(" ");
    await expect(authorize).toBeDisabled();
    await reason.fill(justification);
    await authorize.click();
    await expect(page.getByRole("button", { name: "Registrar envío" })).toBeVisible();
    expect(requests).toEqual([expect.objectContaining({
      proposalRef: record.proposalRef, expectedRevision: 1, marginApprovalReason: justification,
    })]);
  });
}

test("recupera la combinación preparada en Servicios y conserva las cajas adicionales", async ({ page }) => {
  await session(page, false, ["costing:calculate", "costing:publish"]);
  await crm(page);
  const packageName = "Mudanza local de 1 a 6 m³";
  const otherPackageName = "Mudanza local de 7 a 12 m³";
  const crate = "Caja de madera para TV";
  const versionRef = "748f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const crateRef = "758f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const shipment = { mode: "NONE", factor: null, roundKg: 1 };
  const packageCosting = {
    ...costing, baseCurrency: "DOP",
    lines: [{ ...costing.lines[0], sourceRef: crateRef, concept: crate, family: "MATERIAL",
      quantity: "2", unit: "caja", originalCurrency: "DOP", baseCurrency: "DOP", totalCost: "70", suggestedPrice: "100" }],
    packagePricing: { versionRef, name: packageName, version: 1, pricingVersion: 1, minimumSale: "300",
      shipment, allowEdits: true, measures: { volumeM3: 5 } },
  };
  let proposals: object[] = [];
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: proposals.length ? packageCosting : null } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=packages`, (route) => route.fulfill({ json: { ok: true, data: {
    hasService: true, volumeM3: 5, selectedPackageVersionRef: versionRef,
    packages: [
      { versionRef: crypto.randomUUID(), name: otherPackageName, version: 1, currency: "DOP",
        shipment, includeRouteTransport: false, needsWeight: false, minimumSale: "600", volumeTiers: [] },
      { versionRef, name: packageName, version: 1, currency: "DOP",
        shipment, includeRouteTransport: false, needsWeight: false, minimumSale: "0", volumeTiers: [{ maxM3: 6, minimumSale: "300" }] },
    ],
  } } }));
  await page.route("**/api/costing/calculate", (route) => {
    expect(route.request().postDataJSON().packageEstimate).toEqual({ versionRef, volumeM3: "5", grossKg: null });
    return route.fulfill({ json: { ok: true, data: { calculationRef: COSTING_REF, result: { issues: [] } } } });
  });
  await page.route("**/api/costing/publish", (route) => route.fulfill({ json: { ok: true, data: packageCosting } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=addons&currency=DOP`, (route) => route.fulfill({ json: {
    ok: true, data: [
      { ruleRef: crateRef, version: 2, name: crate, family: "MATERIAL", unit: "caja", currency: "DOP", unitPrice: "50", classification: "PR" },
      { ruleRef: LINE_REF, version: 1, name: "Papel kraft", family: "MATERIAL", unit: "rollo", currency: "DOP", unitPrice: "20", classification: "PR" },
    ],
  } }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: { caseRef: CASE_REF, proposals } } }));
  await page.route("**/api/quote/proposals/create", (route) => {
    const { lines } = route.request().postDataJSON();
    expect(lines).toMatchObject([
      { sourceKind: "COSTING", concept: crate, quantity: "2", quotedPrice: "100" },
      { sourceKind: "MANUAL", concept: crate, quantity: "1", quotedPrice: "50.00",
        manualAuthority: { kind: "QUOTE_CATALOG_COMPONENT", reference: crateRef, version: 2 } },
    ]);
    const result = { ...proposal(1), currency: "DOP" };
    proposals = [{ ...result, packageScope: { name: packageName, volumeM3: 5 },
      totals: { grossQuotedPrice: 350, totalQuotedPrice: 350 },
      lines: [
        { ...result.lines[0], concept: crate, quantity: "2", quotedPrice: "100" },
        { ...result.lines[0], lineRef: COSTING_REF, sourceKind: "MANUAL", packageMinimum: true,
          concept: "Ajuste al mínimo del paquete", quotedPrice: "200" },
        { ...result.lines[0], lineRef: crateRef, sourceKind: "MANUAL", concept: crate, quantity: "1", quotedPrice: "50" },
      ],
    }];
    return route.fulfill({ status: 201, json: { ok: true, data: proposals[0] } });
  });

  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Cotización", exact: true }).click();
  await page.getByRole("button", { name: "Nueva propuesta 1" }).click();
  const search = page.getByLabel("Buscar servicio, producto o combinación", { exact: true });
  const catalog = page.getByRole("region", { name: "Catálogo de conceptos" });
  const firstResult = catalog.getByRole("listitem").first();
  await expect(firstResult.getByText("Preparada en Servicios", { exact: true })).toBeVisible();
  await expect(firstResult.getByRole("button", { name: "Agregar " + packageName, exact: true })).toBeVisible();
  await expect(catalog.getByRole("button", { name: "Agregar " + otherPackageName, exact: true })).toBeVisible();
  await expect(page.getByLabel("Cantidad de " + crate, { exact: true })).toHaveCount(0);
  await search.fill("madera");
  await page.getByRole("button", { name: "Agregar " + crate, exact: true }).click();
  await page.getByLabel("Cantidad de " + crate, { exact: true }).fill("3");
  await search.fill("mudanza");
  await page.getByRole("button", { name: "Agregar " + packageName, exact: true }).click();
  await expect(page.getByLabel("Cantidad de " + crate)).toHaveValue("2");
  await expect(page.getByLabel("Cantidad adicional 1")).toHaveValue("1");
  await search.fill("madera");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(catalog.getByText("Papel kraft")).toHaveCount(0);
  await expect(catalog.getByText("En el paquete · 2")).toBeVisible();
  await catalog.getByRole("button", { name: "Agregar " + crate }).click();
  await catalog.getByRole("button", { name: "Agregar " + crate }).click();
  await expect(page.getByLabel("Cantidad adicional 1")).toHaveValue("1");
  await expect(page.getByLabel("Cantidad adicional 2")).toHaveValue("2");
  await expect(page.getByLabel("Cantidad adicional 3")).toHaveCount(0);
  await page.getByRole("button", { name: "Quitar adicional 2" }).click();
  await expect(page.getByLabel("Totales de la propuesta").getByText(/350[.,]00/)).toBeVisible();
  await expect(page.getByLabel("Cantidad de " + crate)).toHaveValue("2");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Ajuste del paquete", { exact: true })).toBeVisible();
  await expect(page.getByText(/Adicionales.*50[.,]00/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
