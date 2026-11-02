import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import routes from "./playwright.v17-warehouse-routes.config";

const routesServer = Array.isArray(routes.webServer) ? routes.webServer[0] : routes.webServer;
export default defineConfig({
  ...routes,
  testDir: "./tests/v17-warehouse-localities",
  outputDir: join(tmpdir(), `v17-warehouse-localities-${process.pid}`),
  use: { ...routes.use, baseURL: "http://127.0.0.1:4214" },
  webServer: {
    ...routesServer,
    command: "npm run dev -- --host 127.0.0.1 --port 4214 --strictPort",
    url: "http://127.0.0.1:4214/",
    env: { ...routesServer?.env, VITE_WAREHOUSE_LOCALITIES_UI_MODE: "LOCAL_ONLY" },
  },
});
