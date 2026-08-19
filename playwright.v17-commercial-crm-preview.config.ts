import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const previewEnvironment = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feature/v17-commercial-crm-preview",
  VITE_API_PROXY: "http://127.0.0.1:59999",
  VITE_APP_ENV: "preview",
  VITE_OSI_HUB_MODE: "PREVIEW_REHEARSAL",
  VITE_CRM_PIPELINE_CLIENT_MODE: "PREVIEW_REHEARSAL",
  VITE_CRM_PIPELINE_READ_MODE: "PREVIEW_REHEARSAL",
  VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH: "V17-COMMERCIAL-CRM-PREVIEW-01",
  VITE_MT01B2_CLIENT_ENABLED: "false",
};

export default defineConfig({
  testDir: "./tests/v17-commercial-crm-preview",
  outputDir: join(tmpdir(), `v17-commercial-crm-preview-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["./scripts/v17-commercial-crm-preview-browser-ci-reporter.mjs"],
  ],
  use: {
    baseURL: "http://preview.localhost:4290",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run dev -- --host 0.0.0.0 --port 4290",
    url: "http://127.0.0.1:4290/",
    reuseExistingServer: false,
    timeout: 120_000,
    env: previewEnvironment,
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
