import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-erp-crm-foundation",
  outputDir: join(tmpdir(), `v17-erp-crm-foundation-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4197", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4197",
    url: "http://127.0.0.1:4197/",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_PROXY: "http://127.0.0.1:59999",
      VITE_OSI_HUB_MODE: "LOCAL_ONLY",
      VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY",
      VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY",
      VITE_MT01B2_CLIENT_ENABLED: "false",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
