import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const CATALOG_URL = "/api/crm/survey/catalog";
const MEMBERSHIP_REF = "22222222-2222-4222-8222-222222222222";
const CATALOG_PERMISSION = "survey:assignment:manage";
const EXCEL_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const AREA = { areaRef: "33333333-3333-4333-8333-333333333333", code: "SALA", name: "Sala" };
const CONDITION = {
  conditionRef: "44444444-4444-4444-8444-444444444444", code: "ASCENSOR", name: "Ascensor", kind: "FACILITY",
};
const ARTICLE = {
  articleRef: "55555555-5555-4555-8555-555555555555", code: "LAMPARA", name: "Lámpara auxiliar",
  aliases: ["Lámpara de pie"], frequentAreaRefs: [AREA.areaRef], defaultVolumeM3: 0.35, defaultWeightKg: 8,
};
const OTHER_ARTICLE = {
  articleRef: "66666666-6666-4666-8666-666666666666", code: "CAJONERA", name: "Cajonera",
  aliases: ["Gavetero"], frequentAreaRefs: [AREA.areaRef], defaultVolumeM3: 0.62, defaultWeightKg: 14,
};
const INITIAL_CATALOG = {
  catalogRef: "77777777-7777-4777-8777-777777777777", version: 3,
  articles: [ARTICLE, OTHER_ARTICLE], areas: [AREA], conditions: [CONDITION],
};

type PublishCommand = {
  requestId: string;
  payloadHash: string;
  expectedLatestVersion: number;
  articles: {
    code: string;
    name: string;
    aliases: string[];
    frequentAreaCodes: string[];
    defaultVolumeM3: number | null;
    defaultWeightKg: number | null;
  }[];
  areas: { code: string; name: string }[];
  conditions: { code: string; name: string; kind: string }[];
};

type Worksheet = Record<string, unknown>;
type Workbook = { SheetNames: string[]; Sheets: Record<string, Worksheet> };
type ExcelTestApi = {
  read(data: Uint8Array, options: { type: "array" }): Workbook;
  write(workbook: Workbook, options: { type: "array"; bookType: "xlsx" }): ArrayBuffer;
  utils: {
    book_new(): Workbook;
    book_append_sheet(workbook: Workbook, sheet: Worksheet, name: string): void;
    aoa_to_sheet(rows: readonly (readonly (string | number)[])[]): Worksheet;
    sheet_add_aoa(sheet: Worksheet, rows: readonly (readonly (string | number)[])[], options: { origin: string }): void;
    sheet_to_json(sheet: Worksheet, options: { header: 1; blankrows: false }): unknown[][];
  };
};

async function excelTestApi(): Promise<ExcelTestApi> {
  const source = await readFile(resolve("src/internal-tools/archaeological-packing/vendor/xlsx.full.min.js"), "utf8");
  return runInNewContext(`${source}\nXLSX`) as ExcelTestApi;
}

async function installSession(page: Page, permissions: string[], deniedPermissions: string[] = []) {
  const membership = { membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A", preferred: true };
  await page.addInitScript((member) => {
    localStorage.setItem("osi-plus.token", "synthetic.article-catalog.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administradora sintética", ...member, memberships: [member] }));
  }, membership);
  const unexpected: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { ok: true, user: {
      name: "Administradora sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership, memberships: [membership],
    } } });
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { ok: false, error: "UNEXPECTED_TEST_REQUEST" } });
  });
  return unexpected;
}

async function mockCatalogPublication(page: Page) {
  const commands: PublishCommand[] = [];
  let catalog = INITIAL_CATALOG;
  await page.route(`**${CATALOG_URL}`, async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer synthetic.article-catalog.token");
    if (request.method() === "GET") return route.fulfill({ json: { ok: true, data: catalog } });
    expect(request.method()).toBe("POST");
    const command = request.postDataJSON() as PublishCommand;
    commands.push(command);
    catalog = {
      ...catalog,
      catalogRef: "88888888-8888-4888-8888-888888888888",
      version: catalog.version + 1,
      articles: command.articles.map(({ frequentAreaCodes, ...article }) => ({
        ...article,
        articleRef: catalog.articles.find(({ code }) => code === article.code)?.articleRef ?? "99999999-9999-4999-8999-999999999999",
        frequentAreaRefs: catalog.areas.filter(({ code }) => frequentAreaCodes.includes(code)).map(({ areaRef }) => areaRef),
      })),
    };
    return route.fulfill({ status: 201, json: { ok: true, data: { catalogRef: catalog.catalogRef, version: catalog.version, replayed: false } } });
  });
  return commands;
}

