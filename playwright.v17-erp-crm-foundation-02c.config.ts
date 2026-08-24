import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const common = {
  VITE_API_PROXY: "http://127.0.0.1:59999",
  VITE_MT01B2_CLIENT_ENABLED: "false",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
};

export default defineConfig({
  testDir: "./tests/v17-erp-crm-foundation-02c",
  outputDir: join(tmpdir(), `v17-erp-crm-foundation-02c-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://production.localhost:4196", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: [
    {
      command: "npm run dev -- --host 0.0.0.0 --port 4196",
      url: "http://127.0.0.1:4196/",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...common,
        VITE_OSI_HUB_MODE: "PRODUCTION_READ",
        VITE_CRM_PIPELINE_CLIENT_MODE: "PRODUCTION_READ",
        VITE_CRM_PIPELINE_READ_MODE: "PRODUCTION_READ",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4197",
      url: "http://127.0.0.1:4197/",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...common,
        VITE_OSI_HUB_MODE: "DISABLED",
        VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
        VITE_CRM_PIPELINE_READ_MODE: "DISABLED",
      },
    },
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
