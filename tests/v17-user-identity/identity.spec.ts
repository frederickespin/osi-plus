import { expect, test, type Page } from "@playwright/test";
import { ADMIN_BROWSER_CATALOG, ADMIN_MEMBERSHIP_PERMISSIONS } from "../v17-hub/admin-membership-fixture";
import type { AdminMembership } from "../../src/admin-tenant/adminApi";
import type { AdminUserEnrollment, AdminUserIdentity } from "../../src/admin-tenant/adminUserIdentityApi";

const ACTOR_REF = "11111111-1111-4111-8111-111111111111";
const MEMBER_REF = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_REF = "33333333-3333-4333-8333-333333333333";
const PHOTO = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR4nGMIoBAwjBowasCoAcPFAAAqJkAQuOUhlgAAAABJRU5ErkJggg==";
const TOKEN = `ui1.${"a".repeat(43)}`;
const PERMISSIONS = [...ADMIN_MEMBERSHIP_PERMISSIONS, "users:view", "users:edit", "users:create"];

async function fixture(page: Page, options: { hasPhoto?: boolean; canEdit?: boolean; permissions?: readonly string[] } = {}) {
  let identity: AdminUserIdentity = {
    membershipRef: MEMBER_REF, version: 1, name: "Coordinadora Sintética", email: "coordinadora@example.invalid",
    phone: "+18095550123", contactEmail: null, documentType: "CEDULA", documentNumber: "00000000001",
    hasPhoto: Boolean(options.hasPhoto), photoVersion: options.hasPhoto ? 1 : 0,
    updatedAt: "2026-10-30T12:00:00.000Z", canEdit: options.canEdit !== false,
  };
  let membership: AdminMembership = {
    membershipRef: MEMBER_REF, name: identity.name, email: identity.email, role: "K", status: "ACTIVE",
    grantedPermissions: [], deniedPermissions: [], authorizationVersion: 1, updatedAt: "2026-10-30T12:00:00.000Z",
  };
  let enrollments: AdminUserEnrollment[] = [];
  let nextIdentityError: { status: number; code: string } | null = null;
  const identityPatches: Record<string, unknown>[] = [];
  const membershipPatches: Record<string, unknown>[] = [];
  const issues: Record<string, unknown>[] = [];
  const revocations: Record<string, unknown>[] = [];
  const requests: string[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.identity.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administradora Sintética", role: "A", membershipRef,
      memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }] }));
  }, { membershipRef: ACTOR_REF });
  await page.route("**/api/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    requests.push(`${req.method()} ${path}`);
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" }, body: JSON.stringify(body) });
    if (path === "/api/auth/me") return fulfill({ ok: true, user: { name: "Administradora Sintética", role: "A", status: "ACTIVE", permissions: options.permissions || PERMISSIONS, deniedPermissions: [],
      membership: { membershipRef: ACTOR_REF, tenantName: "Empresa sintética", role: "A" }, memberships: [{ membershipRef: ACTOR_REF, tenantName: "Empresa sintética", role: "A", preferred: true }] } });
    expect(req.headers().authorization).toBe("Bearer synthetic.identity.token");
    expect(req.headers()["x-osi-membership-ref"]).toBe(ACTOR_REF);
    if (path === "/api/admin/user-identities" && req.method() === "GET") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const filtered = !search || `${identity.name} ${identity.email}`.toLowerCase().includes(search) ? [{ ...membership, name: identity.name }] : [];
      return fulfill({ ok: true, data: filtered, total: filtered.length, page: 1, pageSize: 20, catalog: ADMIN_BROWSER_CATALOG,
        identities: filtered.map(() => ({ membershipRef: MEMBER_REF, name: identity.name, email: identity.email, identityVersion: identity.version, hasPhoto: identity.hasPhoto, photoVersion: identity.photoVersion })) });
    }
    if (path === `/api/admin/user-identities/${MEMBER_REF}/photo`) return route.fulfill({ status: 200, contentType: "image/png", headers: { "Cache-Control": "private, no-store" }, body: Buffer.from(PHOTO, "base64") });
    if (path === `/api/admin/user-identities/${MEMBER_REF}` && req.method() === "GET") return fulfill({ ok: true, identity });
    if (path === `/api/admin/user-identities/${MEMBER_REF}` && req.method() === "PATCH") {
      const body = req.postDataJSON() as Record<string, unknown>; identityPatches.push(body);
      if (nextIdentityError) {
        const error = nextIdentityError; nextIdentityError = null;
        if (error.status === 409) identity = { ...identity, name: "Edición desde otra sesión", version: 2 };
        return fulfill({ ok: false, error: error.code }, error.status);
      }
      identity = { ...identity,
        ...(body.name === undefined ? {} : { name: String(body.name) }),
        ...(body.phone === undefined ? {} : { phone: String(body.phone) }),
        ...(body.documentNumber === undefined ? {} : { documentNumber: body.documentNumber as string | null }),
        ...(body.photoBase64 === undefined ? {} : { hasPhoto: body.photoBase64 !== null, photoVersion: identity.photoVersion + 1 }),
        version: identity.version + 1, updatedAt: "2026-10-30T12:30:00.000Z",
      };
      return fulfill({ ok: true, identity });
    }
    if (path === `/api/admin/memberships/${MEMBER_REF}` && req.method() === "GET") return fulfill({ ok: true, membership });
    if (path === `/api/admin/memberships/${MEMBER_REF}` && req.method() === "PATCH") {
      const body = req.postDataJSON() as Record<string, unknown>; membershipPatches.push(body);
      membership = { ...membership, ...(body.role === undefined ? {} : { role: body.role as AdminMembership["role"] }), authorizationVersion: membership.authorizationVersion + 1 };
      return fulfill({ ok: true, membership });
    }
    if (path === "/api/admin/user-enrollments" && req.method() === "GET") return fulfill({ ok: true, enrollments });
    if (path === "/api/admin/user-enrollments" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>; issues.push(body);
      const enrollment: AdminUserEnrollment = { enrollmentRef: ENROLLMENT_REF, name: String(body.name), email: String(body.email), role: body.role as AdminUserEnrollment["role"], status: "PENDING", createdAt: "2026-10-30T12:00:00.000Z", expiresAt: "2026-10-31T12:00:00.000Z" };
      enrollments = [enrollment];
      return fulfill({ ok: true, enrollment, shownOnce: true, activationPath: `/activate-user#token=${TOKEN}` }, 201);
    }
    if (path === `/api/admin/user-enrollments/${ENROLLMENT_REF}` && req.method() === "PATCH") {
      revocations.push(req.postDataJSON() as Record<string, unknown>);
      enrollments = enrollments.map((row) => ({ ...row, status: "REVOKED" }));
      return fulfill({ ok: true, enrollment: enrollments[0] });
    }
    unexpected.push(`${req.method()} ${path}`); return fulfill({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 405);
  });
  return { identityPatches, membershipPatches, issues, revocations, requests, unexpected,
    failNextIdentity(status: number, code: string) { nextIdentityError = { status, code }; },
    identity() { return identity; }, membership() { return membership; } };
}

