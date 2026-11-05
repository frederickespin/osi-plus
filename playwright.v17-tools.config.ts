import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/v17-hub",
  testMatch: "hub.spec.ts",
  outputDir: join(tmpdir(), `v17-tools-playwright-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  grep: /Herramientas|Calculadora arqueológica|alias histórico|calculadora de cajas/u,
  use: { baseURL: "http://127.0.0.1:4183", trace: "off", screenshot: "only-on-failure", video: "off", serviceWorkers: "block" },
  webServer: useExternalServer ? undefined : {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4183",
    url: "http://127.0.0.1:4183/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_PROXY: "http://127.0.0.1:59999",
      VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
      VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY",
      VITE_ADMIN_IDENTITY_INVITATION_MODE: "LOCAL_ONLY",
      VITE_MT01B2_CLIENT_ENABLED: "false",
      VITE_OSI_HUB_MODE: "LOCAL_ONLY",
      VITE_CRM_SURVEY_UI_MODE: "LOCAL_ONLY",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
