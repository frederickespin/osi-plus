import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/v17-tools-preview",
  outputDir: join(tmpdir(), `v17-tools-preview-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 6 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4185", trace: "off", screenshot: "only-on-failure", video: "off", serviceWorkers: "block" },
  webServer: useExternalServer ? undefined : {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4185",
    url: "http://127.0.0.1:4185/experience-preview/tools",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/v17-tools-consolidated-11b",
      VITE_API_PROXY: "http://127.0.0.1:59999",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  ],
});
