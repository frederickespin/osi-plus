import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const baseURL = process.env.V17_PERSONNEL_POLICIES_PREVIEW_URL;
if (!baseURL) throw new Error("V17_PERSONNEL_POLICIES_PREVIEW_URL_REQUIRED");

export default defineConfig({
  testDir: "./tests/v17-personnel-policies-preview",
  outputDir: join(tmpdir(), `v17-personnel-policies-preview-${process.pid}`),
  timeout: 60_000,
  globalTimeout: 20 * 60_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL,
    extraHTTPHeaders: { "x-vercel-skip-toolbar": "1" },
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "firefox-mobile",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
      },
    },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
