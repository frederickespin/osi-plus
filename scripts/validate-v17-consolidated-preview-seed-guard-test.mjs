import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./v17-consolidated-preview-seed.mjs", import.meta.url));
const expectedDatabase = "v17_consolidated_preview_10b";
const base = {
  ...process.env,
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  V17_PREVIEW_SEED_MODE: "PREVIEW_REHEARSAL",
  V17_PREVIEW_SEED_BATCH: "V17-PREVIEW-ENVIRONMENT-10B",
  DATABASE_URL: `postgresql://preview:synthetic@example.invalid/${expectedDatabase}?schema=osi`,
  DIRECT_URL: `postgresql://preview:synthetic@example.invalid/${expectedDatabase}?schema=osi`,
};

function rejects(name, changes, marker) {
  const env = { ...base, ...changes };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0, `${name}: debe fallar cerrado`);
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`V17_PREVIEW_SEED_BLOCKED:${marker}`), `${name}: motivo estable`);
}

rejects("modo desconocido", { V17_PREVIEW_SEED_MODE: "PREVIEW" }, "MODE_INVALID");
rejects("batch alterado", { V17_PREVIEW_SEED_BATCH: "V17-PREVIEW-ENVIRONMENT-10B " }, "BATCH_INVALID");
rejects("Node Production", { NODE_ENV: "production" }, "PRODUCTION_ENVIRONMENT");
rejects("Vercel Production", { VERCEL_ENV: "production" }, "PRODUCTION_ENVIRONMENT");
rejects("base ausente", { DATABASE_URL: undefined, DIRECT_URL: undefined }, "DATABASE_URL_MISSING");
rejects("base distinta", { DATABASE_URL: "postgresql://preview:synthetic@example.invalid/other?schema=osi", DIRECT_URL: undefined }, "DATABASE_INVALID");
rejects("schema ausente", { DATABASE_URL: `postgresql://preview:synthetic@example.invalid/${expectedDatabase}`, DIRECT_URL: undefined }, "SCHEMA_INVALID");
rejects("host productivo conocido", { DATABASE_URL: `postgresql://preview:synthetic@ep-fragrant-night.example.invalid/${expectedDatabase}?schema=osi`, DIRECT_URL: undefined }, "KNOWN_PRODUCTION_TARGET");

const source = readFileSync(script, "utf8");
assert.match(source, /current_setting\('neon\.branch_id'/, "revalida branch en PostgreSQL");
assert.match(source, /migrations\.length !== 29/, "exige 29 migraciones completas");
assert.match(source, /randomBytes\(36\)/, "genera contraseñas sintéticas fuertes");
assert.doesNotMatch(source, /password\s*:\s*["'][^"']+["']/, "sin password hard-coded");

console.log(JSON.stringify({ ok: true, negatives: 8, runtimeIdentityChecks: 2, productionApiEnabled: false }));
