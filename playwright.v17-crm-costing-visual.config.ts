import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-crm-costing",
  outputDir: join(tmpdir(), `v17-crm-costing-visual-${process.pid}`),
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4195", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4195",
    url: "http://127.0.0.1:4195/experience-preview/costing",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-crm-costing-preview-07a" },
  },
});
