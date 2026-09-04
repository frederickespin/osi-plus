import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP_REF = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ASSIGNMENT_REF = "148f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const SURVEY_REF = "248f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CASE_REF = "348f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CATALOG_REF = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ARTICLE_REF = "548f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const AREA_REF = "648f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const SERVICE_REF = "748f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Origin",
};
const assignment = {
  assignmentRef: ASSIGNMENT_REF,
  caseRef: CASE_REF,
  caseCode: "SUR-2026-0001",
  clientDisplayName: "Cliente relacional",
  evaluator: { displayName: "Evaluador sintético" },
  scheduledStart: "2026-09-06T13:00:00.000Z",
  scheduledEnd: "2026-09-06T15:00:00.000Z",
  status: "ASSIGNED",
  arrivalAt: null as string | null,
  punctualityConfirmedAt: null as string | null,
  context: {
    origin: "Origen estructurado",
    destination: "Destino estructurado",
    services: [{ name: "Mudanza local" }],
  },
  instruction: "Confirmar acceso",
  version: 1,
  surveyRef: null as string | null,
};
const catalog = {
  catalogRef: CATALOG_REF,
  version: 1,
  articles: [
    {
      articleRef: ARTICLE_REF,
      code: "SOFA_3",
      name: "Sofá tres plazas",
      aliases: ["sofá"],
      frequentAreaRefs: [AREA_REF],
      defaultVolumeM3: 1.2,
      defaultWeightKg: 60,
    },
  ],
  areas: [{ areaRef: AREA_REF, code: "SALA", name: "Sala" }],
  conditions: [
    {
      conditionRef: "848f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      code: "STAIRS",
      name: "Escaleras",
      kind: "INCONVENIENCE",
    },
  ],
};
let draft = {
  surveyRef: SURVEY_REF,
  assignmentRef: ASSIGNMENT_REF,
  caseRef: CASE_REF,
  caseCode: "SUR-2026-0001",
  clientDisplayName: "Cliente relacional",
  status: "IN_PROGRESS",
  revision: 1,
  version: 1,
  routeVersion: 1,
  serviceSelectionRef: SERVICE_REF,
  catalog,
  items: [] as Record<string, unknown>[],
  access: [] as Record<string, unknown>[],
  totals: { quantity: 0, volumeM3: 0, weightKg: 0 },
  notes: null,
  updatedAt: "2026-09-05T12:00:00.000Z",
};

