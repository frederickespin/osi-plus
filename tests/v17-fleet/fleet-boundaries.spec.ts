import { expect, test } from "@playwright/test";

test("una consulta anterior no reemplaza el filtro más reciente", async ({ page }) => {
  await page.goto("/tests/v17-fleet/harness.html");
  await page.evaluate(async () => { const module = await import("/tests/v17-fleet/fleet-context-harness.tsx"); module.mountFleetHarness(); });
  await expect(page.getByRole("button", { name: "VEHICULO-A", exact: true })).toBeVisible();
  await page.getByLabel("Buscar vehículos").fill("lento");
  await expect.poll(() => page.evaluate(() => window.v17FleetHarness?.snapshot().slowRequested)).toBe(true);
  await page.getByLabel("Buscar vehículos").fill("actual");
  await expect(page.getByRole("button", { name: "VEHICULO-ACTUAL", exact: true })).toBeVisible();
  await page.evaluate(async () => { window.v17FleetHarness?.resolveSlowList(); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect(page.getByRole("button", { name: "VEHICULO-TARDE", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.v17FleetHarness?.snapshot().slowAborted)).toBe(true);
});

test("cambio de empresa aborta escritura y descarta la respuesta de la empresa anterior", async ({ page }) => {
  await page.goto("/tests/v17-fleet/harness.html");
  await page.evaluate(async () => { const module = await import("/tests/v17-fleet/fleet-context-harness.tsx"); module.mountFleetHarness(); });
  await page.getByRole("button", { name: "VEHICULO-A", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ficha de vehículo", exact: true });
  await dialog.getByLabel("Modelo", { exact: true }).fill("Borrador A");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.v17FleetHarness?.snapshot().writes)).toBe(1);
  await page.evaluate(() => window.v17FleetHarness?.switchContext());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "VEHICULO-B", exact: true })).toBeVisible();
  await page.evaluate(async () => { window.v17FleetHarness?.resolveOriginalPatch(); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect(page.getByText("Borrador A", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "VEHICULO-A", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.v17FleetHarness?.snapshot().patchAborted)).toBe(true);
});

test("gate cerrado por defecto y prerequisitos incompletos ocultan la sección", async ({ page }) => {
  await page.goto("/tests/v17-fleet/harness.html");
  const results = await page.evaluate(async () => {
    const { isAdminFleetEnabled } = await import("/src/admin-fleet/mode.ts");
    const { availableAdministrationSections } = await import("/src/administration/administrationSections.ts");
    const { ADMIN_FLEET_BATCH } = await import("/shared/adminFleet.js");
    const { ADMIN_MEMBERSHIP_PREVIEW_BATCH } = await import("/shared/adminMembershipPreview.js");
    const preview = { VITE_ADMIN_FLEET_MODE: "PREVIEW_REHEARSAL", VITE_ADMIN_FLEET_BATCH: ADMIN_FLEET_BATCH, VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL", VITE_ADMIN_MEMBERSHIP_PREVIEW_BATCH: ADMIN_MEMBERSHIP_PREVIEW_BATCH, VITE_MT01B2_CLIENT_ENABLED: "false" };
    const runtime = { vercelEnvironment: "preview", gitBranch: "feature/v17-administration-fleet-19d" };
    const enabled = (environment: Record<string, unknown>, host = "synthetic.vercel.app", current = runtime) => isAdminFleetEnabled(environment, host, current);
    const flagsOnly = { VITE_ADMIN_FLEET_MODE: preview.VITE_ADMIN_FLEET_MODE, VITE_ADMIN_FLEET_BATCH: preview.VITE_ADMIN_FLEET_BATCH };
    return {
      absent: enabled({}), flagsOnly: enabled(flagsOnly), wrongBatch: enabled({ ...preview, VITE_ADMIN_FLEET_BATCH: "OTHER" }),
      wrongBranch: enabled(preview, undefined, { ...runtime, gitBranch: "feature/unknown" }), production: enabled(preview, undefined, { ...runtime, vercelEnvironment: "production" }),
      untrustedHost: enabled(preview, "synthetic.example.test"), clientOn: enabled({ ...preview, VITE_MT01B2_CLIENT_ENABLED: "true" }),
      preview: enabled(preview), consolidated: enabled(preview, undefined, { ...runtime, gitBranch: "feature/v17-consolidated-preview" }),
      localFlagOnly: enabled({ VITE_ADMIN_FLEET_MODE: "LOCAL_ONLY" }, "localhost", { vercelEnvironment: null, gitBranch: null }),
      local: enabled({ VITE_ADMIN_FLEET_MODE: "LOCAL_ONLY", VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY" }, "localhost", { vercelEnvironment: null, gitBranch: null }),
      sectionsWithIncompleteFlags: availableAdministrationSections({ access: false, fleet: enabled(flagsOnly), services: false, logistics: false, costing: false, communications: false, policies: false }, ["fleet:view", "fleet:edit"], []).map((section) => section.id),
    };
  });
  expect(results).toEqual({ absent: false, flagsOnly: false, wrongBatch: false, wrongBranch: false, production: false, untrustedHost: false, clientOn: false, preview: true, consolidated: true, localFlagOnly: false, local: true, sectionsWithIncompleteFlags: [] });
});
