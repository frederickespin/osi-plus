import { expect, test, type Locator, type Page } from "@playwright/test";
import type { FleetVehicle } from "../../src/admin-fleet/types";
import type { FleetDriverAuthorization, FleetDriverPerson, FleetDriverPrimaryEvent } from "../../src/admin-fleet/driverTypes";

test.use({ timezoneId: "Asia/Tokyo" });

const MEMBERSHIP = "11111111-1111-4111-8111-111111111111";
const VEHICLE_REF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BASE = `/api/admin/fleet/vehicles/${VEHICLE_REF}/drivers`;
const NOW = "2030-11-01T13:00:00.000Z";
const PERMISSIONS = ["fleet:view", "fleet:edit", "fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"];
const diagnostics = new WeakMap<Page, string[]>();
const actor: FleetDriverPerson = { membershipRef: MEMBERSHIP, displayName: "Responsable sintética" };
const person = (index: number): FleetDriverPerson => ({ membershipRef: `d0000000-0000-4000-8000-${String(index).padStart(12, "0")}`, displayName: `Chofer API ${String(index).padStart(2, "0")}` });
const uuid = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const authorization = (index = 1, changes: Partial<FleetDriverAuthorization> = {}): FleetDriverAuthorization => ({
  kind: "TEMPORARY", authorizationRef: uuid(index), driver: person(index + 1), driverEligible: true,
  startsAt: "2030-11-01T12:00:00.000Z", endsAt: "2030-11-01T22:00:00.000Z", reason: "Cobertura de turno", status: "PENDING", effectiveStatus: "PENDING",
  requestedBy: actor, requestedAt: NOW, decidedBy: null, decidedAt: null, decisionReason: null,
  revokedBy: null, revokedAt: null, revocationReason: null, version: 1, canApprove: true, canReject: true, canRevoke: false, ...changes,
});
const vehicle: FleetVehicle = { vehicleRef: VEHICLE_REF, businessCode: "FLOT-01", plate: "L123456", vin: null, vehicleType: "Camión", brand: null, model: null, modelYear: null,
  capacityWeight: 4500, capacityVolume: 20, usableLength: null, usableWidth: null, usableHeight: null, weightUnit: "KG", volumeUnit: "CBM", dimensionUnit: "M", operationalStatus: "AVAILABLE", availableForCalculation: true,
  effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: null, hubCode: null, rowVersion: 1, updatedAt: "2026-10-31T12:00:00.000Z", retiredAt: null, calculationLocked: false };

