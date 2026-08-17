import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const commonEnv = { VITE_API_PROXY: "http://127.0.0.1:59999", VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED", VITE_MT01B2_CLIENT_ENABLED: "false" };

export default defineConfig({
  testDir: "./tests/v17-hub",
  outputDir: join(tmpdir(), `v17-hub-playwright-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4183", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: [
    { command: "npm run dev -- --host 127.0.0.1 --port 4183", url: "http://127.0.0.1:4183/tests/v17-hub/mode-harness.html", reuseExistingServer: false, timeout: 120_000, env: { ...commonEnv, VITE_OSI_HUB_MODE: "LOCAL_ONLY" } },
    { command: "npm run dev -- --host 127.0.0.1 --port 4184", url: "http://127.0.0.1:4184/", reuseExistingServer: false, timeout: 120_000, env: { ...commonEnv, VITE_OSI_HUB_MODE: "DISABLED" } },
  ],
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "firefox-mobile", use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});

