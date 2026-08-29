import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ADMIN_PERMISSIONS = [
  "membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status",
];
const MEMBERSHIP_REF = "22222222-2222-4222-8222-222222222222";

function authBody(role: string, permissions: string[], deniedPermissions: string[] = []) {
  return JSON.stringify({ ok: true, user: {
    id: "synthetic-admin-user", code: "SYNTHETIC", name: "Administradora Sintética",
    email: "admin@example.invalid", phone: "", role, status: "active", joinDate: "2026-01-01",
    points: 0, rating: 0, permissions, deniedPermissions,
  } });
}

async function authenticate(page: Page, role: string, permissions: string[], deniedPermissions: string[] = []) {
  await page.addInitScript(({ roleValue }) => {
    localStorage.setItem("osi-plus.token", "synthetic.admin.test.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-admin-user", name: "Storage sin autoridad", role: roleValue }));
    localStorage.setItem("membership:view", "forged");
  }, { roleValue: role });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: authBody(role, permissions, deniedPermissions) }));
}

function listBody(version = 1) {
  return JSON.stringify({ ok: true, data: [{
    membershipRef: MEMBERSHIP_REF, name: "Persona Administrativa", email: "persona@example.invalid",
    role: "A", status: "ACTIVE", grantedPermissions: ADMIN_PERMISSIONS, deniedPermissions: [],
    authorizationVersion: version, updatedAt: "2026-08-27T12:00:00.000Z",
  }], total: 1, page: 1, pageSize: 20 });
}

async function evidence(page: Page, testInfo: TestInfo, suffix: string) {
  const root = process.env.V17_ADMIN_EVIDENCE_DIR;
  if (!root || testInfo.project.name !== (suffix === "desktop" ? "chromium-desktop" : "chromium-mobile")) return;
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: join(root, `v17-admin-${suffix}.png`), fullPage: true });
}

