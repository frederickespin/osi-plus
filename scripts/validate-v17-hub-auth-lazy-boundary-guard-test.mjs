import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const guard = resolve("scripts/validate-v17-hub-auth-lazy-boundary-guard.mjs");
const files = [
  "src/App.tsx",
  "src/components/auth/CanonicalAccessDenied.tsx",
  "src/hub/hubRouteAccess.ts",
  "src/hub/hubAccess.ts",
  "src/hub/appCatalog.ts",
  "src/hub/HubWorkspace.tsx",
  "scripts/validate-v17-commercial-crm-guard.mjs",
  "scripts/validate-v17-hub-auth-lazy-boundary-guard.mjs",
  "index.html",
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "v17-hub-auth-lazy-"));
  for (const path of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(path, "utf8"));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [guard], {
    encoding: "utf8",
    env: { ...process.env, V17_HUB_AUTH_LAZY_GUARD_ROOT: root },
  });
}

function mutate(root, path, transform) {
  const target = join(root, path);
  writeFileSync(target, transform(readFileSync(target, "utf8")));
}

function negative(name, path, transform, expected) {
  const root = fixture();
  try {
    mutate(root, path, transform);
    const result = run(root);
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
    return name;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const positive = run(process.cwd());
assert.equal(positive.status, 0, positive.stderr);
const guardSource = readFileSync(guard, "utf8");
assert.doesNotMatch(guardSource, /from\s+["']node:child_process["']|git\s+(?:diff|merge-base)|const\s+BASE\s*=|allowed(?:Backend|Prisma|Global)?Changes|[0-9a-f]{40}/i);
const negatives = [
  negative("bypass previo", "src/App.tsx", (s) => s.replace("if (!routeDecision.allowed)", "if (false)"), /autorización previa fue eliminada/),
  negative("import eager", "src/App.tsx", (s) => s.replace("const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'));", "import HubWorkspace from '@/hub/HubWorkspace';"), /dejó de ser lazy|import eager/),
  negative("decisión dentro del lazy", "src/hub/HubWorkspace.tsx", (s) => `${s}\nevaluateHubAccess(selected, accessContext);\n`, /regresó al chunk lazy/),
  negative("ruta concede acceso", "src/hub/hubRouteAccess.ts", (s) => s.replace("evaluateHubAccess(application, context)", "({ allowed: true })"), /no comparten decisión pura/),
  negative("deny tardío", "src/hub/hubAccess.ts", (s) => s.replace("const denied = new Set(context.deniedPermissions);", "const denied = new Set(context.deniedPermissions);\n  const baseline = application.baselineRoles.includes(context.role);"), /deniedPermissions no prevalece/),
  negative("rol concede permiso", "src/hub/appCatalog.ts", (s) => s.replace("requiresExplicitPermissions: true", "requiresExplicitPermissions: false"), /roles baseline conceden/),
  negative("alias sin catálogo", "src/hub/appCatalog.ts", (s) => s.replace('routeAliases: ["/crm", "/sales/pipeline"]', 'routeAliases: ["/crm"]'), /rutas comerciales no comparten/),
  negative("storage como autoridad", "src/hub/hubRouteAccess.ts", (s) => `${s}\nlocalStorage.getItem("pipeline:view");\n`, /autoridad del navegador/),
  negative("prefetch protegido", "src/App.tsx", (s) => `${s}\nconst unsafe = '<link rel="prefetch">';\n`, /prefetch o preload/),
  negative("403 sin foco", "src/components/auth/CanonicalAccessDenied.tsx", (s) => s.replace("headingRef.current?.focus()", "void headingRef.current"), /403 accesible perdió/),
  negative("SHA fijo en guardia", "scripts/validate-v17-commercial-crm-guard.mjs", (s) => `${s}\nconst BASE = "0123456789012345678901234567890123456789";\n`, /SHA fijo o allowlist global/),
  negative("allowlist global", "scripts/validate-v17-commercial-crm-guard.mjs", (s) => `${s}\nconst allowedBackendChanges = new Set();\n`, /SHA fijo o allowlist global/),
];

console.log(JSON.stringify({ ok: true, positive: 1, negative: negatives.length, assertions: negatives.length + 1, negatives }));
