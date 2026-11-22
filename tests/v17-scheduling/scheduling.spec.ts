import { expect, test, type Page } from "@playwright/test";
import { normalizePrepare } from "../../api/_lib/communicationsContract.js";

const CASE_REF = "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ASSIGNMENT_REF = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const DECISION_REF = "438f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const TEMPLATE_REF = "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const COORDINATION_REF = "e38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Origin",
};
const schedulingPermissions = [
  "survey:schedule:view",
  "survey:schedule:manage",
  "survey:schedule:assign",
  "survey:schedule:reschedule",
  "survey:visit-fee:view",
  "survey:visit-fee:approve",
  "scheduling:exceptions:request",
];

async function session(
  page: Page,
  access: "manager" | "scheduler" | "viewer" | "deny" = "manager",
) {
  const permissions = [
    "pipeline:view",
    "survey:assignment:view",
    "survey:read",
    ...(access === "deny"
      ? []
      : access === "manager"
        ? [
            ...schedulingPermissions,
            "communications:view",
            "communications:prepare",
            "communications:templates:view",
          ]
        : access === "scheduler"
          ? ["survey:schedule:view", "survey:schedule:assign"]
          : ["survey:schedule:view", "communications:view"]),
  ];
  const deniedPermissions = access === "deny" ? ["survey:schedule:view"] : [];
  await page.addInitScript(
    ({ membershipRef }) => {
      localStorage.setItem("osi-plus.token", "synthetic.scheduling.token");
      localStorage.setItem(
        "osi-plus.session",
        JSON.stringify({
          name: "Persona sintética",
          role: "A",
          membershipRef,
          memberships: [
            {
              membershipRef,
              tenantName: "Tenant sintético",
              role: "A",
              preferred: true,
            },
          ],
        }),
      );
    },
    { membershipRef: MEMBERSHIP_REF },
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: {
          name: "Persona sintética",
          role: "A",
          status: "ACTIVE",
          permissions,
          deniedPermissions,
          membership: {
            membershipRef: MEMBERSHIP_REF,
            tenantName: "Tenant sintético",
            role: "A",
          },
          memberships: [
            {
              membershipRef: MEMBERSHIP_REF,
              tenantName: "Tenant sintético",
              role: "A",
              preferred: true,
            },
          ],
        },
      }),
    }),
  );
}

async function crm(page: Page) {
  const detail = {
    caseRef: CASE_REF,
    caseCode: "CS-2026-1101",
    version: 1,
    status: "SURVEY_SCHEDULED",
    mode: "LOCAL",
    serviceType: "MOVING_LOCAL",
    customerType: "L4_PERSONAL",
    estimatedCbm: 12,
    requiresSurvey: true,
    surveyMethod: "PRESENCIAL",
    originLocation: "Origen estructurado",
    destinationLocation: "Destino estructurado",
    destinationContracted: true,
    assetsCount: 0,
    quoteCount: 0,
    eventCount: 3,
    client: {
      clientRef: "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      displayName: "Cliente relacional",
      type: "INDIVIDUAL",
      status: "ACTIVE",
    },
    owner: { displayName: "Ventas", isCurrentActor: true },
    createdAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
  };
  const byStatus = Object.fromEntries(
    [
      "NEW_INBOX",
      "AWAITING_ICP",
      "GOVERNANCE_CONFIRMED",
      "REQUIREMENTS_CONFIRMED",
      "SURVEY_PLANNING",
      "SURVEY_SCHEDULED",
      "SURVEY_COMPLETED",
      "CRATING_ESTIMATE_PENDING",
      "PRICING_IN_PROGRESS",
      "QUOTE_DRAFT",
      "INTERNAL_REVIEW",
      "QUOTE_SENT",
      "NEGOTIATION",
      "WON",
      "LOST",
      "CHANGE_CONTROL",
      "APPROVED",
      "OPS_HANDOFF",
    ].map((status) => [status, status === "SURVEY_SCHEDULED" ? 1 : 0]),
  );
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: [detail],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
    }),
  );
  await page.route("**/api/crm/pipeline-summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: {
          total: 1,
          assigned: 1,
          unassigned: 0,
          byStatus,
          sla: { overdue: null, basis: "UNAVAILABLE" },
        },
      }),
    }),
  );
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: detail }),
    }),
  );
  await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: {
          caseRef: CASE_REF,
          caseCode: detail.caseCode,
          status: detail.status,
          version: 1,
          mode: "LOCAL",
          serviceType: "MOVING_LOCAL",
          volume: { status: "ESTIMATED", estimatedCbm: 12, source: "ICP" },
          requiresSurvey: true,
          surveyMethod: "PRESENCIAL",
          intakeChannel: "REFERRED",
          clientProfileType: "PERSONAL",
          requirementNotes: null,
          serviceDefinitionStatus: "DEFINED",
          surveyDecisionStatus: "DEFINED",
          ownerName: "Ventas",
          caseContact: {
            displayName: "Contacto sintético",
            phone: "+18095550100",
            email: null,
          },
          client: detail.client,
          route: {
            contractVersion: 2,
            revision: 1,
            destinationStatus: "CONFIRMED",
            origin: {
              countryCode: "DO",
              provinceState: "Distrito Nacional",
              cityMunicipality: "Santo Domingo",
              sector: null,
              streetAndNumber: "Origen sintético",
              buildingResidential: null,
              floorUnit: null,
              arrivalReference: null,
              locationContactName: null,
              locationContactPhone: null,
            },
            destination: {
              countryCode: "DO",
              provinceState: "Distrito Nacional",
              cityMunicipality: "Santo Domingo",
              sector: null,
              streetAndNumber: "Destino sintético",
              buildingResidential: null,
              floorUnit: null,
              arrivalReference: null,
              locationContactName: null,
              locationContactPhone: null,
            },
            additionalStops: [],
          },
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
      }),
    }),
  );
  await page.route("**/api/crm/survey/assignments", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: [] }),
    }),
  );
}

