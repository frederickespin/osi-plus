import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const MEMBERSHIP_REF = "11111111-1111-4111-8111-111111111111";
const PROFILE_REF = "22222222-2222-4222-8222-222222222222";
const CAPABILITY_REF = "33333333-3333-4333-8333-333333333333";
const REASON_REF = "44444444-4444-4444-8444-444444444444";
const EXCEPTION_REF = "55555555-5555-4555-8555-555555555555";
const CASE_REF = "66666666-6666-4666-8666-666666666666";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Origin",
};
const permissions = [
  "personnel:profiles:view",
  "personnel:profiles:manage",
  "personnel:capabilities:view",
  "personnel:capabilities:manage",
  "scheduling:policies:view",
  "scheduling:policies:manage",
  "scheduling:exceptions:request",
  "scheduling:exceptions:approve",
  "scheduling:exceptions:respond",
];
const workspace = {
  personnel: [
    {
      profileRef: PROFILE_REF,
      displayName: "Evaluadora sintética",
      jobTitle: "Evaluadora",
      employmentStatus: "ACTIVE",
      availabilityStatus: "AVAILABLE",
      restrictions: { noHeavyEquipment: true },
      notes: "Disponibilidad coordinada",
      validFrom: "2026-09-14T00:00:00.000Z",
      validTo: null,
      capabilities: [
        {
          assignmentRef: "77777777-7777-4777-8777-777777777777",
          capabilityRef: CAPABILITY_REF,
          code: "CAN_PERFORM_IN_PERSON_SURVEY",
          name: "Visita presencial",
        },
      ],
      zones: [],
      overrides: [],
    },
  ],
  capabilities: [
    {
      capabilityRef: CAPABILITY_REF,
      code: "CAN_PERFORM_IN_PERSON_SURVEY",
      name: "Visita presencial",
      description: "Autoridad operacional",
      status: "ACTIVE",
      version: 1,
    },
  ],
  activePolicy: {
    policyRef: "88888888-8888-4888-8888-888888888888",
    seriesRef: "99999999-9999-4999-8999-999999999999",
    version: 1,
    state: "ACTIVE",
    timezone: "America/Santo_Domingo",
    defaultVisitMinutes: 120,
    minimumTravelBufferMinutes: 45,
    virtualPreparationMinutes: 15,
    validFrom: "2026-09-14T00:00:00.000Z",
    validTo: null,
    windows: [
      {
        windowRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        weekday: 1,
        startMinute: 480,
        endMinute: 1020,
        capacity: 4,
        method: "IN_PERSON",
        calendarDate: null,
        zone: null,
        requiresApproval: false,
        kind: "REGULAR",
      },
    ],
  },
  reasons: [
    {
      reasonRef: REASON_REF,
      code: "INITIAL",
      name: "Evaluación inicial",
      kind: "VISIT",
      requesterOrigin: null,
      visibleToClient: true,
      visibleToEvaluator: true,
    },
  ],
  exceptions: [
    {
      requestRef: EXCEPTION_REF,
      caseRef: CASE_REF,
      caseCode: "CS-SYNTHETIC-001",
      evaluator: {
        profileRef: PROFILE_REF,
        displayName: "Evaluadora sintética",
      },
      reason: {
        reasonRef: REASON_REF,
        code: "INITIAL",
        name: "Evaluación inicial",
      },
      method: "IN_PERSON",
      requestedStart: "2030-09-15T23:00:00.000Z",
      requestedEnd: "2030-09-16T01:00:00.000Z",
      requesterOrigin: "CLIENT",
      reasonDescription: "Fuera de horario",
      requiredResources: [],
      impact: { resourceStatus: "AVAILABLE" },
      violatedRules: ["OUTSIDE_TENANT_POLICY"],
      status: "PENDING",
      evaluatorResponse: "ACCEPTED",
      adminDecision: "PENDING",
      alternativeStart: null,
      alternativeEnd: null,
      version: 2,
      expiresAt: "2030-09-15T23:00:00.000Z",
    },
  ],
  zones: [],
  precedence: [
    "EMPLOYEE_OVERRIDE",
    "APPROVED_EXCEPTION",
    "TENANT_POLICY",
    "FAIL_CLOSED",
  ],
  generatedAt: "2026-09-14T00:00:00.000Z",
};
async function session(
  page: Page,
  mode: "admin" | "evaluator" | "deny" = "admin",
) {
  await page.addInitScript(
    ({ ref, sessionMode }) => {
      localStorage.setItem("osi-plus.token", "synthetic.personnel.token");
      localStorage.setItem(
        "osi-plus.session",
        JSON.stringify({
          name:
            sessionMode === "evaluator"
              ? "Evaluadora sintética"
              : "Administradora sintética",
          role: sessionMode === "evaluator" ? "V" : "A",
          membershipRef: ref,
          memberships: [
            {
              membershipRef: ref,
              tenantName: "Tenant sintético",
              role: sessionMode === "evaluator" ? "V" : "A",
              preferred: true,
            },
          ],
        }),
      );
    },
    { ref: MEMBERSHIP_REF, sessionMode: mode },
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        user: {
          name:
            mode === "evaluator"
              ? "Evaluadora sintética"
              : "Administradora sintética",
          role: mode === "evaluator" ? "V" : "A",
          status: "ACTIVE",
          permissions:
            mode === "evaluator"
              ? ["scheduling:exceptions:respond"]
              : permissions,
          deniedPermissions: mode === "deny" ? permissions : [],
          membership: {
            membershipRef: MEMBERSHIP_REF,
            tenantName: "Tenant sintético",
            role: mode === "evaluator" ? "V" : "A",
          },
          memberships: [
            {
              membershipRef: MEMBERSHIP_REF,
              tenantName: "Tenant sintético",
              role: mode === "evaluator" ? "V" : "A",
              preferred: true,
            },
          ],
        },
      }),
    }),
  );
}
test("Administración compacta publica personal, horarios, excepciones y política", async ({
  page,
}, testInfo) => {
  await session(page);
  let reads = 0;
  let writes = 0;
  await page.route("**/api/personnel/policies", async (route) => {
    if (route.request().method() === "POST") {
      writes += 1;
      const body = await route.request().postDataJSON();
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("userId");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({ ok: true, data: { replayed: false } }),
      });
    }
    reads += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: workspace }),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/administration");
  await expect(
    page.getByRole("heading", { name: "Personal y Políticas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evaluadora sintética" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Horarios" }).click();
  await expect(page.getByText("Lun · 08:00–17:00")).toBeVisible();
  await expect(
    page.getByText(
      "EMPLOYEE_OVERRIDE → APPROVED_EXCEPTION → TENANT_POLICY → FAIL_CLOSED",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Políticas de visitas" }).click();
  await page.getByRole("button", { name: "Añadir ventana" }).click();
  await page.getByLabel("Tipo de ventana 2").selectOption("SPECIAL_OPENING");
  await page.getByLabel("Fecha especial 2").fill("2030-09-14");
  await expect(page.getByLabel("Método de ventana 2")).toBeVisible();
  await page.getByRole("button", { name: "Excepciones" }).click();
  await expect(
    page.getByText("CS-SYNTHETIC-001 · Evaluación inicial"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aprobar excepción" }).click();
  await expect.poll(() => writes).toBe(1);
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  if (
    testInfo.project.name === "chromium-desktop" ||
    testInfo.project.name === "chromium-mobile"
  ) {
    const path = resolve(
      process.cwd(),
      ".artifacts",
      "v17-personnel-operational-policies-14a",
    );
    mkdirSync(path, { recursive: true });
    await page.screenshot({
      path: resolve(path, `${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
});
test("evaluador responde su excepción mediante autoridad explícita", async ({
  page,
}) => {
  await session(page, "evaluator");
  let operation = "";
  await page.route("**/api/personnel/policies", async (route) => {
    if (route.request().method() === "POST") {
      const body = await route.request().postDataJSON();
      operation = body.operation;
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("userId");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({ ok: true, data: { replayed: false } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: {
          ...workspace,
          personnel: [],
          capabilities: [],
          activePolicy: null,
          reasons: [],
          zones: [],
          exceptions: [
            {
              ...workspace.exceptions[0],
              evaluatorResponse: "PENDING",
              version: 1,
            },
          ],
        },
      }),
    });
  });
  await page.goto("/administration");
  await page.getByRole("button", { name: "Excepciones" }).click();
  await page.getByRole("button", { name: "Aceptar disponibilidad" }).click();
  await expect.poll(() => operation).toBe("EXCEPTION_RESPOND");
  await expect(
    page.getByRole("button", { name: "Aprobar excepción" }),
  ).toHaveCount(0);
});
test("deny bloquea antes del chunk y de la API", async ({ page }) => {
  await session(page, "deny");
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/personnel"))
      requests += 1;
  });
  await page.goto("/administration?personnel=LOCAL_ONLY#policies");
  await expect(
    page.getByRole("heading", { name: "No puedes abrir esta aplicación" }),
  ).toBeVisible();
  expect(requests).toBe(0);
  const chunks = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /PersonnelPoliciesAdmin/.test(name)),
  );
  expect(chunks).toHaveLength(0);
});