async function session(page: Page, denied = false) {
  const permissions = denied
    ? ["pipeline:view"]
    : [
        "survey:assignment:view",
        "survey:perform",
        "survey:publish",
        "survey:read",
      ];
  const deniedPermissions = denied ? ["survey:assignment:view"] : [];
  await page.addInitScript(
    ({ membershipRef }) => {
      localStorage.setItem("osi-plus.token", "synthetic.survey.token");
      localStorage.setItem(
        "osi-plus.session",
        JSON.stringify({
          name: "Evaluador sintético",
          role: "E",
          membershipRef,
          memberships: [
            {
              membershipRef,
              tenantName: "Tenant sintético",
              role: "E",
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
          name: "Evaluador sintético",
          role: "E",
          status: "ACTIVE",
          permissions,
          deniedPermissions,
          membership: {
            membershipRef: MEMBERSHIP_REF,
            tenantName: "Tenant sintético",
            role: "E",
          },
          memberships: [
            {
              membershipRef: MEMBERSHIP_REF,
              tenantName: "Tenant sintético",
              role: "E",
              preferred: true,
            },
          ],
        },
      }),
    }),
  );
}
async function surveyApi(page: Page) {
  Object.assign(assignment, {
    status: "ASSIGNED",
    arrivalAt: null,
    punctualityConfirmedAt: null,
    version: 1,
    surveyRef: null,
  });
  draft = {
    ...draft,
    version: 1,
    status: "IN_PROGRESS",
    items: [],
    access: [],
    totals: { quantity: 0, volumeM3: 0, weightKg: 0 },
  };
  let mutations = 0;
  await page.route("**/api/crm/survey/assignments", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: [assignment] }),
    }),
  );
  await page.route(
    `**/api/crm/survey/assignments/${ASSIGNMENT_REF}`,
    async (route) => {
      const body = route.request().postDataJSON();
      if (body.operation === "ARRIVAL_RECORD") {
        assignment.arrivalAt = "2026-09-06T13:00:00.000Z";
        assignment.status = "ARRIVED";
        assignment.version = 2;
      }
      if (body.operation === "PUNCTUALITY_CONFIRM") {
        assignment.punctualityConfirmedAt = "2026-09-06T13:00:01.000Z";
        assignment.version = 3;
      }
      if (body.operation === "START_SURVEY") {
        assignment.status = "IN_PROGRESS";
        assignment.surveyRef = SURVEY_REF;
        assignment.version = 4;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({
          ok: true,
          data: {
            assignmentRef: ASSIGNMENT_REF,
            surveyRef:
              body.operation === "START_SURVEY" ? SURVEY_REF : undefined,
            version: assignment.version,
            arrivalAt: assignment.arrivalAt,
            punctualityConfirmedAt: assignment.punctualityConfirmedAt,
          },
        }),
      });
    },
  );
  await page.route(`**/api/crm/survey/drafts/${SURVEY_REF}`, async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({ ok: true, data: draft }),
      });
    mutations += 1;
    const body = route.request().postDataJSON();
    draft = {
      ...draft,
      version: draft.version + 1,
      status:
        body.operation === "MARK_READY" ? "READY_FOR_REVIEW" : draft.status,
    };
    if (body.operation === "UPSERT_ITEM")
      draft = {
        ...draft,
        items: [
          {
            itemRef: "948f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
            article: catalog.articles[0],
            area: catalog.areas[0],
            shipmentMode: body.shipmentMode,
            quantity: body.quantity,
            condition: body.condition,
            flags: body.flags,
            dimensions: body.dimensions,
            normalizedCm: null,
            unitVolumeM3: 1.2,
            unitWeightKg: 60,
            volumeSource: "CATALOG",
            weightSource: "CATALOG",
            note: null,
            version: body.itemRef ? Number(draft.items[0]?.version || 0) + 1 : 1,
            photos: [],
          },
        ],
        totals: {
          quantity: body.quantity,
          volumeM3: body.quantity * 1.2,
          weightKg: body.quantity * 60,
        },
      };
    if (body.operation === "DELETE_ITEM")
      draft = {
        ...draft,
        items: [],
        totals: { quantity: 0, volumeM3: 0, weightKg: 0 },
      };
    if (body.operation === "SAVE_ACCESS")
      draft = {
        ...draft,
        access: [
          ...draft.access.filter((entry) => entry.side !== body.side),
          {
            accessRef:
              body.side === "ORIGIN"
                ? "a48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"
                : "b48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
            side: body.side,
            floorNumber: body.floorNumber,
            stairsFloors: body.stairsFloors,
            elevatorAvailable: body.elevatorAvailable,
            elevatorFloor: body.elevatorFloor,
            parkingDistanceM: body.parkingDistanceM,
            flags: body.flags,
            notes: body.notes,
            version: 1,
            photos: [],
          },
        ],
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: {
          surveyRef: SURVEY_REF,
          version: draft.version,
          status: draft.status,
        },
      }),
    });
  });
  await page.route(
    `**/api/crm/survey/drafts/${SURVEY_REF}/photos`,
    async (route) => {
      draft = {
        ...draft,
        version: draft.version + 1,
        items: draft.items.map((item) => ({
          ...item,
          photos: [
            {
              photoRef: "d48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
              purpose: "DAMAGE",
              mimeType: route.request().headers()["content-type"],
            },
          ],
        })),
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: privateHeaders,
        body: JSON.stringify({
          ok: true,
          data: {
            photoRef: "d48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
            purpose: "DAMAGE",
          },
        }),
      });
    },
  );
  await page.route(`**/api/crm/survey/drafts/${SURVEY_REF}/publish`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify({
        ok: true,
        data: {
          publicationRef: "c48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
          pdfSha256: "a".repeat(64),
        },
      }),
    }),
  );
  await page.route(
    "**/api/crm/survey/publications/c48f6d8f-8d11-4f39-8a2d-1b6c7e8f9012/pdf",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          ...privateHeaders,
          "Content-Disposition": 'attachment; filename="survey-publicado.pdf"',
        },
        body: Buffer.from("%PDF-1.4\n%%EOF"),
      }),
  );
  return () => mutations;
}

