import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-tool-access",
  outputDir: join(tmpdir(), `v17-tool-access-${process.pid}`),
  timeout: 45_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4197", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block",
    launchOptions: process.env.TOOL_ACCESS_BROWSER_PATH ? { executablePath: process.env.TOOL_ACCESS_BROWSER_PATH } : {},
  },
  webServer: [
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4197",
      url: "http://127.0.0.1:4197/",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY: "http://127.0.0.1:59999",
        VITE_OSI_HUB_MODE: "LOCAL_ONLY",
        VITE_MT01B2_CLIENT_ENABLED: "false",
        VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED",
        VITE_CRM_PIPELINE_READ_MODE: "DISABLED",
        VITE_CRM_PIPELINE_CASE_MUTATION_MODE: "DISABLED",
        VITE_CRM_SURVEY_UI_MODE: "LOCAL_ONLY",
      },
    },
    {
      command: "node scripts/serve-v17-tool-access-preview.mjs",
      url: "http://127.0.0.1:4198/hub",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
