import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-warehouses",
  outputDir: join(tmpdir(), `v17-warehouses-${process.pid}`),
  timeout: 45_000,
  globalTimeout: 6 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4210", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4210 --strictPort",
    url: "http://127.0.0.1:4210/",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_PROXY: "http://127.0.0.1:59999",
      VITE_OSI_HUB_MODE: "LOCAL_ONLY",
      VITE_MT01B2_CLIENT_ENABLED: "false",
      VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
      VITE_CRM_PIPELINE_READ_MODE: "DISABLED",
      VITE_CRM_PIPELINE_CASE_MUTATION_MODE: "DISABLED",
      VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "DISABLED",
      VITE_ADMIN_IDENTITY_INVITATION_MODE: "DISABLED",
      VITE_ADMIN_USER_IDENTITY_MODE: "DISABLED",
      VITE_ADMIN_FLEET_MODE: "DISABLED",
      VITE_CRM_SERVICES_UI_MODE: "DISABLED",
      VITE_LOGISTICS_ENGINE_UI_MODE: "DISABLED",
      VITE_COSTING_UI_MODE: "DISABLED",
      VITE_COMMUNICATIONS_MODE: "DISABLED",
      VITE_PERSONNEL_POLICIES_UI_MODE: "DISABLED",
      VITE_CRM_SURVEY_UI_MODE: "DISABLED",
      VITE_MATERIALS_INVENTORY_UI_MODE: "LOCAL_ONLY",
      VITE_TOOLS_EQUIPMENT_UI_MODE: "LOCAL_ONLY",
      VITE_QUOTE_UI_MODE: "DISABLED",
      VITE_COMMERCIAL_RELATIONSHIPS_MODE: "DISABLED",
      VITE_CLIENT_TEMPORARY_ACCESS_MODE: "DISABLED",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
