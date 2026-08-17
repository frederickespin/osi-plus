import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "5c2c9a1fd0581f5386b79ab97c7289d4cd2e2b3d";
const requiredApps = ["commercial-crm", "coordination", "operations", "materials-equipment", "workshop", "administration", "human-resources", "osi-survey"];
function fail(message) { throw new Error(`V17_HUB_GUARD_FAILED: ${message}`); }
function text(path) { return readFileSync(path, "utf8"); }

const migrations = readdirSync(join("prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
if (migrations.length !== 17) fail(`expected 17 migrations, found ${migrations.length}`);
const migrationChanges = execFileSync("git", ["diff", "--name-only", BASE, "--", "prisma/migrations"], { encoding: "utf8" }).trim();
if (migrationChanges) fail("canonical migrations changed");

const mode = text(join("src", "hub", "hubMode.ts"));
if (!mode.includes('DISABLED: "DISABLED"') || !mode.includes('LOCAL_ONLY: "LOCAL_ONLY"')) fail("strict gate values missing");
if (!mode.includes('raw === undefined || raw === OSI_HUB_MODES.DISABLED')) fail("DISABLED is not the default");
const app = text(join("src", "App.tsx"));
if (!app.includes("const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))")) fail("Hub is not lazy");
if (/import\s+HubWorkspace\s+from/.test(app)) fail("Hub has an eager runtime import");

const packageJson = JSON.parse(text("package.json"));
if (packageJson.scripts?.["test:v17-hub:browser"] !== "playwright test -c playwright.v17-hub.config.ts") fail("canonical Hub browser command missing");
const workflow = text(join(".github", "workflows", "ci.yml"));
if (!workflow.includes("node scripts/validate-v17-hub-guard.mjs")) fail("CI does not execute the Hub guard");
if (!workflow.includes("run: npm run test:v17-hub:browser")) fail("CI does not execute the Hub browser matrix");

const catalog = text(join("src", "hub", "appCatalog.ts"));
for (const appId of requiredApps) if (!catalog.includes(`appId: "${appId}"`)) fail(`catalog missing ${appId}`);
if (/portal.client|portal-cliente|client-portal/i.test(catalog)) fail("employee catalog contains Client Portal");
const hubSources = ["appCatalog.ts", "hubAccess.ts", "HubWorkspace.tsx", "OsiSurveyInactive.tsx"].map((name) => text(join("src", "hub", name))).join("\n");
if (/x-osi-|localStorage|sessionStorage|URLSearchParams|\/api\//i.test(hubSources)) fail("Hub trusts browser authority or calls an API");

const changed = execFileSync("git", ["diff", "--name-only", BASE, "--"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
if (changed.some((path) => path.startsWith("api/") || path.startsWith("prisma/") || path.startsWith("src/data/"))) fail("forbidden backend, schema, migration, or mock change");
console.log(JSON.stringify({ ok: true, migrations: migrations.length, applications: requiredApps.length, changedFiles: changed.length }));