function workspace(communications = 0) {
  return {
    caseRef: CASE_REF,
    caseCode: "CS-2026-1101",
    routeVersion: 1,
    decision: {
      decisionRef: DECISION_REF,
      method: "IN_PERSON",
      state: "SCHEDULED",
      informationSource: "COMMERCIAL",
      rationaleCode: null,
      routeVersion: 1,
      version: 2,
      createdAt: "2026-09-11T12:00:00.000Z",
    },
    assignment: {
      assignmentRef: ASSIGNMENT_REF,
      scheduledStart: "2026-09-14T13:00:00.000Z",
      scheduledEnd: "2026-09-14T16:00:00.000Z",
      evaluator: { displayName: "Evaluadora sintética" },
      slotKey: "MORNING",
      profile: "METRO",
      zoneCode: "METRO_SANTO_DOMINGO",
      status: "ASSIGNED",
      version: 1,
      instruction: "Confirmar acceso",
      routeStale: false,
      surveyRef: null,
    },
    policy: {
      policyRef: "638f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      version: 1,
      timezone: "America/Santo_Domingo",
      profiles: [{ code: "METRO", dailyCapacity: 2 }],
      slots: [
        {
          profile: "METRO",
          key: "MORNING",
          label: "Mañana",
          startTime: "09:00",
          endTime: "12:00",
          capacity: 1,
        },
        {
          profile: "METRO",
          key: "AFTERNOON",
          label: "Tarde",
          startTime: "14:00",
          endTime: "16:30",
          capacity: 1,
        },
      ],
      closedWeekdays: [0],
      closedDates: [],
      saturdayRequiresApproval: true,
    },
    schedulingContext: {
      profile: "METRO",
      zoneType: "METRO",
      zoneCode: "METRO_SANTO_DOMINGO",
      distanceStatus: "KNOWN",
      distanceKm: 15,
    },
    visitLocations: [
      {
        role: "ORIGIN",
        order: 0,
        countryCode: "DO",
        provinceState: "Distrito Nacional",
        cityMunicipality: "Santo Domingo",
        sector: "Piantini",
        streetAndNumber: "Av. Abraham Lincoln 456",
        buildingResidential: "Torre Central",
        floorUnit: "8-B",
        arrivalReference: "Entrada principal",
        compactAddress:
          "Av. Abraham Lincoln 456, Piantini, Santo Domingo, Distrito Nacional, DO",
      },
      {
        role: "DESTINATION",
        order: 0,
        countryCode: "DO",
        provinceState: "Distrito Nacional",
        cityMunicipality: "Santo Domingo",
        sector: "Naco",
        streetAndNumber: "Av. Tiradentes 12",
        buildingResidential: null,
        floorUnit: null,
        arrivalReference: null,
        compactAddress:
          "Av. Tiradentes 12, Naco, Santo Domingo, Distrito Nacional, DO",
      },
    ],
    availability: {
      date: "2026-09-14",
      profile: "METRO",
      dayOccupied: 1,
      dayCapacity: 2,
      closed: false,
      saturdayApprovalRequired: false,
      slots: [
        { key: "MORNING", occupied: 1, capacity: 1, available: false },
        { key: "AFTERNOON", occupied: 0, capacity: 1, available: true },
      ],
    },
    operationalPolicy: null,
    visitReasons: [],
    evaluatorCandidates: [
      {
        membershipRef: MEMBERSHIP_REF,
        profileRef: null,
        displayName: "Evaluadora sintética",
        capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"],
        dailyAssigned: 0,
        dailyLimit: null,
      },
    ],
    visitFee: null,
    communications: communications
      ? [
          {
            communicationRef: "738f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
            templateCode: "PIC_CLIENT_VISIT",
            templateVersion: 1,
            audience: "CLIENT",
            channel: "WHATSAPP",
            status: "PREPARED",
            preparedAt: "2026-09-11T12:30:00.000Z",
          },
        ]
      : [],
    history: [
      {
        eventRef: "838f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
        type: "SCHEDULED",
        reasonCode: null,
        notificationRequired: true,
        createdAt: "2026-09-11T12:15:00.000Z",
      },
    ],
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
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({
          ok: true,
          data: {
            status:
              body.operation === "PREPARE_COMMUNICATION"
                ? "PREPARED"
                : "ASSIGNED",
            version: 2,
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: workspace(communications) }),
    });
  });
  return () => mutations;
}

