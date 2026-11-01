import { expect, type Page } from "@playwright/test";

const MEMBERSHIP_REF = "82222222-2222-4222-8222-222222222222";
const READ_PERMISSIONS: Readonly<Record<string, string>> = {
  "/api/materials/warehouses": "inventory:stock:view",
  "/api/materials/catalog": "inventory:catalog:view",
  "/api/materials/movements": "inventory:stock:view",
  "/api/materials/reservations": "inventory:reservation:manage",
  "/api/materials/recipes": "inventory:recipes:view",
  "/api/materials/requirements": "inventory:recipes:view",
  "/api/assets/instances": "assets:instance:view",
  "/api/assets/models": "assets:model:view",
  "/api/assets/external/offers": "assets:external:view",
};

// Isolated synthetic responses only. These tests do not contact a deployment or database.
export async function session(page: Page, initialPermissions: readonly string[], initialDenied: readonly string[] = [], initialWarehouses: readonly unknown[] = []) {
  let permissions = initialPermissions;
  let deniedPermissions = initialDenied;
  let warehouses = initialWarehouses;
  const apiRequests: string[] = [];
  const resources: string[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.warehouses.test.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({
      name: "Almacenes sintético", role: "A", membershipRef,
      memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }],
    }));
  }, { membershipRef: MEMBERSHIP_REF });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    resources.push(path);
    if (path.startsWith("/api/")) apiRequests.push(path);
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json",
      headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" },
      body: JSON.stringify(body),
    });
    if (route.request().method() !== "GET") {
      unexpected.push(`${route.request().method()} ${path}`);
      return fulfill({ ok: false, error: "UNEXPECTED_TEST_MUTATION" }, 405);
    }
    if (path === "/api/auth/me") return fulfill({ ok: true, user: {
      name: "Almacenes sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions,
      membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A" },
      memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A", preferred: true }],
    } });
    expect(route.request().headers().authorization).toBe("Bearer synthetic.warehouses.test.token");
    const permission = READ_PERMISSIONS[path];
    if (!permission) {
      unexpected.push(`GET ${path}`);
      return fulfill({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 404);
    }
    if (!permissions.includes(permission) || deniedPermissions.includes(permission)) {
      unexpected.push(`FORBIDDEN GET ${path}`);
      return fulfill({ ok: false, error: path.startsWith("/api/assets/") ? "ASSET_FORBIDDEN" : "MATERIALS_FORBIDDEN" }, 403);
    }
    if (path === "/api/materials/warehouses") return fulfill({ ok: true, data: warehouses });
    if (["/api/materials/catalog", "/api/materials/movements", "/api/assets/instances"].includes(path)) {
      return fulfill({ ok: true, data: { page: 1, pageSize: 25, total: 0, items: [] } });
    }
    return fulfill({ ok: true, data: [] });
  });
  return {
    apiRequests, resources, unexpected,
    updateAuthorization(nextPermissions: readonly string[], nextDenied: readonly string[] = []) { permissions = nextPermissions; deniedPermissions = nextDenied; },
    setWarehouses(rows: readonly unknown[]) { warehouses = rows; },
  };
}

export function nonAuth(requests: readonly string[]) { return requests.filter((path) => path !== "/api/auth/me"); }

export async function selectSection(page: Page, path: string) {
  const mobileSelect = page.getByLabel("Sección de Almacenes", { exact: true });
  if (await mobileSelect.isVisible()) await mobileSelect.selectOption(path);
  else await page.getByRole("navigation", { name: "Secciones de Almacenes", exact: true }).locator(`a[href="${path}"]`).click();
}
