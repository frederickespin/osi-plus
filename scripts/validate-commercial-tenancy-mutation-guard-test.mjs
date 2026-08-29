import assert from "node:assert/strict";
import fs from "node:fs";
import { validateCommercialTenancyMutationGuard } from "./validate-commercial-tenancy-mutation-guard.mjs";

const read = (file) => fs.readFileSync(file, "utf8");
const baseline = new Map([
  ["api/_lib/commercialTenancyMutation.js", read("api/_lib/commercialTenancyMutation.js")],
  ["api/clients/index.js", read("api/clients/index.js")],
  ["api/projects/index.js", read("api/projects/index.js")],
  ["api/k/project-validate.js", read("api/k/project-validate.js")],
  ["api/k/project-release.js", read("api/k/project-release.js")],
  [".env.example", read(".env.example")],
  [".github/workflows/ci.yml", read(".github/workflows/ci.yml")],
  ["vercel.json", read("vercel.json")],
]);
let assertions = 0;

function mustFail(label, relative, mutate) {
  const overrides = new Map(baseline);
  overrides.set(relative, mutate(overrides.get(relative)));
  assert.throws(() => validateCommercialTenancyMutationGuard({ overrides }), undefined, label);
  assertions += 1;
}

validateCommercialTenancyMutationGuard({ overrides: baseline });
assertions += 1;
mustFail("ruta sin gate", "api/clients/index.js", (value) => value.replace('if (req.method === "POST" && !requireCommercialTenancyMutation(req, res)) return;', ""));
mustFail("gate después de auth", "api/projects/index.js", (value) => value.replace('if (req.method === "POST" && !requireCommercialTenancyMutation(req, res)) return;', "").replace("  if (!auth) return;", '  if (!auth) return;\n  if (req.method === "POST" && !requireCommercialTenancyMutation(req, res)) return;'));
mustFail("modo Production añadido", "api/_lib/commercialTenancyMutation.js", (value) => value.replace('LOCAL_ONLY: "LOCAL_ONLY",', 'LOCAL_ONLY: "LOCAL_ONLY",\n  PRODUCTION_WRITE: "PRODUCTION_WRITE",'));
mustFail("host falsificable", "api/_lib/commercialTenancyMutation.js", (value) => value.replace("request?.socket?.localAddress", 'request?.headers?.host'));
mustFail("Vercel no bloqueado", "api/_lib/commercialTenancyMutation.js", (value) => value.replace('if (hasVercelMarker(env)) {', 'if (false && hasVercelMarker(env)) {'));
mustFail("default activo", ".env.example", (value) => value.replace('COMMERCIAL_TENANCY_MUTATION_MODE="DISABLED"', 'COMMERCIAL_TENANCY_MUTATION_MODE="LOCAL_ONLY"'));
mustFail("CI sin prueba", ".github/workflows/ci.yml", (value) => value.replaceAll("npm run test:commercial-tenancy-mutation-gate", "node -e true"));
mustFail("CORS global restaurado", "vercel.json", (value) => value.replace('"headers": []', '"headers": [{"source":"/api/(.*)","headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]}]'));

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
