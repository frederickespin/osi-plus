import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "de5e8460c5da4e7f1c1fe42836b7ab488f67dd42";
const allowedBackendChanges = new Set([
  "api/_lib/adminIdentityInvitationDomain.js",
  "api/_lib/adminIdentityInvitationHttp.js",
  "api/_lib/adminMembershipAccess.js",
  "api/_lib/adminMembershipDomain.js",
  "api/_lib/adminMembershipHttp.js",
  "api/_lib/authHttp.js",
  "api/_lib/authOrigin.js",
  "api/_lib/commercialTenancyMutation.js",
  "api/_lib/commercialTenancyWrite.js",
  "api/_lib/crmCaseMutationDomain.js",
  "api/_lib/crmCaseMutationHttp.js",
  "api/_lib/crmClientOptions.js",
  "api/_lib/crmHttpHeaders.js",
  "api/_lib/crmOwnerCatalogHttp.js",
  "api/_lib/crmPipelineAccess.js",
  "api/_lib/crmPipelineRead.js",
  "api/_lib/crmPipelineReadHttp.js",
  "api/_lib/http.js",
  "api/_lib/membershipAuthorization.js",
  "api/_lib/pipelineCaseMutationHttp.js",
  "api/_lib/rbac.js",
  "api/_lib/v17CommercialCrmPreviewAuth.js",
  "api/_lib/v17CommercialCrmProductionAuth.js",
  "api/_lib/v17ProductionPilotGate.js",
  "api/auth/login.js",
  "api/auth/me.js",
  "api/admin/memberships/index.js",
  "api/admin/memberships/[membershipRef]/index.js",
  "api/admin/identity-invitations/index.js",
  "api/admin/identity-invitations/[invitationRef]/index.js",
  "api/auth/admin-invitations/activate.js",
  "api/clients/index.js",
  "api/crm/client-options.js",
  "api/crm/pipeline-summary.js",
  "api/crm/pipeline-cases/[id].js",
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[caseKey]/allowed-transitions.js",
  "api/crm/pipeline-cases/[caseKey]/assign-owner.js",
  "api/crm/pipeline-cases/[caseKey]/index.js",
  "api/crm/pipeline-cases/[caseKey]/transition.js",
  "api/crm/pipeline-cases/[caseKey]/unassign-owner.js",
  "api/k/project-release.js",
  "api/k/project-validate.js",
  "api/projects/index.js",
]);
const requiredApps = ["commercial-crm", "coordination", "operations", "materials-equipment", "workshop", "administration", "human-resources", "osi-survey"];
const allowedPrismaChanges = new Set([
  "prisma/schema.prisma",
  "prisma/migrations/20260821010000_v17_pipeline_case_public_ref/migration.sql",
  "prisma/migrations/20260824010000_v17_client_public_ref_case_mutations/migration.sql",
  "prisma/migrations/20260827010000_v17_tenant_membership_public_ref/migration.sql",
  "prisma/migrations/20260827020000_v17_admin_identity_invitation/migration.sql",
]);
function fail(message) { throw new Error(`V17_HUB_GUARD_FAILED: ${message}`); }
function text(path) { return readFileSync(path, "utf8"); }

const migrations = readdirSync(join("prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
if (migrations.length !== 21) fail(`expected 21 migrations, found ${migrations.length}`);
const migrationChanges = execFileSync("git", ["diff", "--name-only", BASE, "--", "prisma/migrations"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
if (migrationChanges.some((path) => !allowedPrismaChanges.has(path))) fail("canonical migrations changed outside V17-CASE-PUBLIC-REF");

const mode = text(join("src", "hub", "hubMode.ts"));
if (!mode.includes('DISABLED: "DISABLED"') || !mode.includes('LOCAL_ONLY: "LOCAL_ONLY"') || !mode.includes('PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE')) fail("strict gate values missing");
if (!mode.includes('raw === undefined || raw === OSI_HUB_MODES.DISABLED')) fail("DISABLED is not the default");
if (!mode.includes('key.startsWith("VERCEL")')) fail("gate does not reject every VERCEL* environment key");
if (!mode.includes('hostname === "[::1]"')) fail("gate does not require the literal IPv6 loopback hostname");
const app = text(join("src", "App.tsx"));
if (!app.includes("const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))")) fail("Hub is not lazy");
if (/import\s+HubWorkspace\s+from/.test(app)) fail("Hub has an eager runtime import");

const productionAuth = text(join("api", "_lib", "v17CommercialCrmProductionAuth.js"));
if (!productionAuth.includes("CRM_PIPELINE_MUTATION_MODES.DISABLED")) fail("Production Read does not keep CRM mutations disabled");
if (!productionAuth.includes("COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED")) fail("Production Read does not keep general commercial mutations disabled");
if (!productionAuth.includes("resolveCrmPipelineContext")) fail("Production Read does not revalidate the canonical CRM context");

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
if (/ADD_TAGS|ADD_ATTR|dangerouslySetInnerHTML|fixture|mock|offline.?queue|password|token/i.test(hubSources)) fail("Hub source contains unsafe rendering, fixtures, queues, or credentials");

const catalogRoutes = [...catalog.matchAll(/route:\s*"([^"]+)"/g)].map((match) => match[1]);
if (catalogRoutes.length !== requiredApps.length || catalogRoutes.some((route) => !/^\/[a-z][a-z-]*$/.test(route))) fail("catalog contains a missing or unsafe route");
if (!catalog.includes('appId: "osi-survey"') || !catalog.includes("baselineRoles: []")) fail("OSi Survey has implicit role authorization");

const changed = execFileSync("git", ["diff", "--name-only", BASE, "--"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
if (changed.some((path) => (path.startsWith("api/") && !allowedBackendChanges.has(path)) || (path.startsWith("prisma/") && !allowedPrismaChanges.has(path)) || path.startsWith("src/data/"))) fail("forbidden backend, unauthorized Prisma, or mock change");
console.log(JSON.stringify({ ok: true, migrations: migrations.length, applications: requiredApps.length, changedFiles: changed.length }));
