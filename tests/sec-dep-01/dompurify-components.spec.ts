import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

type ModuleName = "center" | "editor";

const modules: ModuleName[] = ["center", "editor"];
let unexpectedRequests: string[] = [];
const maliciousFixtures = [
  {
    name: "raw-text textarea",
    html: `<textarea title="</textarea><img src='data:image/png;base64,AA' onerror='window.__secDepExecuted=1'>">texto</textarea>`,
  },
  {
    name: "raw-text title and script",
    html: `<title title="</title><script>window.__secDepExecuted=1</script>">título</title><script>window.__secDepExecuted=1</script>`,
  },
  {
    name: "SVG and MathML nesting",
    html: `<math><mtext><table><mglyph><style><!--</style><img title="--></mglyph><img src='data:image/png;base64,AA' onerror='window.__secDepExecuted=1'>"></table></mtext></math><svg><foreignObject><img onload="window.__secDepExecuted=1"></foreignObject></svg>`,
  },
  {
    name: "event handlers",
    html: `<img src="data:image/png;base64,AA" onerror="window.__secDepExecuted=1" onload="window.__secDepExecuted=1"><div onclick="window.__secDepExecuted=1">clic</div>`,
  },
  {
    name: "javascript URL",
    html: `<a href="javascript:window.__secDepExecuted=1">enlace</a><form action="javascript:window.__secDepExecuted=1"><button>enviar</button></form>`,
  },
  {
    name: "malformed deep nesting",
    html: `${"<div>".repeat(180)}<iframe srcdoc="<script>window.__secDepExecuted=1</script>"></iframe>${"</span>".repeat(180)}`,
  },
] as const;

const legitimatePicHtml = [
  "<h1>Instrucciones {Cliente_Nombre}</h1>",
  "<p>Servicio <strong>{OSI_Codigo}</strong><br>Fecha: <em>{Fecha_Servicio}</em> — <u>Confirmado</u></p>",
  "<ul><li>Primer paso</li><li>Segundo paso</li></ul>",
  "<ol><li>Preparar acceso</li></ol>",
  "<table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody><tr><td>Proyecto</td><td>{Proyecto_Codigo}</td></tr></tbody></table>",
  '<p><a href="https://example.invalid/guia">Guía HTTPS</a> <a href="http://example.invalid/ayuda">Ayuda HTTP</a></p>',
  "<p>Unicode: áéíóú ñ — 日本語 — 📦</p>",
].join("");

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function protectNetwork(context: BrowserContext) {
  const unexpected: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4176") {
      unexpected.push(`${url.protocol}//${url.hostname}`);
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname === "/api/templates/list") {
      await fulfillJson(route, 200, { ok: true, total: 0, data: [] });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      unexpected.push(`local-api:${url.pathname}`);
      await fulfillJson(route, 500, { ok: false, error: "UNEXPECTED_TEST_API" });
      return;
    }
    await route.fallback();
  });
  return unexpected;
}

async function initializeMarkers(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__secDepExecuted", { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, "__secDepOpened", { value: 0, writable: true, configurable: true });
    window.open = () => {
      (window as Window & { __secDepOpened: number }).__secDepOpened += 1;
      return null;
    };
  });
}

async function openModule(page: Page, moduleName: ModuleName) {
  await page.goto(`/tests/sec-dep-01/harness.html?module=${moduleName}`);
  if (moduleName === "center") {
    await expect(page.getByText("No hay plantillas para este tipo.")).toBeVisible();
    await page.getByRole("button", { name: "Nueva", exact: true }).click();
  }
  await expect(page.getByText("Contenido PIC (HTML)", { exact: true })).toBeVisible();
}

function editorCard(page: Page) {
  return page.getByText("Contenido PIC (HTML)", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
}

function activeEditor(page: Page, moduleName: ModuleName) {
  void moduleName;
  return editorCard(page).locator("textarea");
}

function preview(page: Page, moduleName: ModuleName) {
  void moduleName;
  return page.locator("main#root").locator(".prose").last();
}

async function renderHtml(page: Page, moduleName: ModuleName, html: string) {
  const textarea = activeEditor(page, moduleName);
  await textarea.fill(html);
  const output = preview(page, moduleName);
  await expect(output).toBeVisible();
  await expect.poll(() => output.innerHTML()).not.toContain("Sin contenido");
  return output;
}

async function dangerousResidues(page: Page, moduleName: ModuleName) {
  return preview(page, moduleName).evaluate((root) => {
    const forbiddenTags = [...root.querySelectorAll("script,iframe,object,embed,base,meta,foreignObject")]
      .map((element) => element.tagName.toLowerCase());
    const forbiddenAttributes = [...root.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes]
        .filter((attribute) => /^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value))
        .map((attribute) => `${element.tagName.toLowerCase()}.${attribute.name}`),
    );
    return { forbiddenTags, forbiddenAttributes };
  });
}

test.beforeEach(async ({ page, context }) => {
  await initializeMarkers(page);
  unexpectedRequests = await protectNetwork(context);
});

test.afterEach(() => {
  expect(unexpectedRequests).toEqual([]);
});

for (const moduleName of modules) {
  test(`${moduleName}: bloquea fixtures mXSS y contenido ejecutable`, async ({ page }) => {
    await openModule(page, moduleName);
    const initialUrl = page.url();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const fixture of maliciousFixtures) {
      await page.evaluate(() => {
        (window as Window & { __secDepExecuted: number }).__secDepExecuted = 0;
      });
      await renderHtml(page, moduleName, fixture.html);
      await page.waitForTimeout(50);
      expect(await dangerousResidues(page, moduleName), fixture.name).toEqual({
        forbiddenTags: [],
        forbiddenAttributes: [],
      });
      expect(await page.evaluate(() => ({
        executed: (window as Window & { __secDepExecuted: number }).__secDepExecuted,
        opened: (window as Window & { __secDepOpened: number }).__secDepOpened,
      })), fixture.name).toEqual({ executed: 0, opened: 0 });
      expect(page.url(), fixture.name).toBe(initialUrl);
    }
    expect(errors).toEqual([]);
  });

  test(`${moduleName}: conserva el HTML PIC legítimo sin ampliarlo`, async ({ page }) => {
    await openModule(page, moduleName);
    const output = await renderHtml(page, moduleName, legitimatePicHtml);
    const rendered = await output.innerHTML();
    for (const tag of ["h1", "p", "br", "strong", "em", "u", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a"]) {
      expect(await output.locator(tag).count(), tag).toBeGreaterThan(0);
    }
    expect(rendered).toContain("{Cliente_Nombre}");
    expect(rendered).toContain("{OSI_Codigo}");
    expect(rendered).toContain("{Proyecto_Codigo}");
    expect(rendered).toContain("日本語");
    expect(rendered).toContain("📦");
    const hrefs = await output.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs).toEqual(["https://example.invalid/guia", "http://example.invalid/ayuda"]);
  });
}

test("TemplatesCenter y TemplateEditor producen sanitización equivalente", async ({ page }) => {
  await openModule(page, "center");
  const centerHtml = await (await renderHtml(page, "center", legitimatePicHtml)).innerHTML();
  await page.goto("about:blank");
  await openModule(page, "editor");
  const editorHtml = await (await renderHtml(page, "editor", legitimatePicHtml)).innerHTML();
  expect(editorHtml).toBe(centerHtml);
});

declare global {
  interface Window {
    __secDepExecuted: number;
    __secDepOpened: number;
  }
}
