import { resolveAppEnv } from "../../src/lib/env";

const matrix = {
  local: resolveAppEnv({}, { hostname: "127.0.0.1" }),
  preview: resolveAppEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/example" }, { hostname: "preview.example.test" }),
  production: resolveAppEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, { hostname: "app.example.test" }),
  wrongProductionRef: resolveAppEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "feature/example" }, { hostname: "app.example.test" }),
  appEnvOnly: resolveAppEnv({ VITE_APP_ENV: "production" }, { hostname: "unknown.example.test" }),
  absent: resolveAppEnv({}, { hostname: "unknown.example.test" }),
};

document.getElementById("result")!.textContent = JSON.stringify(matrix);
