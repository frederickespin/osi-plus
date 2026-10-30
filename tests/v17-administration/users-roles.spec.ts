import { expect, test, type Page } from "@playwright/test";
import { ADMIN_BROWSER_CATALOG, ADMIN_MEMBERSHIP_PERMISSIONS, adminPermissionLabel } from "../v17-hub/admin-membership-fixture";

const ACTOR_REF = "11111111-1111-4111-8111-111111111111";
const COORDINATOR_REF = "22222222-2222-4222-8222-222222222222";
const SPECIALIST_REF = "33333333-3333-4333-8333-333333333333";

function membership(overrides: Partial<ReturnType<typeof baseMembership>> = {}) {
  return { ...baseMembership(), ...overrides };
}

function baseMembership() {
  return {
    membershipRef: COORDINATOR_REF,
    name: "Coordinadora Sintética",
    email: "coordinadora@example.invalid",
    role: "K",
    status: "ACTIVE",
    grantedPermissions: [] as string[],
    deniedPermissions: [] as string[],
    authorizationVersion: 1,
    updatedAt: "2026-10-30T12:00:00.000Z",
  };
}

type FixtureMembership = ReturnType<typeof baseMembership>;
type Patch = Record<string, unknown>;

async function fixture(page: Page, initialRows: FixtureMembership[], actorPermissions = ADMIN_MEMBERSHIP_PERMISSIONS) {
  let rows = initialRows.map((row) => ({ ...row }));
  let conflict = false;
  const patches: Patch[] = [];
  const requests: string[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.users.roles.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({
      name: "Administradora Sintética", role: "A", membershipRef,
      memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }],
    }));
  }, { membershipRef: ACTOR_REF });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(`${request.method()} ${path}`);
    const fulfill = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json",
      headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" },
      body: JSON.stringify(body),
    });
    if (path === "/api/auth/me") return fulfill({ ok: true, user: {
      name: "Administradora Sintética", role: "A", status: "ACTIVE", permissions: actorPermissions, deniedPermissions: [],
      membership: { membershipRef: ACTOR_REF, tenantName: "Empresa sintética", role: "A" },
      memberships: [{ membershipRef: ACTOR_REF, tenantName: "Empresa sintética", role: "A", preferred: true }],
    } });
    expect(request.headers().authorization).toBe("Bearer synthetic.users.roles.token");
    if (path === "/api/admin/memberships" && request.method() === "GET") {
      const role = url.searchParams.get("role");
      const status = url.searchParams.get("status");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const filtered = rows.filter((row) => (!role || row.role === role) && (!status || row.status === status)
        && (!search || `${row.name} ${row.email}`.toLowerCase().includes(search)));
      return fulfill({ ok: true, data: filtered, total: filtered.length, page: 1, pageSize: 20, catalog: ADMIN_BROWSER_CATALOG });
    }
    const selected = rows.find((row) => path === `/api/admin/memberships/${row.membershipRef}`);
    if (selected && request.method() === "GET") return fulfill({ ok: true, membership: selected });
    if (selected && request.method() === "PATCH") {
      const patch = request.postDataJSON() as Patch;
      patches.push(patch);
      if (conflict) {
        conflict = false;
        rows = rows.map((row) => row.membershipRef === selected.membershipRef
          ? { ...row, role: "PC", authorizationVersion: row.authorizationVersion + 1 }
          : row);
        return fulfill({ ok: false, error: "ADMIN_MEMBERSHIP_VERSION_CONFLICT" }, 409);
      }
      const updated = {
        ...selected,
        ...(patch.role === undefined ? {} : { role: String(patch.role) }),
        ...(patch.status === undefined ? {} : { status: String(patch.status) }),
        ...(patch.grantedPermissions === undefined ? {} : { grantedPermissions: patch.grantedPermissions as string[] }),
        ...(patch.deniedPermissions === undefined ? {} : { deniedPermissions: patch.deniedPermissions as string[] }),
        authorizationVersion: selected.authorizationVersion + 1,
      };
      rows = rows.map((row) => row.membershipRef === selected.membershipRef ? updated : row);
      return fulfill({ ok: true, membership: updated });
    }
    unexpected.push(`${request.method()} ${path}`);
    return fulfill({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 405);
  });
  return {
    patches, requests, unexpected,
    conflictNextPatch() { conflict = true; },
    currentRows() { return rows; },
  };
}