function readyWorkspace() {
  const value = workspace();
  return {
    ...value,
    decision: { ...value.decision, state: "READY_TO_SCHEDULE", version: 1 },
    assignment: null,
    operationalPolicy: {
      policyRef: "938f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      version: 1,
      timezone: "America/Santo_Domingo",
      defaultVisitMinutes: 45,
      minimumTravelBufferMinutes: 45,
      virtualPreparationMinutes: 15,
      windows: [
        {
          weekday: 1,
          startMinute: 540,
          endMinute: 1020,
          method: "IN_PERSON",
          requiresApproval: false,
          kind: "REGULAR",
          calendarDate: null,
        },
      ],
      canRequestException: true,
      precedence: [
        "EMPLOYEE_OVERRIDE",
        "APPROVED_EXCEPTION",
        "TENANT_POLICY",
        "FAIL_CLOSED",
      ],
    },
    visitReasons: [
      {
        reasonRef: "a38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
        code: "INITIAL",
        name: "Evaluación inicial",
      },
    ],
    availability: {
      ...value.availability,
      date: "2030-09-16",
      dayOccupied: 0,
      slots: value.availability.slots.map((slot) => ({
        ...slot,
        occupied: 0,
        available: true,
      })),
    },
    evaluatorCandidates: [
      {
        membershipRef: MEMBERSHIP_REF,
        profileRef: "b38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
        displayName: "Evaluadora sintética",
        capabilities: ["CAN_PERFORM_IN_PERSON_SURVEY"],
        dailyAssigned: 0,
        dailyLimit: null,
      },
    ],
  };
}

function exactAvailability(url: URL, available = true) {
  const date = url.searchParams.get("date");
  const time = url.searchParams.get("time");
  if (!date || !time) return null;
  const durationMinutes = Number(url.searchParams.get("durationMinutes"));
  const start = new Date(`${date}T${time}:00-04:00`);
  return {
    date,
    time,
    durationMinutes,
    timezone: "America/Santo_Domingo",
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
    slotKey: "AFTERNOON",
    evaluators: available ? [MEMBERSHIP_REF] : [],
    alternatives: available ? [] : [{ time: "15:15", slotKey: "AFTERNOON", evaluatorMembershipRefs: [MEMBERSHIP_REF] }],
    agenda: [{
      evaluatorMembershipRef: MEMBERSHIP_REF,
      scheduledStart: `${date}T13:00:00.000Z`,
      scheduledEnd: `${date}T13:45:00.000Z`,
      label: "Visita fuera de zona metro",
      outsideMetro: true,
      returnedToMetroAt: available ? `${date}T18:15:00.000Z` : null,
    }],
  };
}

