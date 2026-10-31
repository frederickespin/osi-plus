import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-logistics-engine", testMatch: "transport.spec.ts",
  outputDir: join(tmpdir(), `v17-transport-${process.pid}`), timeout: 60_000, globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 }, workers: 1, retries: 0, forbidOnly: true, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4207", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4207", url: "http://127.0.0.1:4207/", reuseExistingServer: false, timeout: 120_000,
    env: { VITE_API_PROXY: "http://127.0.0.1:59999", VITE_OSI_HUB_MODE: "LOCAL_ONLY", VITE_MT01B2_CLIENT_ENABLED: "false", VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY", VITE_CRM_PIPELINE_CASE_MUTATION_MODE: "DISABLED", VITE_CRM_SERVICES_UI_MODE: "DISABLED", VITE_CRM_SURVEY_UI_MODE: "DISABLED", VITE_MATERIALS_INVENTORY_UI_MODE: "DISABLED", VITE_TOOLS_EQUIPMENT_UI_MODE: "DISABLED", VITE_LOGISTICS_ENGINE_UI_MODE: "LOCAL_ONLY", VITE_COSTING_UI_MODE: "LOCAL_ONLY", VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY", VITE_ADMIN_IDENTITY_INVITATION_MODE: "DISABLED" },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
