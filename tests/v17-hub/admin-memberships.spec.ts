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
  await evidence(page, testInfo, testInfo.project.name.includes("mobile") ? "mobile" : "desktop");
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
