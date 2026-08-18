import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const safe = {
  VITE_API_PROXY: "http://127.0.0.1:59999",
  VITE_OSI_HUB_MODE: "LOCAL_ONLY",
  VITE_MT01B2_CLIENT_ENABLED: "false",
};

export default defineConfig({
  testDir: "./tests/v17-commercial-crm",
  outputDir: join(tmpdir(), `v17-commercial-crm-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 15 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4185", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: [
    { command: "npm run dev -- --host 127.0.0.1 --port 4185", url: "http://127.0.0.1:4185/", reuseExistingServer: false, timeout: 120_000, env: { ...safe, VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY" } },
    { command: "npm run dev -- --host 127.0.0.1 --port 4186", url: "http://127.0.0.1:4186/", reuseExistingServer: false, timeout: 120_000, env: { ...safe, VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED", VITE_CRM_PIPELINE_READ_MODE: "DISABLED" } },
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
