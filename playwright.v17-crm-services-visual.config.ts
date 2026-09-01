import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-crm-services",
  outputDir: join(tmpdir(), `v17-crm-services-visual-${process.pid}`),
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4194", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4194",
    url: "http://127.0.0.1:4194/experience-preview/services",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-crm-services-preview-06a" },
  },
});
