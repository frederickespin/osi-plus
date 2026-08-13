import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const desktop = [
  { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
];
const mobile = [
  { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  { name: "firefox-mobile", use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } } },
  { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
];

export default defineConfig({
  testDir: "./tests/crm-01b3b2",
  outputDir: join(tmpdir(), `crm01b3b2-playwright-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4182", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4182",
    url: "http://127.0.0.1:4182/tests/crm-01b3b2/harness.html",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" },
  },
  projects: [...desktop, ...mobile],
});
