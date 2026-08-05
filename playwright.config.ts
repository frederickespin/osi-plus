import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/mt01b2b",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/tests/mt01b2b/harness.html",
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