test("agenda, inventario, accesos, revisión y firma conservan el flujo móvil aprobado", async ({
  page,
}) => {
  await session(page);
  const mutationCount = await surveyApi(page);
  await page.goto("/survey");
  await expect(
    page.getByRole("heading", { name: "Agenda de visitas" }),
  ).toBeVisible();
  await expect(page.getByText("Origen estructurado")).toBeVisible();
  await page.getByRole("button", { name: "Llegué", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Llegué a la hora acordada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Llegué a la hora acordada" }).click();
  await page.getByRole("button", { name: "Iniciar Survey" }).click();
  await expect(page.getByLabel("Buscar artículo")).toBeFocused();
  await page.getByLabel("Buscar artículo").fill("sofá");
  await page.getByRole("button", { name: /Sofá tres plazas/ }).click();
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByLabel("Condición").selectOption("PRE_EXISTING_DAMAGE");
  await page.getByLabel("Unidad").selectOption("IN");
  await page.getByLabel("Largo").fill("80");
  await page.getByLabel("Ancho").fill("36");
  await page.getByLabel("Alto").fill("34");
  await page.getByText("Frágil", { exact: true }).click();
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByText("2 × Sofá tres plazas")).toBeVisible();
  expect(mutationCount()).toBe(1);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "damage.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic-image"),
  });
  await expect(page.getByText("1 evidencia(s)")).toBeVisible();
  await page.getByRole("button", { name: /2 × Sofá tres plazas/ }).click();
  await page.getByLabel("Cantidad", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("3 × Sofá tres plazas")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar Sofá tres plazas" }).click();
  await expect(page.getByText("Agrega el primer artículo")).toBeVisible();
  await page.getByLabel("Buscar artículo").fill("sofá");
  await page.getByRole("button", { name: /Sofá tres plazas/ }).click();
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByText("2 × Sofá tres plazas")).toBeVisible();
  expect(mutationCount()).toBe(4);
  await page.getByRole("button", { name: "Accesos" }).click();
  await page.getByLabel("Piso", { exact: true }).fill("3");
  await page.getByText("Escaleras", { exact: true }).click();
  await page.getByRole("button", { name: "Guardar acceso" }).click();
  await page.getByRole("button", { name: "Destino" }).click();
  await page.getByLabel("Piso", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Guardar acceso" }).click();
  await page.getByRole("button", { name: "Revisión" }).click();
  await expect(page.getByText("Vista previa A4")).toBeVisible();
  await expect(page.getByText("Materiales derivados:")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar revisión" }).click();
  await page.getByLabel("Nombre del firmante").fill("Firmante Sintético");
  await page.getByLabel("Relación con el cliente").fill("Representante");
  const canvas = page.getByLabel("Firma dibujada");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("signature canvas unavailable");
  await page.mouse.move(box.x + 20, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30);
  await page.mouse.move(box.x + 240, box.y + 100);
  await page.mouse.up();
  await page.getByRole("button", { name: "Firmar y publicar" }).click();
  await expect(
    page.getByRole("heading", { name: "Survey publicado" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  await expect((await download).suggestedFilename()).toBe(
    "survey-publicado.pdf",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("deny se resuelve en el shell sin chunk Survey ni solicitudes CRM", async ({
  page,
}) => {
  await session(page, true);
  let surveyRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/crm/survey"))
      surveyRequests += 1;
  });
  await page.goto("/survey");
  await expect(page.getByTestId("hub-forbidden")).toContainText(
    "403 · Acceso no autorizado",
  );
  await expect(
    page.getByRole("heading", { name: "Agenda de visitas" }),
  ).toHaveCount(0);
  expect(surveyRequests).toBe(0);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(resources.some((name) => /SurveyApp-/.test(name))).toBe(false);
});