async function communicationsApi(page: Page) {
  let prepared = false;
  let mutations = 0;
  const preparations: ReturnType<typeof normalizePrepare>[] = [];
  const recipientRequests: Record<string, unknown>[] = [];
  const requests: Array<{ method: string; pathname: string }> = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/communications/")) {
      requests.push({ method: request.method(), pathname });
    }
  });
  const template = {
    templateRef: TEMPLATE_REF,
    code: "PIC_CLIENT_VISIT",
    name: "PIC cliente · visita presencial",
    category: "SURVEY_PIC",
    state: "PUBLISHED",
    currentVersion: 1,
    current: {
      versionRef: "638f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      version: 1,
      state: "PUBLISHED",
      audiences: ["CLIENT"],
      channels: ["EMAIL"],
      subject: "Visita confirmada",
      bodyText: "Mensaje preparado sin transporte externo.",
      bodyHtml: null,
      variables: { catalogVersion: 1, names: [] },
      contentSha256: "a".repeat(64),
      validFrom: null,
      validTo: null,
      createdAt: "2026-09-11T12:00:00.000Z",
      publishedAt: "2026-09-11T12:00:00.000Z",
    },
    versions: [],
    updatedAt: "2026-09-11T12:00:00.000Z",
  };
  const record = {
    communicationRef: "738f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
    templateRef: TEMPLATE_REF,
    templateCode: "PIC_CLIENT_VISIT",
    templateVersion: 1,
    milestone: "SURVEY_PIC_CLIENT",
    channel: "EMAIL",
    recipientType: "CLIENT",
    recipient: {
      displayName: "Contacto sintético",
      destination: "c***@example.invalid",
    },
    subject: "Visita confirmada",
    bodyText: "Mensaje preparado sin transporte externo.",
    bodyHtml: null,
    status: "PREPARED",
    preparedAt: "2026-09-11T12:30:00.000Z",
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
  };
  await page.route("**/api/communications/templates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: [template] }),
    }),
  );
  await page.route("**/api/communications/records?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: prepared ? [record] : [] }),
    }),
  );
  await page.route("**/api/communications/recipients", (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      caseRef: CASE_REF,
      audience: "CLIENT",
      surveyAssignmentRef: ASSIGNMENT_REF,
      quoteRevisionRef: null,
    });
    recipientRequests.push(body);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: [
          {
            recipientType: "CLIENT",
            recipientRef: CASE_REF,
            displayName: "Contacto sintético",
            email: "c***@example.invalid",
            phone: null,
            availableChannels: ["EMAIL"],
          },
        ],
      }),
    });
  });
  await page.route("**/api/communications/prepare", (route) => {
    expect(route.request().method()).toBe("POST");
    preparations.push(normalizePrepare(route.request().postDataJSON()));
    prepared = true;
    mutations += 1;
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: record }),
    });
  });
  return { mutations: () => mutations, preparations, recipientRequests, requests };
}

async function openSurveyCommunications(page: Page) {
  const survey = page.getByTestId("survey-scheduling-workspace");
  await expect(survey).toBeVisible();
  await survey.getByRole("button", { name: /^Coordinar/ }).click();
  const openCommunications = survey.getByRole("button", {
    name: "Ver comunicaciones de Survey",
    exact: true,
  });
  await expect(openCommunications).toBeVisible();
  await openCommunications.click();
  await expect(page.getByRole("tab", { name: "Survey", exact: true })).toHaveAttribute("aria-selected", "true");
  const activity = page.getByRole("region", { name: "Actividad y Comunicaciones", exact: true });
  await expect(activity).toBeVisible();
  const communications = activity.getByTestId("communications-scheduling");
  await expect(communications).toBeVisible();
  await expect(page.locator('[data-testid^="communications-"]')).toHaveCount(1);
  return communications;
}