async function openCoordinator(page: Page) {
  await page.goto("/administration/access");
  await expect(page.getByRole("heading", { name: "Usuarios y roles", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  await expect(page.getByRole("dialog", { name: "Acceso de usuario" })).toBeVisible();
}

test("roles K y PC se consultan, filtran y guardan con PATCH de un solo campo", async ({ page }, testInfo) => {
  const seen = await fixture(page, [membership(), membership({
    membershipRef: SPECIALIST_REF, name: "Especialista Sintético", email: "especialista@example.invalid", role: "PC",
  })]);
  await page.goto("/administration/access");
  await expect(page.getByRole("button", { name: /Coordinadora Sintética/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Especialista Sintético/ })).toBeVisible();
  await page.screenshot({ path: `/tmp/osi-users-roles-19b-${testInfo.project.name}-list.png`, fullPage: true, animations: "disabled" });
  const filter = page.getByLabel("Filtrar rol", { exact: true });
  expect(await filter.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([
    "", ...ADMIN_BROWSER_CATALOG.roles.map((role) => role.code),
  ]);
  await filter.selectOption("PC");
  await expect(page.getByRole("button", { name: /Coordinadora Sintética/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Especialista Sintético/ })).toBeVisible();
  await filter.selectOption("K");
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await expect(dialog.getByLabel("Rol", { exact: true })).toHaveValue("K");
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  await dialog.getByLabel("Rol", { exact: true }).selectOption("PC");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.patches.length).toBe(1);
  expect(seen.patches[0]).toEqual({ requestId: expect.any(String), expectedVersion: 1, role: "PC" });
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await filter.selectOption("");
  await page.reload();
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  await expect(dialog.getByLabel("Rol", { exact: true })).toHaveValue("PC");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(seen.unexpected).toEqual([]);
});

test("permiso sólo de estado conserva el rol y los permisos históricos sin enviarlos", async ({ page }) => {
  const seen = await fixture(page, [membership({ grantedPermissions: ["legacy:custom-access"], deniedPermissions: ["templates:view"] })], ["membership:view", "membership:update:status"]);
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await expect(dialog.getByLabel("Rol", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel(`Excepción de ${adminPermissionLabel("templates:view")}`, { exact: true })).toBeDisabled();
  await expect(dialog.getByTestId("membership-permission-legacy:custom-access")).toContainText(/S[oó]lo lectura/);
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.patches.length).toBe(1);
  expect(seen.patches[0]).toEqual({ requestId: expect.any(String), expectedVersion: 1, status: "SUSPENDED" });
  expect(seen.currentRows()[0]).toMatchObject({ role: "K", status: "SUSPENDED", grantedPermissions: ["legacy:custom-access"], deniedPermissions: ["templates:view"] });
  expect(seen.unexpected).toEqual([]);
});

test("matriz distingue herencia y denegación y conserva excepciones desconocidas", async ({ page }, testInfo) => {
  const seen = await fixture(page, [membership({ role: "V", grantedPermissions: ["legacy:custom-access"], deniedPermissions: ["pipeline:view"] })]);
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  const pipeline = dialog.getByTestId("membership-permission-pipeline:view");
  await expect(pipeline).toContainText("Denegado");
  await expect(pipeline).toContainText("Sin acceso");
  await pipeline.getByLabel(`Excepción de ${adminPermissionLabel("pipeline:view")}`, { exact: true }).selectOption("INHERIT");
  await expect(pipeline).toContainText("Heredado");
  await expect(pipeline).toContainText("Efectivo");
  const logistics = dialog.getByTestId("membership-permission-logistics:rules:view");
  await expect(logistics).toContainText("Sin asignar");
  await logistics.getByLabel(`Excepción de ${adminPermissionLabel("logistics:rules:view")}`, { exact: true }).selectOption("ALLOW");
  await expect(logistics).toContainText("Adicional");
  await expect(logistics).toContainText("Efectivo");
  const unknown = dialog.getByTestId("membership-permission-legacy:custom-access");
  await expect(unknown).toContainText(/S[oó]lo lectura/);
  await expect(unknown.getByRole("combobox")).toBeDisabled();
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `/tmp/osi-users-roles-19b-${testInfo.project.name}-permissions.png`, fullPage: true, animations: "disabled" });
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.patches.length).toBe(1);
  expect(seen.patches[0]).toEqual({
    requestId: expect.any(String), expectedVersion: 1,
    grantedPermissions: ["legacy:custom-access", "logistics:rules:view"], deniedPermissions: [],
  });
  expect(seen.unexpected).toEqual([]);
});

