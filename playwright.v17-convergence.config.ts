import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-convergence",
  outputDir: join(tmpdir(), `v17-convergence-${process.pid}`),
  timeout: 45_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4187",
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4187",
    url: "http://127.0.0.1:4187/tests/v17-convergence/harness.html",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_APP_ENV: "development",
      VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
      MT01B_AUTH_MODE: "LEGACY",
      MT01B_TENANT_SWITCH_ENABLED: "false",
      VITE_MT01B2_CLIENT_ENABLED: "false",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "firefox-mobile", use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
