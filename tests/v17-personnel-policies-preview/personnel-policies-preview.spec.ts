import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Account = Readonly<{ email: string; password: string }>;
const credentialFile = resolve(".env.v17-consolidated-preview-10b.local");
const evidenceDirectory = resolve(
  "docs/evidence/V17-PERSONNEL-POLICIES-PREVIEW-14B",
);

function credentials(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    readFileSync(credentialFile, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function account(prefix: string): Account {
  const values = credentials();
  const email = values[`${prefix}_EMAIL`];
  const password = values[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${prefix}_CREDENTIALS_REQUIRED`);
  return { email, password };
}

async function login(page: Page, identity: Account, expectHub = true) {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(identity.email);
  await page.getByLabel("Contraseña").fill(identity.password);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(localStorage.getItem("osi-plus.token"))),
    )
    .toBe(true);
  if (expectHub)
    await expect(
      page.getByRole("main").getByText("OSi Plus Hub", { exact: true }),
    ).toBeVisible();
}

function runtimeEvidence(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(`console:${message.type()}:${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500)
      problems.push(`http:${response.status()}:${new URL(response.url()).pathname}`);
  });
  return problems;
}

async function capture(page: Page, name: string) {
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(evidenceDirectory, `${name}.png`),
    fullPage: true,
  });
}

test("Administrador revisa Personal, capacidades, horarios, políticas y excepciones", async ({
  page,
}, testInfo) => {
  const problems = runtimeEvidence(page);
  await login(page, account("V17_PREVIEW_ADMIN"));
  await page
    .getByRole("button", { name: /Disponible Administración/u })
    .click();
  await expect(
    page.getByRole("heading", { name: "Personal y Políticas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evaluador Preview" }),
  ).toBeVisible();
  if (testInfo.project.name === "chromium-desktop")
    await capture(page, "01-administracion-personal");

  await page.getByRole("button", { name: "Capacidades" }).click();
  await expect(
    page.getByText("Visita presencial", { exact: true }).first(),
  ).toBeVisible();
  if (testInfo.project.name === "chromium-desktop")
    await capture(page, "02-capacidades");

  await page.getByRole("button", { name: "Horarios" }).click();
  await expect(page.getByLabel("Buffer individual")).toBeVisible();
  if (testInfo.project.name === "chromium-desktop")
    await capture(page, "03-politica-horarios");

  await page.getByRole("button", { name: "Políticas de visitas" }).click();
  await expect(page.getByText("Traslado mínimo", { exact: true })).toBeVisible();
  await expect(page.getByText("Preparación virtual", { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium-desktop")
    await capture(page, "04-slots-y-buffer");

  await page.getByRole("button", { name: "Excepciones" }).click();
  await expect(page.getByText(/fuera de horario/iu)).toBeVisible();
  await expect(page.getByText(/Evaluador: ACCEPTED/u)).toBeVisible();
  await expect(page.getByText(/Administración: APPROVED/u)).toBeVisible();
  if (testInfo.project.name === "chromium-desktop") {
    await capture(page, "05-excepcion-fuera-horario");
    await capture(page, "06-respuesta-evaluador");
    await capture(page, "07-aprobacion-administrativa");
  }
  if (testInfo.project.name === "chromium-mobile")
    await capture(page, "10-mobile-personal-excepciones");

  expect(problems).toEqual([]);
});

test("Evaluador consulta agenda tenant-first con presencial, virtual y reagendamiento", async ({
  page,
}, testInfo) => {
  const problems = runtimeEvidence(page);
  await login(page, account("V17_PREVIEW_EVALUATOR"));
  await page
    .getByRole("button", { name: /Disponible OSi Survey Agenda/u })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agenda de visitas" }),
  ).toBeVisible();
  await expect(page.getByText("Método · Visita presencial").first()).toBeVisible();
  await expect(page.getByText("Método · Visita virtual").first()).toBeVisible();
  await expect(page.getByText(/PV10B-D-QUOTES/u).first()).toBeVisible();
  if (testInfo.project.name === "chromium-desktop") {
    await capture(page, "08-agenda-evaluador");
    await capture(page, "09-reagendamiento-historico");
  }
  expect(problems).toEqual([]);
});

test("Deny se resuelve en shell sin chunks ni APIs protegidas", async ({
  page,
}, testInfo) => {
  const problems = runtimeEvidence(page);
  const protectedChunks: string[] = [];
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/assets\/.*(?:HubWorkspace|PersonnelPolicies|SurveyApp)/iu.test(pathname))
      protectedChunks.push(pathname);
    if (/^\/api\/(?:personnel|crm)\//u.test(pathname))
      protectedRequests.push(pathname);
  });
  await login(page, account("V17_PREVIEW_DENY"), false);
  await page.goto("/administration");
  await expect(
    page.getByRole("heading", { name: "No puedes abrir esta aplicación" }),
  ).toBeVisible();
  expect(protectedChunks).toEqual([]);
  expect(protectedRequests).toEqual([]);
  if (testInfo.project.name === "chromium-desktop")
    await capture(page, "11-deny-shell");
  expect(problems).toEqual([]);
});
