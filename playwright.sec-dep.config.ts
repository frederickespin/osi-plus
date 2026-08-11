import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/sec-dep-01",
  outputDir: process.env.RUNNER_TEMP ?? join(tmpdir(), `sec-dep-01-playwright-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["./scripts/sec-dep-01-browser-ci-reporter.mjs"]],
  use: {
    baseURL: "http://127.0.0.1:4176",
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4176",
    url: "http://127.0.0.1:4176/tests/sec-dep-01/harness.html?module=center",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MT01B_AUTH_MODE: "LEGACY",
      MT01B_TENANT_SWITCH_ENABLED: "false",
      VITE_MT01B2_CLIENT_ENABLED: "false",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