test("busca artículos por sinónimo y publica una revisión explícita del catálogo", async ({ page }) => {
  const unexpected = await installSession(page, [CATALOG_PERMISSION]);
  const commands = await mockCatalogPublication(page);

  await page.goto("/administration/articles");
  const editor = page.getByTestId("article-catalog-admin");
  await expect(editor.getByRole("heading", { name: "Catálogo de artículos", exact: true })).toBeVisible();
  await expect(editor.getByRole("row", { name: /Lámpara auxiliar/ })).toBeVisible();
  await expect(editor.getByRole("columnheader", { name: /peso|módulo|mini/i })).toHaveCount(0);
  const search = editor.getByLabel("Buscar artículo");
  await search.fill("Lámpara de pie");
  await expect(editor.getByRole("row", { name: /Lámpara auxiliar/ })).toBeVisible();
  await expect(editor.getByRole("row", { name: /Cajonera/ })).toHaveCount(0);
  await search.fill("");

  await editor.getByRole("button", { name: "Editar artículo Lámpara auxiliar", exact: true }).click();
  await editor.getByLabel("Nombre del artículo", { exact: true }).fill("Lámpara de sala");
  await editor.getByRole("button", { name: "Guardar en borrador", exact: true }).click();
  await expect(editor.getByRole("row", { name: /Lámpara de sala/ })).toBeVisible();

  await editor.getByRole("button", { name: "Nuevo artículo", exact: true }).click();
  await expect(editor.getByLabel(/peso/i)).toHaveCount(0);
  await expect(editor.getByRole("combobox", { name: /módulo|inventario|mini/i })).toHaveCount(0);
  await editor.getByLabel("Nombre del artículo", { exact: true }).fill("Sofá de dos plazas");
  await editor.getByLabel("Sinónimos", { exact: true }).fill("Sillón doble");
  await editor.getByLabel("Volumen de referencia (m³)", { exact: true }).fill("1.25");
  await editor.getByRole("button", { name: "Guardar en borrador", exact: true }).click();
  await expect(editor.getByRole("row", { name: /Sofá de dos plazas/ })).toBeVisible();
  expect(commands).toHaveLength(0);

  await editor.getByRole("button", { name: "Publicar catálogo", exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(editor.getByText("Versión 4 publicada.", { exact: true })).toBeVisible();
  const [command] = commands;
  expect(command).toEqual({
    requestId: expect.any(String),
    payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    expectedLatestVersion: 3,
    articles: expect.arrayContaining([
      { code: ARTICLE.code, name: "Lámpara de sala", aliases: ARTICLE.aliases, frequentAreaCodes: [AREA.code], defaultVolumeM3: 0.35, defaultWeightKg: null },
      { code: OTHER_ARTICLE.code, name: OTHER_ARTICLE.name, aliases: OTHER_ARTICLE.aliases, frequentAreaCodes: [AREA.code], defaultVolumeM3: 0.62, defaultWeightKg: null },
      { code: expect.stringMatching(/^[A-Z][A-Z0-9_]{1,63}$/u), name: "Sofá de dos plazas", aliases: ["Sillón doble"], frequentAreaCodes: [], defaultVolumeM3: 1.25, defaultWeightKg: null },
    ]),
    areas: [{ code: AREA.code, name: AREA.name }],
    conditions: [{ code: CONDITION.code, name: CONDITION.name, kind: CONDITION.kind }],
  });
  expect(command.articles).toHaveLength(3);

  await page.reload();
  await expect(editor.getByRole("row", { name: /Lámpara de sala/ })).toBeVisible();
  await expect(editor.getByRole("row", { name: /Sofá de dos plazas/ })).toBeVisible();
  await expect(editor.getByRole("row", { name: /Cajonera/ })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("descarga una plantilla de Excel e incorpora sus artículos al borrador antes de publicar", async ({ page }) => {
  const unexpected = await installSession(page, [CATALOG_PERMISSION]);
  const commands = await mockCatalogPublication(page);
  const excel = await excelTestApi();
  await page.goto("/administration/articles");
  const editor = page.getByTestId("article-catalog-admin");
  await expect(editor.getByRole("row", { name: /Cajonera/ })).toBeVisible();

  const downloaded = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descargar plantilla de Excel" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/u);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const workbook = excel.read(new Uint8Array(bytes), { type: "array" });
  expect(workbook.SheetNames[0]).toBe("Artículos");
  const sheet = workbook.Sheets["Artículos"];
  expect(excel.utils.sheet_to_json(sheet, { header: 1, blankrows: false })).toEqual([
    ["Código", "Artículo", "Sinónimos", "Volumen m³"],
  ]);
  excel.utils.sheet_add_aoa(sheet, [
    [OTHER_ARTICLE.code, "Cajonera alta", "Gavetero, Cómoda", "0,75"],
    ["", "Sofá de dos plazas", "Sillón doble", 1.25],
  ], { origin: "A2" });

  const importButton = editor.getByRole("button", { name: "Importar archivo de Excel" });
  const openingFile = page.waitForEvent("filechooser");
  await importButton.click();
  const chooser = await openingFile;
  await chooser.setFiles({
    name: "artículos-actualizados.xlsx",
    mimeType: EXCEL_TYPE,
    buffer: Buffer.from(excel.write(workbook, { type: "array", bookType: "xlsx" })),
  });
  await expect(page.getByRole("heading", { name: "Revisar importación" })).toBeVisible();
  expect(commands).toHaveLength(0);
  await page.getByRole("button", { name: "Aplicar al borrador" }).click();
  const articles = editor.getByRole("table", { name: "Artículos del catálogo" });
  await expect(articles.getByRole("row", { name: /Cajonera alta.*Borrador/ })).toBeVisible();
  await expect(articles.getByRole("row", { name: /Sofá de dos plazas.*Borrador/ })).toBeVisible();
  await expect(articles.getByRole("row", { name: /Lámpara auxiliar/ })).toBeVisible();
  expect(commands).toHaveLength(0);

  await editor.getByRole("button", { name: "Publicar catálogo", exact: true }).click();
  await expect(editor.getByText("Versión 4 publicada.", { exact: true })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].expectedLatestVersion).toBe(3);
  expect(commands[0].articles).toHaveLength(3);
  expect(commands[0].articles).toEqual(expect.arrayContaining([
    { code: ARTICLE.code, name: ARTICLE.name, aliases: ARTICLE.aliases, frequentAreaCodes: [AREA.code], defaultVolumeM3: 0.35, defaultWeightKg: null },
    { code: OTHER_ARTICLE.code, name: "Cajonera alta", aliases: ["Gavetero", "Cómoda"], frequentAreaCodes: [AREA.code], defaultVolumeM3: 0.75, defaultWeightKg: null },
    { code: expect.stringMatching(/^ART_[A-F0-9]{12}$/u), name: "Sofá de dos plazas", aliases: ["Sillón doble"], frequentAreaCodes: [], defaultVolumeM3: 1.25, defaultWeightKg: null },
  ]));
  expect(unexpected).toEqual([]);
});

test("muestra la fila inválida de un Excel externo antes de cambiar el borrador", async ({ page }) => {
  const unexpected = await installSession(page, [CATALOG_PERMISSION]);
  const commands = await mockCatalogPublication(page);
  const excel = await excelTestApi();
  const workbook = excel.utils.book_new();
  const sheet = excel.utils.aoa_to_sheet([
    ["Nombre", "Volumen m3"],
    ["Mesa pequeña", 0.4],
    ["Caja rota", -2],
  ]);
  excel.utils.book_append_sheet(workbook, sheet, "Inventario");

  await page.goto("/administration/articles");
  const editor = page.getByTestId("article-catalog-admin");
  await expect(editor.getByRole("row", { name: /Cajonera/ })).toBeVisible();
  await editor.locator('input[type="file"]').setInputFiles({
    name: "inventario.xlsx",
    mimeType: EXCEL_TYPE,
    buffer: Buffer.from(excel.write(workbook, { type: "array", bookType: "xlsx" })),
  });
  await expect(page.getByRole("heading", { name: "Revisar importación" })).toBeVisible();
  const invalidRow = page.getByRole("row", { name: /Caja rota/ });
  await expect(invalidRow).toContainText(/volumen/i);
  await expect(page.getByRole("button", { name: "Aplicar al borrador" })).toBeDisabled();
  expect(commands).toHaveLength(0);
  expect(unexpected).toEqual([]);
});

test("mantiene el catálogo fuera del alcance de quien sólo consulta asignaciones", async ({ page }) => {
  const unexpected = await installSession(page, ["survey:assignment:view"]);
  await page.goto("/administration/articles");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await expect(page.getByTestId("article-catalog-admin")).toHaveCount(0);
  expect(unexpected).not.toContain(CATALOG_URL);
});

test("Recepción usa los nombres y volúmenes del catálogo publicado al describir un bulto", async ({ page }) => {
  const unexpected = await installSession(page, ["customer-custody:view", "customer-custody:operate"]);
  const location = { locationRef: "receiving-area", path: "Recepción", name: "Recepción" };
  const item = {
    itemRef: "stored-item", itemCode: "LBL-CATALOG-001", inventoryNumber: 1,
    externalCode: null, status: "IN_CUSTODY", inspectionStatus: "FULL_REQUIRED",
    identitySource: "MANIFEST", condition: "GOOD", location, evidence: null, version: 1,
    genericContents: [], unitType: "BOX", packageFormCode: "BOX", notes: null,
    volumeM3: null, weightKg: null,
  };
  const lot = {
    storageRef: "storage-lot", lotCode: "CST-CATALOG-001", manifestCode: "MAN-CATALOG-001",
    receptionStage: "RECEIVING", status: "RECEIVED", version: 2,
    client: { name: "Cliente de prueba" }, receptionLocation: location,
    warehouse: { name: "Almacén de prueba", excessExitLocation: null },
    items: [item], movements: [],
  };
  await page.route("**/api/materials/warehouses", (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.route("**/api/customer-custody/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/authorizations")) return route.fulfill({ json: { ok: true, data: [] } });
    if (url.pathname.endsWith("/lots")) return route.fulfill({ json: { ok: true, data: [lot] } });
    if (url.pathname.endsWith("/catalog-items")) {
      const { articleRef, code, name, aliases, defaultVolumeM3 } = OTHER_ARTICLE;
      const data = url.searchParams.get("view") === "articles"
        ? { version: INITIAL_CATALOG.version, articles: [{ articleRef, code, name, aliases, defaultVolumeM3 }] }
        : [];
      return route.fulfill({ json: { ok: true, data } });
    }
    return route.fallback();
  });

  await page.goto("/mobile/custody");
  await page.getByRole("button", { name: /Cliente de prueba/ }).click();
  const scan = page.getByPlaceholder(/Escanee el artículo que va a describir/);
  await scan.pressSequentially(item.itemCode);
  await scan.press("Enter");
  await page.getByLabel("Contenido", { exact: true }).fill("Gavetero");
  await page.getByRole("button", { name: "Agregar contenido" }).click();
  const selected = page.getByRole("list", { name: "Contenido seleccionado" });
  await expect(selected.getByText(OTHER_ARTICLE.name, { exact: true })).toBeVisible();
  await expect(selected.getByText(/0[.,]62 m³ ref\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar descripción" })).toBeEnabled();
  expect(unexpected).toEqual([]);
});

test("publica el primer artículo cuando la empresa aún no tiene catálogo", async ({ page }) => {
  const unexpected = await installSession(page, [CATALOG_PERMISSION]);
  const commands: PublishCommand[] = [];
  const general = { ...AREA, code: "GENERAL", name: "General" };
  await page.route(`**${CATALOG_URL}`, (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const command = commands[0];
      if (!command) return route.fulfill({ status: 409, json: { ok: false, error: "CRM_SURVEY_CATALOG_NOT_READY" } });
      return route.fulfill({ json: { ok: true, data: {
        catalogRef: INITIAL_CATALOG.catalogRef, version: 1, areas: [general], conditions: [],
        articles: command.articles.map(({ frequentAreaCodes, ...article }) => ({
          ...article, articleRef: ARTICLE.articleRef,
          frequentAreaRefs: frequentAreaCodes.includes(general.code) ? [general.areaRef] : [],
        })),
      } } });
    }
    expect(request.method()).toBe("POST");
    commands.push(request.postDataJSON() as PublishCommand);
    return route.fulfill({ status: 201, json: { ok: true, data: { catalogRef: INITIAL_CATALOG.catalogRef, version: 1, replayed: false } } });
  });

  await page.goto("/administration/articles");
  const editor = page.getByTestId("article-catalog-admin");
  await editor.getByRole("button", { name: "Nuevo artículo", exact: true }).click();
  await editor.getByLabel("Nombre del artículo", { exact: true }).fill("Mesa auxiliar");
  await editor.getByRole("button", { name: "Guardar en borrador", exact: true }).click();
  await editor.getByRole("button", { name: "Publicar catálogo", exact: true }).click();
  await expect(editor.getByText("Versión 1 publicada.", { exact: true })).toBeVisible();

  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    expectedLatestVersion: 0,
    articles: [{ name: "Mesa auxiliar", aliases: [], frequentAreaCodes: [], defaultVolumeM3: null, defaultWeightKg: null }],
    areas: [{ code: general.code, name: general.name }],
    conditions: [],
  });
  expect(unexpected).toEqual([]);
});