async function fixture(page: Page, options: {
  role?: "A" | "B"; permissions?: string[]; denied?: string[]; serverPermissions?: { assign: boolean; request: boolean; authorize: boolean };
  authorizations?: FleetDriverAuthorization[]; primary?: FleetDriverPrimaryEvent[]; retired?: boolean;
} = {}) {
  const traffic: string[] = []; diagnostics.set(page, traffic); const started = Date.now();
  const relevant = (raw: string) => /\/(api\/admin\/fleet|src\/admin-fleet)\//u.test(new URL(raw).pathname);
  const record = (event: string) => traffic.push(`${Date.now() - started}ms ${event}`);
  page.on("request", (request) => { if (relevant(request.url())) record(`request ${request.method()} ${new URL(request.url()).pathname}`); });
  page.on("response", (response) => { if (relevant(response.url())) record(`response ${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("requestfailed", (request) => { if (relevant(request.url())) record(`failed ${new URL(request.url()).pathname} ${request.failure()?.errorText}`); });
  page.on("console", (message) => { if (message.type() === "error" || message.text().startsWith("[vite]")) record(`console ${message.type()} ${message.text()}`); });
  page.on("pageerror", (error) => record(`pageerror ${error.message}`));
  const fleetVehicle: FleetVehicle = options.retired ? { ...vehicle, operationalStatus: "RETIRED", availableForCalculation: false, retiredAt: NOW } : vehicle;
  const driverOptions = Array.from({ length: 23 }, (_, index) => person(index + 1));
  let primary = options.primary || [];
  let entries = options.authorizations || [];
  let primaryVersion = primary[0]?.revision || 0;
  const serverPermissions = options.serverPermissions || { assign: true, request: true, authorize: true };
  let nextFailure: { code: string; status: number; commit?: boolean; network?: boolean } | null = null;
  let malformed = false;
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const reads: URL[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membership, role }) => {
    localStorage.setItem("osi-plus.token", "synthetic.drivers.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Responsable sintética", role, membershipRef: membership, memberships: [{ membershipRef: membership, tenantName: "Empresa sintética", role, preferred: true }] }));
    localStorage.setItem("osi-plus.users", JSON.stringify([{ id: "legacy-user", name: "Chofer local que no debe aparecer", role: "E", status: "ACTIVE" }]));
  }, { membership: MEMBERSHIP, role: options.role || "A" });
  await page.route("**/api/**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/me") return json({ ok: true, user: { name: actor.displayName, role: options.role || "A", status: "ACTIVE", permissions: options.permissions || PERMISSIONS, deniedPermissions: options.denied || [], membership: { membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: options.role || "A" }, memberships: [{ membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: options.role || "A", preferred: true }] } });
    expect(request.headers().authorization).toBe("Bearer synthetic.drivers.token");
    expect(request.headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP);
    if (url.pathname === "/api/admin/fleet/vehicles" && request.method() === "GET") return json({ ok: true, data: [fleetVehicle], total: 1, page: 1, pageSize: 20 });
    if (url.pathname === `/api/admin/fleet/vehicles/${VEHICLE_REF}` && request.method() === "GET") return json({ ok: true, vehicle: fleetVehicle });
    if (request.method() === "GET" && url.pathname === "/api/admin/fleet/drivers/options") {
      reads.push(url);
      const search = (url.searchParams.get("search") || "").toLowerCase(); const filtered = driverOptions.filter((item) => item.displayName.toLowerCase().includes(search));
      const pageNumber = Number(url.searchParams.get("page")); const pageSize = Number(url.searchParams.get("pageSize"));
      return json({ ok: true, data: filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: filtered.length, page: pageNumber, pageSize });
    }
    if (request.method() === "GET" && url.pathname === BASE) {
      reads.push(url); const historyKind = url.searchParams.get("historyKind");
      const pageNumber = Number(url.searchParams.get("page")); const pageSize = Number(url.searchParams.get("pageSize"));
      const data = historyKind === "PRIMARY" ? primary : entries;
      return json({ ok: true, vehicle: { vehicleRef: malformed ? "other-vehicle" : VEHICLE_REF, businessCode: fleetVehicle.businessCode, plate: fleetVehicle.plate, operationalStatus: fleetVehicle.operationalStatus }, primaryDriver: primary[0]?.driver ? primary[0] : null, primaryVersion, generatedAt: NOW, historyKind,
        data: data.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: data.length, page: pageNumber, pageSize, permissions: serverPermissions });
    }
    if (url.pathname.startsWith(`${BASE}/`) && ["PUT", "POST", "PATCH"].includes(request.method())) {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ method: request.method(), path: url.pathname, body });
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(Object.keys(body).some((key) => /tenant|actor|requestedBy|assignedBy|decidedBy/u.test(key))).toBe(false);
      const failure = nextFailure; nextFailure = null;
      if (failure && !failure.commit) {
        if (failure.code === "FLEET_DRIVERS_VERSION_CONFLICT") {
          primaryVersion += 1; primary = [{ kind: "PRIMARY", assignmentRef: uuid(900 + primaryVersion), revision: primaryVersion, driver: person(3), driverEligible: true, assignedBy: actor, assignedAt: NOW, reason: "Cambio de otra sesión" }, ...primary];
        }
        return failure.network ? route.abort("connectionreset") : json({ ok: false, error: failure.code }, failure.status);
      }
      let reference = ""; let version = 1;
      if (url.pathname === `${BASE}/primary` && request.method() === "PUT") {
        expect(body.expectedVersion).toBe(primaryVersion); primaryVersion += 1; reference = uuid(100 + primaryVersion); version = primaryVersion;
        primary = [{ kind: "PRIMARY", assignmentRef: reference, revision: version, driver: body.driverMembershipRef === null ? null : driverOptions.find((row) => row.membershipRef === body.driverMembershipRef)!, driverEligible: body.driverMembershipRef !== null, assignedBy: actor, assignedAt: NOW, reason: String(body.reason) }, ...primary];
      } else if (url.pathname === `${BASE}/authorizations` && request.method() === "POST") {
        const entry = authorization(entries.length + 1, { driver: driverOptions.find((row) => row.membershipRef === body.driverMembershipRef)!, startsAt: String(body.startsAt), endsAt: String(body.endsAt), reason: String(body.reason) }); entries = [entry, ...entries]; reference = entry.authorizationRef;
      } else {
        const current = entries.find((row) => url.pathname === `${BASE}/authorizations/${row.authorizationRef}`);
        if (!current) { unexpected.push(url.pathname); return json({ ok: false, error: "UNEXPECTED" }, 404); }
        expect(body.expectedVersion).toBe(current.version); reference = current.authorizationRef; version = current.version + 1;
        const updated: FleetDriverAuthorization = body.action === "REVOKE"
          ? { ...current, effectiveStatus: "REVOKED", revokedBy: actor, revokedAt: NOW, revocationReason: String(body.reason), version, canApprove: false, canReject: false, canRevoke: false }
          : { ...current, status: body.action === "APPROVE" ? "APPROVED" : "REJECTED", effectiveStatus: body.action === "APPROVE" ? "ACTIVE" : "REJECTED", decidedBy: actor, decidedAt: NOW, decisionReason: body.reason ? String(body.reason) : null, version, canApprove: false, canReject: false, canRevoke: body.action === "APPROVE" };
        entries = entries.map((row) => row.authorizationRef === reference ? updated : row);
      }
      if (failure?.network) return route.abort("connectionreset");
      return json({ ok: true, vehicleRef: VEHICLE_REF, reference, version, idempotent: false });
    }
    unexpected.push(`${request.method()} ${url.pathname}`); return json({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 405);
  });
  return { writes, reads, unexpected, entries: () => entries, primary: () => primary,
    failNext(code: string, status = 409, commit = false, network = false) { nextFailure = { code, status, commit, network }; },
    approveElsewhere() { entries = entries.map((row, index) => index === 0 ? { ...row, status: "APPROVED", effectiveStatus: "ACTIVE", decidedBy: actor, decidedAt: NOW, decisionReason: "Decisión registrada en otra sesión", version: row.version + 1, canApprove: false, canReject: false, canRevoke: true } : row); },
    malformedWorkspace() { malformed = true; } };
}

async function openDrivers(page: Page) {
  await page.goto("/administration/fleet");
  await page.getByRole("button", { name: "Acciones de FLOT-01", exact: true }).click();
  await page.getByRole("menuitem", { name: "Choferes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choferes del vehículo", exact: true });
  try { await expect(dialog.getByText("FLOT-01 · L123456", { exact: true })).toBeVisible(); }
  catch (cause) {
    await test.info().attach("fleet-driver-load-diagnostics", { body: JSON.stringify({ traffic: diagnostics.get(page), resources: await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/admin-fleet/") || entry.name.includes("/api/admin/fleet/")).map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration }))) }, null, 2), contentType: "application/json" });
    throw cause;
  }
  return dialog;
}
async function choose(page: Page, dialog: Locator, label: string, name: string) {
  await dialog.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("combobox", { name: `Buscar ${label.toLocaleLowerCase("es")}`, exact: true }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}
async function openAction(page: Page, dialog: Locator, driver: string, action: string) {
  await dialog.getByRole("button", { name: `Acciones de autorización de ${driver}`, exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
async function draftRequest(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Solicitar uso temporal", exact: true }).click();
  await choose(page, dialog, "Chofer temporal", "Chofer API 02");
  await dialog.getByLabel("Uso temporal desde").fill("2030-11-01T08:00");
  await dialog.getByLabel("Uso temporal hasta").fill("2030-11-01T18:00");
  await dialog.getByLabel("Motivo del uso temporal").fill("Cobertura de turno");
}

test("Administrador sin permisos nuevos consulta sin asignar, solicitar ni decidir", async ({ page }) => {
  const seen = await fixture(page, { permissions: ["fleet:view", "fleet:edit"], authorizations: [authorization()] });
  const dialog = await openDrivers(page);
  await expect(dialog.getByRole("button", { name: "Cambiar chofer habitual" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Solicitar uso temporal" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Acciones de autorización de Chofer API 02" }).click();
  await expect(page.getByRole("menuitem", { name: "Aprobar", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Ver detalle", exact: true }).click();
  await expect(dialog.getByText("Cobertura de turno", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Pendiente", { exact: true })).toBeVisible();
  seen.approveElsewhere(); await dialog.getByRole("button", { name: "Recargar choferes", exact: true }).click();
  await expect(dialog.getByText("Vigente", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Decisión registrada en otra sesión", { exact: true })).toBeVisible();
  expect(seen.writes).toEqual([]); expect(seen.reads.filter((url) => url.pathname.endsWith("/options"))).toEqual([]); expect(seen.unexpected).toEqual([]);
});

test("Operaciones designado trabaja con choferes sin editar ficha o activar vehículos", async ({ page }) => {
  const seen = await fixture(page, { role: "B" });
  const dialog = await openDrivers(page);
  await expect(dialog.getByRole("button", { name: "Cambiar chofer habitual" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Solicitar uso temporal" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar choferes" }).click();
  await expect(page.getByRole("button", { name: "Nuevo vehículo" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Activo FLOT-01" })).toBeDisabled();
  expect(seen.writes).toEqual([]); expect(seen.unexpected).toEqual([]);
});

test("denegaciones locales y permisos de servidor prevalecen sobre botones de escritura", async ({ page }) => {
  const seen = await fixture(page, { denied: ["fleet:drivers:assign"], serverPermissions: { assign: true, request: false, authorize: false }, authorizations: [authorization()] });
  const dialog = await openDrivers(page);
  await expect(dialog.getByRole("button", { name: "Cambiar chofer habitual" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Solicitar uso temporal" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Acciones de autorización de Chofer API 02" }).click();
  await expect(page.getByRole("menuitem", { name: "Aprobar", exact: true })).toHaveCount(0);
  expect(seen.writes).toEqual([]);
});

test("selector usa opciones reales paginadas; asigna, quita e historiza habitual", async ({ page }) => {
  const seen = await fixture(page); const dialog = await openDrivers(page);
  await dialog.getByRole("button", { name: "Cambiar chofer habitual" }).click();
  await dialog.getByRole("combobox", { name: "Chofer habitual", exact: true }).click();
  await expect(page.getByRole("option", { name: "Chofer API 01", exact: true })).toBeVisible();
  await expect(page.getByText("Chofer local que no debe aparecer", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Choferes siguientes", exact: true }).click();
  await page.getByRole("option", { name: "Chofer API 23", exact: true }).click();
  await dialog.getByLabel("Motivo del cambio de chofer").fill("Asignación habitual de unidad");
  await dialog.getByRole("button", { name: "Guardar habitual", exact: true }).click();
  await expect(dialog.getByText("Chofer habitual actualizado.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Chofer API 23", { exact: true })).toBeVisible();
  expect(seen.writes[0].body).toEqual({ requestId: expect.any(String), expectedVersion: 0, driverMembershipRef: person(23).membershipRef, reason: "Asignación habitual de unidad" });
  await dialog.getByRole("button", { name: "Cambiar chofer habitual" }).click();
  await dialog.getByRole("combobox", { name: "Chofer habitual", exact: true }).click();
  await page.getByRole("option", { name: "Sin asignar", exact: true }).click();
  await dialog.getByLabel("Motivo del cambio de chofer").fill("Finalizó su asignación");
  await dialog.getByRole("button", { name: "Guardar habitual", exact: true }).click();
  await expect(dialog.getByText("Chofer habitual actualizado.", { exact: true })).toBeVisible();
  expect(seen.writes[1].body).toMatchObject({ expectedVersion: 1, driverMembershipRef: null, reason: "Finalizó su asignación" });
  await dialog.getByRole("button", { name: "Historial habitual", exact: true }).click();
  const history = dialog.getByRole("region", { name: "Historial de chofer habitual", exact: true });
  await expect(history.getByRole("row")).toHaveCount(3);
  await expect(history.getByRole("cell", { name: "Chofer API 23", exact: true })).toBeVisible();
  expect(seen.reads.some((url) => url.pathname.endsWith("/options") && url.searchParams.get("page") === "2")).toBe(true);
  expect(seen.unexpected).toEqual([]);
});

test("solicitud convierte hora RD y requiere decisión explícita; aprobar y revocar conservan historial", async ({ page }, info) => {
  const seen = await fixture(page); const dialog = await openDrivers(page);
  await draftRequest(page, dialog);
  await expect(dialog.getByText("Santo Domingo · UTC−04:00", { exact: true })).toBeVisible();
  await dialog.getByLabel("Motivo del uso temporal").scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.evaluate((element) => {
    const footer = element.querySelector('[data-testid="fleet-drivers-footer"]')!.getBoundingClientRect();
    const field = element.querySelector('[aria-label="Motivo del uso temporal"]')!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return field.bottom <= footer.top + 1 && box.bottom <= innerHeight + 1 && box.top >= 0;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.screenshot({ path: `/tmp/osi-fleet-19f-drivers-${info.project.name}-request.png`, animations: "disabled" });
  await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(dialog.getByText("Solicitud registrada. Queda pendiente de autorización.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Pendiente", exact: true })).toBeVisible();
  await dialog.screenshot({ path: `/tmp/osi-fleet-19f-drivers-${info.project.name}-overview.png`, animations: "disabled" });
  expect(seen.writes).toHaveLength(1);
  expect(seen.writes[0].body).toMatchObject({ driverMembershipRef: person(2).membershipRef, startsAt: "2030-11-01T12:00:00.000Z", endsAt: "2030-11-01T22:00:00.000Z", reason: "Cobertura de turno" });
  await openAction(page, dialog, "Chofer API 02", "Aprobar");
  expect(seen.writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Aprobar autorización", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Vigente", exact: true })).toBeVisible();
  expect(seen.writes[1].body).toEqual({ requestId: expect.any(String), expectedVersion: 1, action: "APPROVE" });
  await openAction(page, dialog, "Chofer API 02", "Revocar");
  await dialog.getByRole("button", { name: "Revocar autorización", exact: true }).click();
  expect(seen.writes).toHaveLength(2);
  await dialog.getByLabel("Motivo de la decisión").fill("El servicio se canceló");
  await dialog.getByRole("button", { name: "Revocar autorización", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Revocada", exact: true })).toBeVisible();
  expect(seen.writes[2].body).toMatchObject({ expectedVersion: 2, action: "REVOKE", reason: "El servicio se canceló" });
  await openAction(page, dialog, "Chofer API 02", "Ver detalle");
  await expect(dialog.getByText("El servicio se canceló", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Responsable sintética", { exact: true })).toHaveCount(3);
  expect(seen.primary()).toEqual([]); expect(seen.entries()).toHaveLength(1); expect(seen.unexpected).toEqual([]);
});

test("rechazar exige motivo y una solicitud vencida no ofrece aprobación", async ({ page }) => {
  const seen = await fixture(page, { authorizations: [authorization(1, { version: 7 }), authorization(2, { effectiveStatus: "EXPIRED", endsAt: "2030-11-01T12:30:00.000Z" })] });
  const dialog = await openDrivers(page);
  await openAction(page, dialog, "Chofer API 02", "Rechazar");
  await dialog.getByLabel("Motivo de la decisión").fill("El vehículo no estará disponible");
  await dialog.getByRole("button", { name: "Rechazar solicitud", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Rechazada", exact: true })).toBeVisible();
  expect(seen.writes[0].body).toMatchObject({ expectedVersion: 7, action: "REJECT", reason: "El vehículo no estará disponible" });
  await dialog.getByRole("button", { name: "Acciones de autorización de Chofer API 03", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Aprobar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Rechazar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Ver detalle", exact: true })).toBeVisible();
  expect(seen.writes).toHaveLength(1);
});

test("vehículo retirado permite revocar autorizaciones aprobadas y vencidas sin abrir nuevas asignaciones", async ({ page }) => {
  const approved = { status: "APPROVED" as const, decidedBy: actor, decidedAt: NOW, decisionReason: "Aprobada antes del retiro", canApprove: false, canReject: false, canRevoke: true };
  const seen = await fixture(page, { retired: true, authorizations: [authorization(1, { ...approved, effectiveStatus: "UNAVAILABLE" }), authorization(2, { ...approved, effectiveStatus: "EXPIRED", endsAt: "2030-11-01T12:30:00.000Z" })] });
  const dialog = await openDrivers(page);
  await expect(dialog.getByText("Vehículo retirado. Puede consultar el historial y revocar autorizaciones existentes.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cambiar chofer habitual", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Solicitar uso temporal", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Acciones de autorización de Chofer API 02", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Aprobar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Rechazar", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Revocar", exact: true }).click();
  await dialog.getByLabel("Motivo de la decisión").fill("Cierre de autorización por retiro del vehículo");
  await dialog.getByRole("button", { name: "Revocar autorización", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Revocada", exact: true })).toBeVisible();
  expect(seen.writes).toHaveLength(1);
  expect(seen.writes[0].body).toMatchObject({ action: "REVOKE", expectedVersion: 1, reason: "Cierre de autorización por retiro del vehículo" });
  await openAction(page, dialog, "Chofer API 03", "Revocar");
  await dialog.getByLabel("Motivo de la decisión").fill("Cierre de autorización vencida");
  await dialog.getByRole("button", { name: "Revocar autorización", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Revocada", exact: true })).toHaveCount(2);
  expect(seen.writes).toHaveLength(2);
  expect(seen.writes[1].body).toMatchObject({ action: "REVOKE", expectedVersion: 1, reason: "Cierre de autorización vencida" });
  expect(seen.unexpected).toEqual([]);
});

test("conflicto conserva borrador y exige recarga manual antes de guardar con versión actual", async ({ page }) => {
  const seen = await fixture(page); const dialog = await openDrivers(page);
  await dialog.getByRole("button", { name: "Cambiar chofer habitual" }).click();
  await choose(page, dialog, "Chofer habitual", "Chofer API 02");
  await dialog.getByLabel("Motivo del cambio de chofer").fill("Mi cambio revisable");
  seen.failNext("FLEET_DRIVERS_VERSION_CONFLICT");
  await dialog.getByRole("button", { name: "Guardar habitual", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("El borrador se conserva");
  await expect(dialog.getByRole("combobox", { name: "Chofer habitual", exact: true })).toHaveText("Chofer API 02");
  await expect(dialog.getByLabel("Motivo del cambio de chofer")).toHaveValue("Mi cambio revisable");
  await expect(dialog.getByRole("button", { name: "Guardar habitual", exact: true })).toBeDisabled();
  expect(seen.writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Recargar choferes", exact: true }).click();
  await expect(dialog.getByText("Asignación guardada: Chofer API 03.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Guardar habitual", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Guardar habitual", exact: true }).click();
  await expect(dialog.getByText("Chofer habitual actualizado.", { exact: true })).toBeVisible();
  expect(seen.writes).toHaveLength(2); expect(seen.writes[1].body).toMatchObject({ expectedVersion: 1, driverMembershipRef: person(2).membershipRef, reason: "Mi cambio revisable" });
});

test("conexión incierta no repite solicitud; recarga muestra lo confirmado por servidor", async ({ page }) => {
  const seen = await fixture(page); const dialog = await openDrivers(page);
  await draftRequest(page, dialog); seen.failNext("CONNECTION_LOST", 503, true, true);
  await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("El borrador se conserva");
  await expect(dialog.getByLabel("Motivo del uso temporal")).toHaveValue("Cobertura de turno");
  await expect(dialog.getByRole("button", { name: "Enviar solicitud", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Recargar choferes", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Enviar solicitud", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog.getByRole("cell", { name: "Pendiente", exact: true })).toBeVisible();
  expect(seen.writes).toHaveLength(1); expect(seen.entries()).toHaveLength(1);
});

test("historial pagina en servidor y una respuesta de otro vehículo bloquea datos y acciones", async ({ page }) => {
  const seen = await fixture(page, { authorizations: Array.from({ length: 23 }, (_, index) => authorization(index + 1)) });
  const dialog = await openDrivers(page);
  await expect(dialog.getByRole("cell", { name: "Pendiente", exact: true })).toHaveCount(20);
  await dialog.getByRole("button", { name: "Historial siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 2 de 2", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Pendiente", exact: true })).toHaveCount(3);
  seen.malformedWorkspace(); await dialog.getByRole("button", { name: "Recargar choferes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("no permitió verificar");
  await expect(dialog.getByRole("button", { name: "Solicitar uso temporal", exact: true })).toHaveCount(0);
  expect(seen.writes).toEqual([]); expect(seen.unexpected).toEqual([]);
});

test("cambiar empresa aborta solicitud de chofer y descarta su respuesta tardía", async ({ page }) => {
  await page.goto("/tests/v17-fleet/harness.html");
  await page.evaluate(async () => { const module = await import("/tests/v17-fleet/fleet-drivers-context-harness.tsx"); module.mountFleetDriversHarness(); });
  await page.getByRole("button", { name: "Acciones de FLOTA-A", exact: true }).click();
  await page.getByRole("menuitem", { name: "Choferes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choferes del vehículo", exact: true });
  await dialog.getByRole("button", { name: "Cambiar chofer habitual" }).click();
  await choose(page, dialog, "Chofer habitual", "Chofer de A");
  await dialog.getByLabel("Motivo del cambio de chofer").fill("Borrador exclusivo de A");
  await dialog.getByRole("button", { name: "Guardar habitual", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.v17FleetDriversHarness?.snapshot().writes)).toBe(1);
  await expect(dialog.getByRole("button", { name: "Cerrar choferes" })).toBeDisabled();
  await page.evaluate(() => window.v17FleetDriversHarness?.switchContext());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "FLOTA-B", exact: true })).toBeVisible();
  await page.evaluate(async () => { window.v17FleetDriversHarness?.resolveOriginal(); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => window.v17FleetDriversHarness?.snapshot().aborted)).toBe(true);
  await expect(page.getByText("Borrador exclusivo de A", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