test("integra Evaluación, Agenda, Visit Fee, PIC e historial sin reescribir Survey App", async ({
  page,
}, testInfo) => {
  await session(page);
  await crm(page);
  const schedulingMutations = await schedulingApi(page);
  const communicationAudit = await communicationsApi(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey" }).click();
  await expect(page.getByTestId("survey-scheduling-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coordinar Survey", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Coordinar/ }).click();
  await expect(
    page.getByText(
      "Evaluadora sintética · METRO · METRO_SANTO_DOMINGO · MORNING",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Zona metropolitana · visita sin cargo/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resultado", exact: true }).click();
  await expect(page.getByText("Visita programada", { exact: true })).toBeVisible();
  const communications = await openSurveyCommunications(page);
  await expect(
    communications.getByText("Transporte externo desactivado en Preview"),
  ).toBeVisible();
  await communications.getByRole("button", { name: "Preparar" }).click();
  await communications.getByLabel("Plantilla").selectOption(TEMPLATE_REF);
  await communications.getByLabel("Destinatario").selectOption(CASE_REF);
  await communications.getByLabel("Hito").selectOption("SURVEY_PIC_CLIENT");
  await communications
    .getByRole("button", { name: "Guardar como PREPARED" })
    .click();
  const preparedRecord = communications
    .locator("article:visible, tbody tr:visible")
    .filter({ hasText: "SURVEY_PIC_CLIENT" });
  await expect(preparedRecord).toBeVisible();
  expect(schedulingMutations()).toBe(0);
  expect(communicationAudit.mutations()).toBe(1);
  expect(communicationAudit.preparations).toEqual([{
    operation: "COMMUNICATION_PREPARE",
    requestId: expect.any(String),
    payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    templateRef: TEMPLATE_REF,
    version: 1,
    caseRef: CASE_REF,
    surveyAssignmentRef: ASSIGNMENT_REF,
    quoteRevisionRef: null,
    recipientType: "CLIENT",
    recipientRef: CASE_REF,
    channel: "EMAIL",
    milestone: "SURVEY_PIC_CLIENT",
  }]);
  await expect(preparedRecord.getByText("PREPARED")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  if (["chromium-desktop", "chromium-mobile"].includes(testInfo.project.name)) {
    await page.screenshot({
      path: testInfo.outputPath(`evaluation-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
});

test("cerrar las comunicaciones descarta el borrador sin arrastrar destinatario ni hito", async ({ page }) => {
  await session(page);
  await crm(page);
  const schedulingMutations = await schedulingApi(page);
  const communicationAudit = await communicationsApi(page);
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey", exact: true }).click();
  const communications = await openSurveyCommunications(page);
  await communications.getByRole("button", { name: "Preparar", exact: true }).click();
  await communications.getByLabel("Plantilla").selectOption(TEMPLATE_REF);
  await communications.getByLabel("Destinatario").selectOption(CASE_REF);
  await communications.getByLabel("Hito").selectOption("SURVEY_PIC_CLIENT");
  await expect(communications.getByRole("button", { name: "Guardar como PREPARED" })).toBeEnabled();

  await page.getByRole("region", { name: "Actividad y Comunicaciones", exact: true }).getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByTestId("survey-scheduling-workspace")).toBeVisible();
  await expect(page.locator('[data-testid^="communications-"]')).toHaveCount(0);
  const reopenedCommunications = await openSurveyCommunications(page);
  await expect(reopenedCommunications.getByLabel("Plantilla")).toHaveCount(0);
  await reopenedCommunications.getByRole("button", { name: "Preparar", exact: true }).click();
  await expect(reopenedCommunications.getByLabel("Plantilla")).toHaveValue("");
  await expect(reopenedCommunications.getByLabel("Destinatario")).toHaveValue("");
  await expect(reopenedCommunications.getByLabel("Canal")).toHaveValue("");
  await expect(reopenedCommunications.getByLabel("Hito")).toHaveValue("VISIT_CONFIRMATION");
  await expect(reopenedCommunications.getByRole("button", { name: "Guardar como PREPARED" })).toBeDisabled();
  expect(schedulingMutations()).toBe(0);
  expect(communicationAudit.mutations()).toBe(0);
  expect(communicationAudit.preparations).toHaveLength(0);
  expect(communicationAudit.recipientRequests).toHaveLength(1);
});

test("fuera de horario ofrece solicitud excepcional tenant-first", async ({
  page,
}) => {
  await session(page);
  await crm(page);
  await communicationsApi(page);
  let schedulingPosts = 0;
  let exceptionBody: Record<string, unknown> | null = null;
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    if (route.request().method() === "POST") {
      schedulingPosts += 1;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({
          ok: false,
          error: "PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: {
        ...readyWorkspace(), timeAvailability: exactAvailability(new URL(route.request().url())),
      } }),
    });
  });
  await page.route("**/api/personnel/policies", async (route) => {
    exceptionBody = await route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: { status: "PENDING" } }),
    });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey" }).click();
  const editor = page.getByTestId("survey-schedule-editor");
  await editor.getByLabel("Fecha").fill("2030-09-16");
  await editor.getByLabel("Hora de llegada").fill("14:15");
  await editor.getByRole("button", { name: "Confirmar visita" }).click();
  await editor.getByLabel("Motivo para la autorización").fill("Cliente requiere horario extraordinario");
  await editor.getByRole("button", { name: "Solicitar excepción" }).click();
  await expect(page.getByText(
    "Solicitud excepcional registrada",
  )).toBeVisible();
  expect(schedulingPosts).toBe(1);
  expect(exceptionBody).toMatchObject({
    operation: "EXCEPTION_REQUEST",
    caseRef: CASE_REF,
    requesterOrigin: "SALES",
    method: "IN_PERSON",
  });
  expect(exceptionBody).not.toHaveProperty("tenantId");
  expect(exceptionBody).not.toHaveProperty("userId");
});

test("Survey consulta la zona de la dirección que el usuario selecciona", async ({ page }) => {
  await session(page);
  await crm(page);
  const requestedLocations: string[] = [];
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    const url = new URL(route.request().url());
    const location = url.searchParams.get("visitLocation");
    if (location) requestedLocations.push(location);
    const data = readyWorkspace();
    return route.fulfill({
      json: { ok: true, data: {
        ...data,
        visitLocations: data.visitLocations.map((entry) => ({
          ...entry, metroZone: entry.role === "ORIGIN" ? "METRO" : "INTERIOR",
        })),
        schedulingContext: location === "DESTINATION:0" ? null : data.schedulingContext,
      } },
      headers: privateHeaders,
    });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey" }).click();
  const editor = page.getByTestId("survey-schedule-editor");
  await expect(editor.getByText(/^Zona metro(?: · Sin cargo)?$/)).toBeVisible();
  await expect(editor.getByLabel("Fecha")).toBeEnabled();
  requestedLocations.length = 0;
  await editor.getByLabel("Lugar de la visita").selectOption("DESTINATION:0");
  await expect(editor.getByText(/^Fuera de zona metro/)).toBeVisible();
  await expect(editor.getByRole("button", { name: "Confirmar visita" })).toBeDisabled();
  await expect.poll(() => requestedLocations).toEqual(["DESTINATION:0"]);
  await expect(editor.getByLabel("Fecha")).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Editar dirección del caso" })).toBeVisible();
  await editor.getByLabel("Lugar de la visita").selectOption("ORIGIN:0");
  await expect(editor.getByText(/^Zona metro(?: · Sin cargo)?$/)).toBeVisible();
  await expect.poll(() => requestedLocations).toEqual(["DESTINATION:0", "ORIGIN:0"]);
});

test("consulta una hora, ofrece alternativas y confirma la llegada elegida", async ({ page }) => {
  await page.clock.install();
  await session(page, "scheduler");
  await crm(page);
  let command: Record<string, unknown> | undefined;
  let reportedReturn = false;
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      command = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, data: { status: "ASSIGNED" } }, headers: privateHeaders });
    }
    const timeAvailability = exactAvailability(url, reportedReturn || url.searchParams.get("time") !== "14:00");
    return route.fulfill({ json: { ok: true, data: { ...readyWorkspace(), timeAvailability } }, headers: privateHeaders });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey" }).click();
  const editor = page.getByTestId("survey-schedule-editor");
  const arrival = editor.getByLabel("Hora de llegada");
  await expect(editor.locator("input[type=time]")).toHaveCount(1);
  await expect(editor.getByLabel("Duración")).toHaveValue("45");
  await editor.getByLabel("Fecha").fill("2030-09-16");
  await arrival.fill("14:00");
  await expect(editor.getByText("Hora sin disponibilidad")).toBeVisible();
  await expect(editor.getByText(/regreso pendiente/)).toBeVisible();
  await expect(editor.getByLabel("Evaluador disponible")).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Confirmar visita" })).toBeDisabled();
  await editor.getByRole("button", { name: /3:15/ }).click();
  await expect(arrival).toHaveValue("15:15");
  await expect(editor.getByText("Hora disponible")).toBeVisible();
  await expect(editor.getByLabel("Evaluador disponible")).toHaveValue(MEMBERSHIP_REF);
  await expect(editor.getByText(/Regreso registrado/)).toBeVisible();
  await arrival.fill("14:00");
  await expect(editor.getByText(/regreso pendiente/)).toBeVisible();
  reportedReturn = true;
  await page.clock.fastForward(30_000);
  await expect(editor.getByText("Hora disponible")).toBeVisible();
  await expect(editor.getByText(/Regreso registrado/)).toBeVisible();
  await arrival.fill("15:15");
  await editor.getByLabel("Duración").selectOption("60");
  await editor.getByRole("button", { name: "Confirmar visita" }).click();
  await expect.poll(() => command).toMatchObject({
    operation: "SCHEDULE",
    evaluatorMembershipRef: MEMBERSHIP_REF,
    scheduledStart: "2030-09-16T19:15:00.000Z",
    scheduledEnd: "2030-09-16T20:15:00.000Z",
  });
});

test("coordina una visita nueva y guarda solicitud y cita en una sola confirmación", async ({ page }) => {
  await session(page);
  await crm(page);
  const commands: Record<string, unknown>[] = [];
  const fixture = readyWorkspace();
  const appointment = workspace();
  const arrival = "15:15";
  const date = "2030-09-16";
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    if (route.request().method() === "POST") {
      commands.push(route.request().postDataJSON());
      return route.fulfill({
        json: { ok: true, data: { assignmentRef: ASSIGNMENT_REF, status: "ASSIGNED" } },
        headers: privateHeaders,
      });
    }
    const url = new URL(route.request().url());
    const confirmed = commands.some(({ operation }) => operation === "DECIDE_AND_SCHEDULE");
    const proposedMethod = url.searchParams.get("method");
    const timeAvailability = proposedMethod === "IN_PERSON" ? exactAvailability(url) : null;
    return route.fulfill({
      json: { ok: true, data: confirmed ? appointment : { ...fixture, decision: null, timeAvailability } },
      headers: privateHeaders,
    });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey", exact: true }).click();
  const survey = page.getByTestId("survey-scheduling-workspace");
  const steps = survey.getByTestId("survey-workspace-views");
  await expect(steps.getByRole("button", { name: /^Coordinar/ })).toBeVisible();
  await expect(steps.getByRole("button", { name: /^Resultado/ })).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(2);
  const method = survey.getByLabel("Método de Survey");
  await method.selectOption("CLIENT_PHOTOS_DOCUMENTS");
  await expect(survey.getByLabel("Hora de llegada")).toHaveCount(0);
  await method.selectOption("IN_PERSON");
  await survey.getByLabel("Fecha").fill(date);
  await survey.getByLabel("Hora de llegada").fill(arrival);
  await expect(survey.getByLabel("Duración")).toHaveValue("45");
  await expect(survey.getByLabel("Evaluador disponible")).toHaveValue(MEMBERSHIP_REF);
  expect(commands).toHaveLength(0);
  await survey.getByRole("button", { name: "Confirmar visita" }).click();
  await expect.poll(() => commands).toEqual([expect.objectContaining({
    operation: "DECIDE_AND_SCHEDULE",
    caseRef: CASE_REF,
    expectedVersion: null,
    expectedCoordinationRef: null,
    method: "IN_PERSON",
    slotKey: "AFTERNOON",
    evaluatorMembershipRef: MEMBERSHIP_REF,
    scheduledStart: "2030-09-16T19:15:00.000Z",
    scheduledEnd: "2030-09-16T20:00:00.000Z",
  })]);
  await expect(steps.getByRole("button", { name: /^Resultado/ })).toBeEnabled();
});

test("prepara la solicitud de información desde Coordinar", async ({ page }) => {
  await session(page);
  await crm(page);
  const communicationAudit = await communicationsApi(page);
  const fixture = readyWorkspace();
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    const command = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (command) commands.push(command);
    const decision = commands.length ? {
      ...fixture.decision,
      method: "CLIENT_PHOTOS_DOCUMENTS",
      state: "WAITING_CLIENT_INFO",
    } : null;
    return route.fulfill({ json: { ok: true, data: { ...fixture, decision } }, headers: privateHeaders });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey", exact: true }).click();
  const survey = page.getByTestId("survey-scheduling-workspace");
  await survey.getByLabel("Método de Survey").selectOption("CLIENT_PHOTOS_DOCUMENTS");
  await survey.getByLabel("Información recibida o por pedir").fill("Pedir fotos del mobiliario");
  await survey.getByRole("button", { name: "Solicitar información", exact: true }).click();
  const communications = page.getByTestId("communications-case");
  await expect(communications.getByLabel("Plantilla")).toBeVisible();
  await expect(communications.getByLabel("Hito")).toHaveValue("CLIENT_INFORMATION_REQUEST");
  expect(commands).toEqual([expect.objectContaining({
    operation: "DECIDE_METHOD",
    method: "CLIENT_PHOTOS_DOCUMENTS",
    commercialState: "WAITING_CLIENT_INFO",
    coordinationDraft: expect.objectContaining({ instruction: "Pedir fotos del mobiliario" }),
  })]);
  expect(communicationAudit.mutations()).toBe(0);
});

test("retoma una visita pendiente con los datos que guardó", async ({ page }) => {
  await session(page);
  await crm(page);
  const fixture = readyWorkspace();
  const commands: Record<string, unknown>[] = [];
  let coordinationDraft: Record<string, unknown> | null = null;
  await page.route("**/api/crm/survey/scheduling**", async (route) => {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (command.operation === "DECIDE_METHOD") coordinationDraft = command.coordinationDraft;
      return route.fulfill({
        json: { ok: true, data: { decisionRef: DECISION_REF, coordinationRef: COORDINATION_REF, version: 1, state: "READY_TO_SCHEDULE" } },
        headers: privateHeaders,
      });
    }
    return route.fulfill({
      json: {
        ok: true,
        data: { ...fixture, decision: coordinationDraft ? fixture.decision : null, coordinationRef: coordinationDraft ? COORDINATION_REF : null, coordinationDraft },
      },
      headers: privateHeaders,
    });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey", exact: true }).click();
  const survey = page.getByTestId("survey-scheduling-workspace");
  await survey.getByLabel("Método de Survey").selectOption("IN_PERSON");
  await survey.getByLabel("Lugar de la visita").selectOption("DESTINATION:0");
  await survey.getByLabel("Fecha").fill("2030-09-16");
  await survey.getByLabel("Duración").selectOption("60");
  await survey.getByLabel("Notas para el evaluador").fill("Llamar al llegar");
  await survey.getByRole("button", { name: "Guardar pendiente", exact: true }).click();
  await expect.poll(() => commands).toEqual([expect.objectContaining({
    operation: "DECIDE_METHOD",
    caseRef: CASE_REF,
    expectedCoordinationRef: null,
    method: "IN_PERSON",
    commercialState: "READY_TO_SCHEDULE",
    coordinationDraft: expect.objectContaining({
      visitLocation: "DESTINATION:0",
      date: "2030-09-16",
      time: null,
      durationMinutes: 60,
      instruction: "Llamar al llegar",
    }),
  })]);
  await page.reload();
  await page.getByRole("tab", { name: "Survey", exact: true }).click();
  await expect(survey.getByLabel("Lugar de la visita")).toHaveValue("DESTINATION:0");
  await expect(survey.getByLabel("Fecha")).toHaveValue("2030-09-16");
  await expect(survey.getByLabel("Hora de llegada")).toHaveValue("");
  await expect(survey.getByLabel("Duración")).toHaveValue("60");
  await expect(survey.getByLabel("Notas para el evaluador")).toHaveValue("Llamar al llegar");
  await expect(survey.getByRole("button", { name: "Confirmar visita" })).toBeDisabled();
});

test("viewer consulta agenda y comunicaciones sin controles de gestión", async ({
  page,
}) => {
  await session(page, "viewer");
  await crm(page);
  const schedulingMutations = await schedulingApi(page);
  const communicationAudit = await communicationsApi(page);
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Survey" }).click();
  await expect(page.getByTestId("survey-scheduling-workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprogramar" })).toHaveCount(
    0,
  );
  const communications = await openSurveyCommunications(page);
  await expect(
    communications.getByRole("button", { name: "Preparar" }),
  ).toHaveCount(0);
  await expect(
    communications
      .locator("p:visible, td:visible")
      .filter({ hasText: "Sin comunicaciones canónicas registradas." }),
  ).toBeVisible();
  expect(schedulingMutations()).toBe(0);
  expect(communicationAudit.mutations()).toBe(0);
  expect(communicationAudit.preparations).toHaveLength(0);
  expect(communicationAudit.recipientRequests).toHaveLength(0);
  expect(communicationAudit.requests.some(({ pathname }) => pathname === "/api/communications/records")).toBe(true);
  expect(communicationAudit.requests.every(({ method }) => method === "GET")).toBe(true);
});

test("deny prevalece y evita chunk y request de Scheduling", async ({
  page,
}) => {
  await session(page, "deny");
  await crm(page);
  await communicationsApi(page);
  let schedulingRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/crm/survey/scheduling")
      schedulingRequests += 1;
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await expect(page.getByRole("tab", { name: "Survey" })).toHaveCount(0);
  expect(schedulingRequests).toBe(0);
  const chunks = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("SurveyCasePanel")),
  );
  expect(chunks).toHaveLength(0);
});