test("A con permisos explícitos usa Administración tenant-first sin identidades internas", async ({ page }, testInfo) => {
  await authenticate(page, "A", ADMIN_PERMISSIONS);
  let patches = 0;
  await page.route("**/api/admin/memberships?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: listBody() }));
  await page.route("**/api/admin/identity-invitations", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, invitations: [] }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, invitation: {
      invitationRef: "33333333-3333-4333-8333-333333333333", email: "second-admin@example.invalid", role: "A",
      grantedPermissions: ADMIN_PERMISSIONS, status: "PENDING", expiresAt: "2026-08-28T12:00:00.000Z", createdAt: "2026-08-27T12:00:00.000Z",
    }, activationPath: "/activate-admin#token=synthetic-one-time-token", shownOnce: true }) });
  });
  await page.route(`**/api/admin/memberships/${MEMBERSHIP_REF}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.abort();
    patches += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, membership: JSON.parse(listBody(2)).data[0] }) });
  });
  await page.goto("/administration");
  await expect(page.getByTestId("admin-tenant-memberships")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acceso y membresías" })).toBeVisible();
  await expect(page.getByText("Persona Administrativa")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(MEMBERSHIP_REF);
  await page.getByRole("button", { name: /Persona Administrativa/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Actualice exclusivamente el acceso de esta persona dentro del tenant activo.")).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect.poll(() => patches).toBe(1);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await evidence(page, testInfo, testInfo.project.name.includes("mobile") ? "mobile" : "desktop");
  await page.getByRole("button", { name: "Invitar administrador" }).click();
  await expect(page.getByText(/se mostrará una sola vez/i)).toBeVisible();
  await page.getByLabel("Email corporativo").fill("second-admin@example.invalid");
  await page.getByRole("button", { name: "Generar invitación" }).click();
  await expect(page.getByText("Copie este enlace ahora. No podrá recuperarse después.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("33333333-3333-4333-8333-333333333333");
});

test("activación nueva retira el token de la URL y exige login normal", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/admin-invitations/activate", async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, activated: true, loginRequired: true }) });
  });
  await page.goto("/activate-admin#token=synthetic-new-token");
  await expect(page).toHaveURL(/\/activate-admin$/);
  await page.getByLabel("Nombre completo").fill("Nueva Administradora");
  await page.getByLabel("Nueva contraseña").fill("Synthetic-Activation-1!");
  await page.getByLabel("Confirmar contraseña").fill("Synthetic-Activation-1!");
  await page.getByRole("button", { name: "Activar cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("inicio de sesión normal");
  expect(payload).toMatchObject({ token: "synthetic-new-token", name: "Nueva Administradora" });
  expect(await page.evaluate(() => ({ token: localStorage.getItem("osi-plus.token"), session: localStorage.getItem("osi-plus.session"), hash: location.hash }))).toEqual({ token: null, session: null, hash: "" });
  await expect(page.locator("body")).not.toContainText("synthetic-new-token");
});

test("User existente acepta autenticado sin reemplazar contraseña", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "existing.synthetic.legacy.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "existing-user", name: "Existente", role: "V" }));
  });
  let authorization = ""; let payload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/admin-invitations/activate", async (route) => {
    authorization = route.request().headers().authorization || "";
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, activated: true, loginRequired: true }) });
  });
  await page.goto("/activate-admin#token=synthetic-existing-token");
  await expect(page.getByText("Su contraseña no será reemplazada.")).toBeVisible();
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(authorization).toBe("Bearer existing.synthetic.legacy.token");
  expect(payload).toEqual({ token: "synthetic-existing-token" });
});

test("rol, deny, query, hash, storage y x-osi-* no cargan Administración sin permiso efectivo", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await page.setExtraHTTPHeaders({ "x-osi-role": "A", "x-osi-userid": "forged" });
  await authenticate(page, "A", ADMIN_PERMISSIONS, ["membership:view"]);
  await page.goto("/administration?role=A&permission=membership:view#membership:view");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(resources.some((path) => /HubWorkspace|AdminTenantMembershipModule/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/admin/"))).toBe(false);
});

test("compuertas UI productivas son focales, independientes y metadata-first", async ({ page }) => {
  await page.goto("/tests/v17-hub/mode-harness.html");
  const result = await page.evaluate(async () => {
    const mode = await import("/src/admin-tenant/adminMode.ts");
    const production = { hostname: "pilot.example.invalid", vercelEnvironment: "production", gitBranch: "main" };
    const preview = { ...production, vercelEnvironment: "preview" };
    const branch = { ...production, gitBranch: "feature/other" };
    return {
      memberships: mode.isAdminTenantMembershipEnabled({ VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "PRODUCTION_PILOT" }, production.hostname, production),
      invitations: mode.isAdminIdentityInvitationEnabled({ VITE_ADMIN_IDENTITY_INVITATION_MODE: "PRODUCTION_PILOT" }, production.hostname, production),
      previewRejected: mode.resolveAdminTenantMembershipMode({ VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "PRODUCTION_PILOT" }, preview.hostname, preview) === "DISABLED",
      branchRejected: mode.resolveAdminIdentityInvitationMode({ VITE_ADMIN_IDENTITY_INVITATION_MODE: "PRODUCTION_PILOT" }, branch.hostname, branch) === "DISABLED",
      oneDoesNotEnableOther: !mode.isAdminIdentityInvitationEnabled({ VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "PRODUCTION_PILOT" }, production.hostname, production),
      alteredRejected: ["PRODUCTION_WRITE", "ENABLED", "ALL_TENANTS", "production_pilot", "PRODUCTION_PILOT "].every((value) => mode.resolveAdminTenantMembershipMode({ VITE_ADMIN_TENANT_MEMBERSHIP_MODE: value }, production.hostname, production) === "DISABLED"),
    };
  });
  expect(result).toEqual({ memberships: true, invitations: true, previewRejected: true, branchRejected: true, oneDoesNotEnableOther: true, alteredRejected: true });
});
