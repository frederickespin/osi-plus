import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/v17-crm-icp-ui",
  testMatch: "visual-preview.spec.ts",
  outputDir: join(tmpdir(), `v17-crm-icp-visual-${process.pid}`),
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4193", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4193",
    url: "http://127.0.0.1:4193/experience-preview/icp",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-crm-icp-ui-05c1" },
  },
});
