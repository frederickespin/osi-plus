import { expect, test, type Page } from "@playwright/test";

const TOKEN = `ui1.${"a".repeat(43)}`;
const PASSWORD = "Synthetic-Recipient-123!";
const ACTOR_REF = "11111111-1111-4111-8111-111111111111";

async function activationFixture(page: Page, { mode = "NEW_IDENTITY", status = 200, session = false }: { mode?: "NEW_IDENTITY" | "EXISTING_IDENTITY"; status?: number; session?: boolean } = {}) {
  if (session) await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.existing.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Persona con sesión", role: "V", membershipRef, memberships: [{ membershipRef, tenantName: "Empresa previa", role: "V", preferred: true }] }));
  }, { membershipRef: ACTOR_REF });
  const calls: { body: Record<string, unknown>; authorization?: string }[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path !== "/api/admin/user-enrollments/activate" || request.method() !== "POST") {
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ ok: false, error: "UNEXPECTED" }) });
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    calls.push({ body, authorization: request.headers().authorization });
    if (body.action === "RESOLVE") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, activation: { mode, name: "Persona Sintética", email: "persona@example.invalid", role: "K", tenantName: "Empresa sintética", expiresAt: "2026-10-31T12:00:00.000Z" } }) });
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status === 200 ? { ok: true, activated: true, loginRequired: true } : { ok: false, error: "ADMIN_USER_IDENTITY_UNAVAILABLE" }) });
  });
  return { calls, unexpected };
}

test("el destinatario nuevo elige su contraseña, el hash sale de la URL y no se inicia sesión", async ({ page }, info) => {
  const seen = await activationFixture(page, { session: true });
  await page.goto(`/activate-user#token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Activar acceso a OSi Plus", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/activate-user$/);
  expect(seen.calls).toEqual([{ body: { action: "RESOLVE", token: TOKEN }, authorization: undefined }]);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill("Different-Password-123!");
  await page.getByRole("button", { name: "Activar cuenta", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden.");
  expect(seen.calls).toHaveLength(1);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(PASSWORD);
  await page.screenshot({ path: `/tmp/osi-user-identity-19c-${info.project.name}-activation.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Activar cuenta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Acceso activado");
  expect(seen.calls[1]).toEqual({ body: { action: "ACTIVATE", token: TOKEN, password: PASSWORD }, authorization: undefined });
  await expect(page.getByRole("link", { name: "Ir al Hub", exact: true })).toHaveAttribute("href", "/hub");
  expect(await page.evaluate(() => localStorage.getItem("osi-plus.token"))).toBe("synthetic.existing.token");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(PASSWORD);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(TOKEN);
  expect(seen.unexpected).toEqual([]);
});

test("identidad existente acepta con su sesión y no puede reemplazar contraseña", async ({ page }) => {
  const seen = await activationFixture(page, { mode: "EXISTING_IDENTITY", session: true });
  await page.goto(`/activate-user#token=${TOKEN}`);
  await expect(page.getByRole("button", { name: "Aceptar acceso", exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Aceptar acceso", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Acceso activado");
  expect(seen.calls[1]).toEqual({ body: { action: "ACTIVATE", token: TOKEN }, authorization: "Bearer synthetic.existing.token" });
  expect(seen.unexpected).toEqual([]);
});

test("identidad existente sin sesión debe iniciar sesión antes de aceptar", async ({ page }) => {
  const seen = await activationFixture(page, { mode: "EXISTING_IDENTITY" });
  await page.goto(`/activate-user#token=${TOKEN}`);
  await page.getByRole("button", { name: "Aceptar acceso", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Inicie sesión con el correo indicado");
  expect(seen.calls).toHaveLength(1);
  await expect(page.getByRole("link", { name: /Abrir inicio de sesión/ })).toHaveAttribute("rel", "noopener noreferrer");
});

test("respuesta de activación incierta bloquea el reenvío automático", async ({ page }) => {
  const seen = await activationFixture(page, { status: 503 });
  await page.goto(`/activate-user#token=${TOKEN}`);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Activar cuenta", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el resultado");
  await expect(page.getByRole("button", { name: "Activar cuenta", exact: true })).toHaveCount(0);
  expect(seen.calls.filter((call) => call.body.action === "ACTIVATE")).toHaveLength(1);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("fragmento ambiguo se limpia sin enviar el token a la API", async ({ page }) => {
  const seen = await activationFixture(page);
  await page.goto(`/activate-user#token=${TOKEN}&token=${TOKEN}`);
  await expect(page.getByRole("alert")).toContainText("El enlace no está disponible o venció");
  await expect(page).toHaveURL(/\/activate-user$/);
  expect(seen.calls).toEqual([]);
  expect(seen.unexpected).toEqual([]);
});