test("cambiar contexto aborta y descarta la respuesta de una edición anterior", async ({ page }) => {
  await page.goto("/tests/v17-hub/mode-harness.html");
  await page.evaluate(async () => {
    const harness = await import("/tests/v17-hub/admin-membership-context-harness.tsx");
    harness.mountMembershipContextHarness();
  });
  await page.getByRole("button", { name: /Persona Empresa A/ }).click();
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.v17MembershipContextHarness?.snapshot().patches)).toBe(1);
  await page.evaluate(() => window.v17MembershipContextHarness?.switchContext());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Persona Empresa B/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Persona Empresa A/ })).toHaveCount(0);
  await page.evaluate(async () => {
    window.v17MembershipContextHarness?.resolveOriginalPatch();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Persona Empresa B/ })).toBeVisible();
  await page.getByRole("button", { name: /Persona Empresa B/ }).click();
  await expect(dialog.getByLabel("Estado", { exact: true })).toHaveValue("ACTIVE");
  await expect(dialog).not.toContainText("Persona Empresa A");
  expect(await page.evaluate(() => window.v17MembershipContextHarness?.snapshot())).toEqual({ patches: 1, originalAborted: true });
});

test("rol A no recibe permisos administrativos implícitos y un lector no edita", async ({ page }) => {
  const seen = await fixture(page, [membership({ role: "A" })], ["membership:view"]);
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  const administrative = dialog.getByTestId("membership-permission-membership:view");
  await expect(administrative).toContainText("Sin asignar");
  await expect(administrative).toContainText("Sin acceso");
  await expect(dialog.getByLabel("Rol", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Estado", { exact: true })).toBeDisabled();
  await expect(administrative.getByRole("combobox")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  expect(seen.patches).toEqual([]);
  expect(seen.unexpected).toEqual([]);
});

test("cancelar descarta el borrador y no genera una actualización", async ({ page }) => {
  const seen = await fixture(page, [membership()]);
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await dialog.getByLabel("Rol", { exact: true }).selectOption("PC");
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  await expect(dialog.getByLabel("Rol", { exact: true })).toHaveValue("K");
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  expect(seen.patches).toEqual([]);
  expect(seen.unexpected).toEqual([]);
});

test("un conflicto exige recargar acceso antes de una nueva edición", async ({ page }) => {
  const seen = await fixture(page, [membership()]);
  seen.conflictNextPatch();
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Recargar acceso", exact: true })).toBeVisible();
  expect(seen.patches).toHaveLength(1);
  expect(seen.requests).not.toContain(`GET /api/admin/memberships/${COORDINATOR_REF}`);
  await dialog.getByRole("button", { name: "Recargar acceso", exact: true }).click();
  await expect(dialog.getByLabel("Rol", { exact: true })).toHaveValue("PC");
  await expect(dialog.getByLabel("Estado", { exact: true })).toHaveValue("ACTIVE");
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.patches.length).toBe(2);
  expect(seen.patches[1]).toEqual({ requestId: expect.any(String), expectedVersion: 2, status: "SUSPENDED" });
  expect(seen.patches[0].requestId).not.toBe(seen.patches[1].requestId);
  expect(seen.unexpected).toEqual([]);
});

test("cerrar y reabrir tras un conflicto conserva la lectura obligatoria antes de guardar", async ({ page }) => {
  const seen = await fixture(page, [membership()]);
  seen.conflictNextPatch();
  await openCoordinator(page);
  const dialog = page.getByRole("dialog", { name: "Acceso de usuario" });
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Recargar acceso", exact: true })).toBeVisible();
  expect(seen.patches).toHaveLength(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Rol", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Estado", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Recargar acceso", exact: true })).toBeVisible();
  expect(seen.requests).not.toContain(`GET /api/admin/memberships/${COORDINATOR_REF}`);
  expect(seen.patches).toHaveLength(1);

  await dialog.getByRole("button", { name: "Recargar acceso", exact: true }).click();
  await expect.poll(() => seen.requests.includes(`GET /api/admin/memberships/${COORDINATOR_REF}`)).toBe(true);
  await expect(dialog.getByLabel("Rol", { exact: true })).toHaveValue("PC");
  await expect(dialog.getByLabel("Estado", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Estado", { exact: true })).toHaveValue("ACTIVE");
  await dialog.getByLabel("Estado", { exact: true }).selectOption("SUSPENDED");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.patches.length).toBe(2);
  expect(seen.patches[1]).toEqual({ requestId: expect.any(String), expectedVersion: 2, status: "SUSPENDED" });
  expect(seen.unexpected).toEqual([]);
});
