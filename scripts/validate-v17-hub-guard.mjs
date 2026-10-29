import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMigrationFiles } from "./canonical-migrations.mjs";
import { validateHubCatalog } from "./hub-catalog-contract.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`V17_HUB_GUARD_FAILED:${message}`); };

export function validateV17HubGuard({ root = process.cwd(), overrides = new Map() } = {}) {
  const read = (path) => overrides.get(path) ?? readFileSync(resolve(root, path), "utf8");
  // Validate the approved chain and current domain boundaries. A diff against the
  // original Hub checkpoint cannot classify the later approved ERP foundations.
  const migrations = validateMigrationFiles(root);
  invariant(migrations.indexOf("20260831010000_v17_crm_icp_foundation") === 21, "canonical ICP migration order invalid");

  const mode = read("src/hub/hubMode.ts");
  for (const marker of ['DISABLED: "DISABLED"', 'LOCAL_ONLY: "LOCAL_ONLY"', 'PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE']) invariant(mode.includes(marker), "strict gate values missing");
  invariant(mode.includes('raw === undefined || raw === OSI_HUB_MODES.DISABLED'), "DISABLED is not the default");
  invariant(mode.includes('key.startsWith("VERCEL")'), "gate does not reject every VERCEL environment key");
  invariant(mode.includes('hostname === "[::1]"'), "gate does not require the literal IPv6 loopback hostname");

  const app = read("src/App.tsx");
  invariant(app.includes("const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))") && !/import\s+HubWorkspace\s+from/.test(app), "Hub is not lazy");
  const denied = app.indexOf("routeState.status === 'DENIED' || !routeDecision.allowed");
  invariant(denied >= 0 && app.indexOf("<HubWorkspace") > denied, "Hub renders before route authorization");
  const productionAuth = read("api/_lib/v17CommercialCrmProductionAuth.js");
  invariant(productionAuth.includes("CRM_PIPELINE_MUTATION_MODES.DISABLED"), "Production Read does not keep CRM mutations disabled");
  invariant(productionAuth.includes("COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED"), "Production Read does not keep general commercial mutations disabled");
  invariant(productionAuth.includes("resolveCrmPipelineContext"), "Production Read does not revalidate the canonical CRM context");

  const catalog = read("src/hub/appCatalog.ts");
  const contract = validateHubCatalog(catalog);
  invariant(!/portal.client|portal-cliente|client-portal/i.test(catalog), "employee catalog contains Client Portal");
  const hubFiles = ["appCatalog.ts", "hubAccess.ts", "hubRouteAccess.ts", "hubAvailability.ts", "HubWorkspace.tsx", "OsiSurveyInactive.tsx", "OsiPlusMobileHub.tsx", "ExternalApplication.tsx"];
  const hubSources = hubFiles.map((name) => read(`src/hub/${name}`)).join("\n");
  invariant(!/x-osi-|localStorage|sessionStorage|URLSearchParams|\/api\//i.test(hubSources), "Hub trusts browser authority or calls an API");
  invariant(!/ADD_TAGS|ADD_ATTR|dangerouslySetInnerHTML|fixture|mock|offline.?queue|password|token/i.test(hubSources), "Hub contains unsafe rendering, fixtures, queues, or credentials");
  invariant(!/(?:from\s*|import\s*\()["'][^"']*(?:\/api\/|\/data\/)/.test(hubSources), "Hub imports backend or mock authority");
  const availability = read("src/hub/hubAvailability.ts");
  invariant(/authorizedApplications\.filter\(\(application\) => availability\[application\.appId\] === true\)/.test(availability), "availability must only narrow the authorized catalog");
  const workspace = read("src/hub/HubWorkspace.tsx");
  invariant(/availableHubApplications\(visible,/.test(workspace) && /visibleHubApplications\(HUB_APPLICATIONS, accessContext\)/.test(workspace), "availability bypasses authorization");
  invariant(/navigationApplications=\{rootAvailable\}/.test(workspace), "ERP navigation must use the available authorized catalog");
  const external = read("src/hub/ExternalApplication.tsx");
  invariant(/target="_blank"/.test(external) && /rel="noopener noreferrer"/.test(external) && /referrerPolicy="no-referrer"/.test(external), "external application isolation missing");

  const packageJson = JSON.parse(read("package.json"));
  invariant(packageJson.scripts?.["test:v17-hub:browser"] === "playwright test -c playwright.v17-hub.config.ts", "canonical Hub browser command missing");
  const workflow = read(".github/workflows/ci.yml");
  invariant(workflow.includes("node scripts/validate-v17-hub-guard.mjs"), "CI does not execute the Hub guard");
  invariant(workflow.includes("run: npm run test:v17-hub:browser"), "CI does not execute the Hub browser matrix");
  return Object.freeze({ ok: true, migrations: migrations.length, applications: contract.applications.length, suites: contract.suites.length, routes: contract.routes.length, authority: "CANONICAL_CONTRACT" });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(validateV17HubGuard()));
