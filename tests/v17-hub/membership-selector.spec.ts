import { expect, test, type Page } from "@playwright/test";

const REF_A = "11111111-1111-4111-8111-111111111111";
const REF_B = "22222222-2222-4222-8222-222222222222";
const options = [
  { membershipRef: REF_A, tenantName: "Organización Alfa", role: "A", preferred: true },
  { membershipRef: REF_B, tenantName: "Organización Beta", role: "V", preferred: false },
] as const;

function meBody(ref: string, memberships: readonly typeof options[number][] = options) {
  const selected = memberships.find((item) => item.membershipRef === ref) ?? memberships[0];
  const permissions = selected.role === "A" ? ["membership:view", "projects:view"] : ["pipeline:view"];
  return JSON.stringify({ ok: true, user: {
    name: "Persona multiempresa", role: selected.role, status: "active", permissions, deniedPermissions: [],
    membership: { membershipRef: selected.membershipRef, tenantName: selected.tenantName, role: selected.role },
    memberships,
  } });
}

async function installAuth(page: Page, memberships = options) {
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, token: "synthetic.selector.test", user: { name: "Persona multiempresa" }, membershipSelection: { required: memberships.length > 1, options: memberships } }),
  }));
  await page.route("**/api/auth/me", (route) => {
    const ref = route.request().headers()["x-osi-membership-ref"] || REF_A;
    return route.fulfill({ status: 200, contentType: "application/json", body: meBody(ref, memberships) });
  });
}

test("login multi-Membership exige selección comprensible y revalidada", async ({ page }) => {
  await installAuth(page);
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("person@example.invalid");
  await page.getByLabel("Contraseña").fill("Synthetic-Selector-Password-1!");
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await expect(page.getByTestId("membership-selection")).toBeVisible();
  await expect(page.getByLabel("Organización")).toHaveValue(REF_A);
  await page.getByLabel("Organización").selectOption(REF_B);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Persona multiempresa/ })).toBeVisible();
  await expect(page.getByLabel("Cambiar organización")).toHaveValue(REF_B);
});

test("cambio A a B limpia contexto tenant-specific y vuelve al Hub", async ({ page }) => {
  await installAuth(page);
  await page.addInitScript(({ ref, membershipOptions }) => {
    localStorage.setItem("osi-plus.token", "synthetic.selector.test");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Persona multiempresa", role: "A", membershipRef: ref, memberships: membershipOptions, permissions: ["membership:view", "projects:view"], deniedPermissions: [] }));
    localStorage.setItem("api-cache:tenant-a", "sensitive-tenant-a");
    localStorage.setItem("osi-plus.salesQuote.openContext", "tenant-a-draft");
    sessionStorage.setItem("tenant-a-form", "draft");
  }, { ref: REF_A, membershipOptions: options });
  await page.goto("/administration");
  await page.getByLabel("Cambiar organización").selectOption(REF_B);
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.getByLabel("Cambiar organización")).toHaveValue(REF_B);
  expect(await page.evaluate(() => ({ cache: localStorage.getItem("api-cache:tenant-a"), draft: localStorage.getItem("osi-plus.salesQuote.openContext"), form: sessionStorage.getItem("tenant-a-form") }))).toEqual({ cache: null, draft: null, form: null });
});

test("una sola Membership no muestra selector", async ({ page }) => {
  await installAuth(page, [options[0]]);
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("single@example.invalid");
  await page.getByLabel("Contraseña").fill("Synthetic-Selector-Password-1!");
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await expect(page.getByTestId("membership-selection")).toHaveCount(0);
  await expect(page.getByLabel("Cambiar organización")).toHaveCount(0);
});
