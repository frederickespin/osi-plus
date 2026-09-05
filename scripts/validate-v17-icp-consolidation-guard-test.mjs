import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17IcpConsolidationGuard } from "./validate-v17-icp-consolidation-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
const files = new Map([
  ["src/crm-icp-v2/api.ts", read("src/crm-icp-v2/api.ts")],
  ["api/_lib/crmIcpV2Domain.js", read("api/_lib/crmIcpV2Domain.js")],
  ["api/_lib/crmIcpV2ApiDomain.js", read("api/_lib/crmIcpV2ApiDomain.js")],
  ["api/_lib/crmIcpV2ApiHttp.js", read("api/_lib/crmIcpV2ApiHttp.js")],
  ["src/crm-icp-v2/IcpIntakeForm.tsx", read("src/crm-icp-v2/IcpIntakeForm.tsx")],
  ["src/crm-icp-v2/clientMode.ts", read("src/crm-icp-v2/clientMode.ts")],
  ["playwright.v17-crm-icp-visual.config.ts", read("playwright.v17-crm-icp-visual.config.ts")],
  ["docs/V17-CRM-ICP-05C1-UI-CONTRACT.md", read("docs/V17-CRM-ICP-05C1-UI-CONTRACT.md")],
  ["prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql", read("prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql")],
]);

let assertions = 0;
function rejected(name, path, transform) {
  const overrides = Object.fromEntries(files);
  overrides[path] = transform(overrides[path]);
  assert.throws(() => validateV17IcpConsolidationGuard({ overrides }), /V17_(?:ICP_CONSOLIDATION|CRM_ICP)/, name);
  assertions += 1;
}

assert.equal(validateV17IcpConsolidationGuard().ok, true); assertions += 1;
rejected("membershipRef omitida", "src/crm-icp-v2/api.ts", (text) => text.replaceAll('"X-OSI-Membership-Ref": membershipRef', '"X-Removed-Ref": membershipRef'));
rejected("AuthorizationContext omitido", "api/_lib/crmIcpV2ApiHttp.js", (text) => text.replaceAll("resolveCrmPipelineContext", "resolveUntrustedContext"));
rejected("revalidación User omitida", "api/_lib/crmIcpV2ApiDomain.js", (text) => text.replace('AND m."user_id"=${userId}', ""));
rejected("modo acepta autoridad cliente", "api/_lib/crmIcpV2Domain.js", (text) => text.replace("if (command.mode !== derivedMode) fail", "if (false) fail"));
rejected("paradas visibles", "src/crm-icp-v2/api.ts", (text) => text.replace("additionalStops: []", "additionalStops: draft.additionalStops"));
rejected("volumen reintroducido", "src/crm-icp-v2/IcpIntakeForm.tsx", (text) => `${text}\nconst forbidden = "Volumen CBM";`);
rejected("Production activada", "api/_lib/crmIcpV2Domain.js", (text) => text.replace("productionApiEnabled: false", "productionApiEnabled: true"));
rejected("Preview amplía rama", "src/crm-icp-v2/clientMode.ts", (text) => text.replace('CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature/v17-auth-users-tenant-first"', 'CRM_ICP_V2_UI_PREVIEW_BRANCH = "main"'));
rejected("arnés visual usa rama histórica", "playwright.v17-crm-icp-visual.config.ts", (text) => text.replace('VERCEL_GIT_COMMIT_REF: "feature/v17-auth-users-tenant-first"', 'VERCEL_GIT_COMMIT_REF: "feature/v17-crm-icp-ui-05c1"'));
rejected("migración reescrita", "prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql", (text) => `${text}\n-- altered`);

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