async function openIdentity(page: Page) {
  await page.goto("/administration/access");
  await expect(page.getByRole("heading", { name: "Usuarios y roles", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  const dialog = page.getByRole("dialog", { name: "Ficha de usuario" });
  await expect(dialog.getByLabel("Nombre completo", { exact: true })).toHaveValue("Coordinadora Sintética");
  return dialog;
}

test("ficha separa identidad y acceso, guarda sólo el dato cambiado y conserva el login", async ({ page }, info) => {
  const seen = await fixture(page);
  const dialog = await openIdentity(page);
  await expect(dialog.getByRole("tab", { name: "Identidad", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Correo electrónico", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Guardar identidad", exact: true })).toBeDisabled();
  await dialog.getByLabel("Nombre completo", { exact: true }).fill("Coordinadora Renombrada");
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect(dialog.getByText("Identidad guardada.", { exact: true })).toBeVisible();
  expect(seen.identityPatches).toEqual([{ requestId: expect.any(String), expectedVersion: 1, name: "Coordinadora Renombrada" }]);
  expect(seen.membershipPatches).toEqual([]);
  await expect(dialog.getByRole("button", { name: "Guardar identidad", exact: true })).toBeDisabled();
  const contact = dialog.getByLabel(/Correo de contacto/);
  await contact.scrollIntoViewIfNeeded();
  const layoutElements = { contact: await contact.elementHandle(), save: await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).elementHandle() };
  // Read all bounds in one frame; wait for dialog animation without allowing
  // either the last field or the action bar to be covered or clipped.
  await expect.poll(() => dialog.evaluate((panel, elements) => {
    const field = elements.contact!.getBoundingClientRect();
    const footer = elements.save!.parentElement!.getBoundingClientRect();
    const content = panel.getBoundingClientRect();
    return { contactClear: field.height > 0 && field.bottom <= footer.top + 1, footerInside: footer.height > 0 && footer.bottom <= content.bottom + 1 };
  }, layoutElements)).toEqual({ contactClear: true, footerInside: true });
  await dialog.getByLabel("Nombre completo", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/osi-user-identity-19c-${info.project.name}-identity.png`, fullPage: true, animations: "disabled" });
  await dialog.getByRole("tab", { name: "Acceso", exact: true }).click();
  await dialog.getByLabel("Rol", { exact: true }).selectOption("PC");
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect.poll(() => seen.membershipPatches.length).toBe(1);
  expect(seen.membershipPatches[0]).toEqual({ requestId: expect.any(String), expectedVersion: 1, role: "PC" });
  await dialog.getByRole("tab", { name: "Identidad", exact: true }).click();
  await expect(dialog.getByLabel("Nombre completo", { exact: true })).toHaveValue("Coordinadora Renombrada");
  expect(seen.identity().email).toBe("coordinadora@example.invalid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(seen.unexpected).toEqual([]);
});

test("foto se obtiene con autorización, se reemplaza como PNG y se puede quitar", async ({ page }, info) => {
  const seen = await fixture(page, { hasPhoto: true });
  const dialog = await openIdentity(page);
  await expect(dialog.locator("img")).toHaveAttribute("src", /^blob:/);
  expect(seen.requests).toContain(`GET /api/admin/user-identities/${MEMBER_REF}/photo`);
  await dialog.getByLabel("Seleccionar foto de perfil", { exact: true }).setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from(PHOTO, "base64") });
  await expect(dialog.getByText("Foto seleccionada", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect.poll(() => seen.identityPatches.length).toBe(1);
  expect(Object.keys(seen.identityPatches[0]).sort()).toEqual(["expectedVersion", "photoBase64", "requestId"]);
  expect(Buffer.from(String(seen.identityPatches[0].photoBase64), "base64").subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
  await expect(dialog.getByText("Identidad guardada.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/osi-user-identity-19c-${info.project.name}-photo.png`, fullPage: true, animations: "disabled" });
  await dialog.getByRole("button", { name: "Quitar foto", exact: true }).click();
  await expect(dialog.getByText("Se quitará al guardar", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect.poll(() => seen.identityPatches.length).toBe(2);
  expect(seen.identityPatches[1]).toEqual({ requestId: expect.any(String), expectedVersion: 2, photoBase64: null });
  expect(seen.unexpected).toEqual([]);
});

test("conflicto impide reescribir hasta recargar incluso al cerrar la ficha", async ({ page }) => {
  const seen = await fixture(page); const dialog = await openIdentity(page);
  seen.failNextIdentity(409, "ADMIN_USER_IDENTITY_VERSION_CONFLICT");
  await dialog.getByLabel("Nombre completo", { exact: true }).fill("Mi edición pendiente");
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("La ficha cambió");
  await expect(dialog.getByRole("button", { name: "Guardar identidad", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Coordinadora Sintética/ }).click();
  await expect(dialog.getByRole("button", { name: "Recargar identidad", exact: true })).toBeVisible();
  expect(seen.identityPatches).toHaveLength(1);
  await dialog.getByRole("button", { name: "Recargar identidad", exact: true }).click();
  await expect(dialog.getByLabel("Nombre completo", { exact: true })).toHaveValue("Edición desde otra sesión");
  await dialog.getByLabel("Teléfono", { exact: true }).fill("+18095550124");
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect.poll(() => seen.identityPatches.length).toBe(2);
  expect(seen.identityPatches[1]).toEqual({ requestId: expect.any(String), expectedVersion: 2, phone: "+18095550124" });
  expect(seen.unexpected).toEqual([]);
});

test("rechazo de datos conserva el borrador y SVG no se envía al servidor", async ({ page }) => {
  const seen = await fixture(page); const dialog = await openIdentity(page);
  seen.failNextIdentity(400, "ADMIN_USER_IDENTITY_INPUT_INVALID");
  await dialog.getByLabel("Teléfono", { exact: true }).fill("809");
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Teléfono", { exact: true })).toHaveValue("809");
  await expect(dialog.getByLabel("Teléfono", { exact: true })).toBeEnabled();
  await dialog.getByLabel("Seleccionar foto de perfil", { exact: true }).setInputFiles({ name: "unsupported.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(dialog.getByText(/Seleccione una foto JPG, PNG o WebP/)).toBeVisible();
  expect(seen.identityPatches).toHaveLength(1);
  expect(seen.identityPatches[0]).not.toHaveProperty("photoBase64");
});

test("consulta de identidad sin edición no muestra alta y mantiene accesibles los datos", async ({ page }) => {
  const seen = await fixture(page, { canEdit: false, permissions: ["membership:view", "users:view"] });
  const dialog = await openIdentity(page);
  await expect(dialog.getByLabel("Nombre completo", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Guardar identidad", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Nuevo usuario", exact: true })).toHaveCount(0);
  expect(seen.issues).toEqual([]); expect(seen.identityPatches).toEqual([]); expect(seen.unexpected).toEqual([]);
});

test("alta exige rol no administrador y muestra una vez el enlace sin pedir contraseña", async ({ page }, info) => {
  const seen = await fixture(page);
  await page.goto("/administration/access");
  await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo usuario", exact: true });
  await expect(dialog.getByRole("button", { name: "Preparar alta", exact: true })).toBeDisabled();
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
  const roles = await dialog.getByLabel("Rol inicial", { exact: true }).locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(roles).not.toContain("A"); expect(roles).toHaveLength(16);
  await dialog.getByLabel("Nombre completo", { exact: true }).fill("Persona de Almacén");
  await dialog.getByLabel("Correo electrónico", { exact: true }).fill("almacen@example.invalid");
  await dialog.getByLabel("Teléfono", { exact: true }).fill("+18095550125");
  await dialog.getByLabel("Cédula / documento", { exact: true }).fill("00000000002");
  await dialog.getByLabel("Rol inicial", { exact: true }).selectOption("B");
  await page.screenshot({ path: `/tmp/osi-user-identity-19c-${info.project.name}-new-user.png`, fullPage: true, animations: "disabled" });
  await dialog.getByRole("button", { name: "Preparar alta", exact: true }).click();
  await expect(dialog.getByText("Alta registrada", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Enlace de activación", { exact: true })).toHaveValue(new RegExp(`/activate-user#token=${TOKEN.replaceAll(".", "\\.")}$`));
  expect(seen.issues).toEqual([{ requestId: expect.any(String), name: "Persona de Almacén", email: "almacen@example.invalid", phone: "+18095550125", documentType: "CEDULA", documentNumber: "00000000002", role: "B" }]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(TOKEN);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByLabel("Enlace de activación", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click();
  await expect(dialog.getByLabel("Nombre completo", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("Enlace de activación", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Revocar alta de Persona de Almacén", exact: true }).click();
  await expect(page.getByText("Revocado", { exact: true })).toBeVisible();
  expect(seen.revocations).toEqual([{ requestId: expect.any(String), action: "REVOKE" }]);
  expect(seen.unexpected).toEqual([]);
});

test("cancelar un alta no registra identidad ni permisos", async ({ page }) => {
  const seen = await fixture(page);
  await page.goto("/administration/access");
  await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo usuario", exact: true });
  await dialog.getByLabel("Nombre completo", { exact: true }).fill("Borrador descartado");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(seen.issues).toEqual([]); expect(seen.identityPatches).toEqual([]); expect(seen.membershipPatches).toEqual([]);
});

test("cambio de empresa aborta la edición y descarta su respuesta tardía", async ({ page }) => {
  await page.goto("/tests/v17-hub/mode-harness.html");
  await page.evaluate(async () => {
    const harness = await import("/tests/v17-user-identity/identity-context-harness.tsx");
    harness.mountIdentityContextHarness();
  });
  await page.getByRole("button", { name: /Persona Empresa A/ }).click();
  const dialog = page.getByRole("dialog", { name: "Ficha de usuario" });
  await dialog.getByLabel("Nombre completo", { exact: true }).fill("Borrador Empresa A");
  await dialog.getByRole("button", { name: "Guardar identidad", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.v17IdentityContextHarness?.snapshot().patches)).toBe(1);
  await page.evaluate(() => window.v17IdentityContextHarness?.switchContext());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Persona Empresa B/ })).toBeVisible();
  await page.evaluate(() => window.v17IdentityContextHarness?.resolveOriginalPatch());
  await expect(page.getByRole("button", { name: /Persona Empresa A|Borrador Empresa A/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.v17IdentityContextHarness?.snapshot().originalAborted)).toBe(true);
});
