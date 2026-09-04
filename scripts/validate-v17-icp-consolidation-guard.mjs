import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV17AuthUsersTenantFirstRepository } from "./validate-v17-auth-users-tenant-first-guard.mjs";
import { validateV17CrmIcpUiGuard } from "./validate-v17-crm-icp-ui-guard.mjs";

const MIGRATION = "prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql";
const MIGRATION_SHA256 = "d085a74f4be3bd7be727d182993598008f53f019c8f1d626863b987be6726f37";

function fail(message) { throw new Error(`V17_ICP_CONSOLIDATION_GUARD:${message}`); }
function source(root, overrides, path) { return overrides[path] ?? readFileSync(resolve(root, path), "utf8"); }

export function validateV17IcpConsolidationGuard({ root = process.cwd(), overrides = {} } = {}) {
  validateV17AuthUsersTenantFirstRepository(root);
  validateV17CrmIcpUiGuard({ root, overrides });

  const api = source(root, overrides, "src/crm-icp-v2/api.ts");
  const domain = source(root, overrides, "api/_lib/crmIcpV2Domain.js");
  const server = source(root, overrides, "api/_lib/crmIcpV2ApiDomain.js");
  const http = source(root, overrides, "api/_lib/crmIcpV2ApiHttp.js");
  const form = source(root, overrides, "src/crm-icp-v2/IcpIntakeForm.tsx");
  const mode = source(root, overrides, "src/crm-icp-v2/clientMode.ts");
  const visualConfig = source(root, overrides, "playwright.v17-crm-icp-visual.config.ts");
  const docs = source(root, overrides, "docs/V17-CRM-ICP-05C1-UI-CONTRACT.md");
  const migration = Buffer.from(source(root, overrides, MIGRATION), "utf8");

  if (!/getMembershipRef[\s\S]*membershipRefProvider[\s\S]*"X-OSI-Membership-Ref": membershipRef/.test(api)) {
    fail("el cliente ICP no transporta la Membership seleccionada");
  }
  if (!/resolveCrmPipelineContext/.test(http) || !/resolveActor\(tx, context, PERMS\.PIPELINE_CREATE\)/.test(server)) {
    fail("el ICP no consume y revalida el AuthorizationContext canónico");
  }
  if (!/m\."tenant_id"=\$\{tenantId\}\s+AND m\."id"=\$\{membershipId\}\s+AND m\."user_id"=\$\{userId\}/.test(server)) {
    fail("la revalidación no está ligada a Tenant, Membership y User");
  }
  if (!/deriveMode\(tenantCountryCode,[\s\S]*command\.mode !== derivedMode/.test(domain)) {
    fail("el modo no se deriva ni se verifica server-side");
  }
  if (!/additionalStops:\s*\[\]/.test(api) || /draft\.additionalStops/.test(api)) {
    fail("la UI ICP dejó de fijar exactamente cero paradas");
  }
  if (/estimatedCbm|\bRNC\b|cédula|volumen|CBM|requiere Survey|servicio principal/i.test(form)) {
    fail("el formulario reintrodujo campos excluidos");
  }
  if (!/productionApiEnabled:\s*false/.test(domain)
    || !/CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature\/v17-auth-users-tenant-first"/.test(mode)
    || !/CRM_ICP_V2_UI_PREVIEW_BATCH = "V17-ICP-CONSOLIDATION-02A-PREVIEW"/.test(mode)) {
    fail("las compuertas no permanecen cerradas y acotadas al Preview consolidado");
  }
  if (!/VERCEL_GIT_COMMIT_REF:\s*"feature\/v17-auth-users-tenant-first"/.test(visualConfig)) {
    fail("el arnés visual no reproduce el Preview consolidado exacto");
  }
  if (!docs.includes("El diseño actual del ICP fue aprobado funcional y visualmente.")) {
    fail("la autoridad visual aprobada no está documentada");
  }
  if (createHash("sha256").update(migration).digest("hex") !== MIGRATION_SHA256) {
    fail("la migración 22 no conserva el blob canónico LF");
  }

  return Object.freeze({
    ok: true,
    authFoundation: "01B",
    migration: "20260831010000_v17_crm_icp_foundation",
    migrationSha256: MIGRATION_SHA256,
    productionApiEnabled: false,
    effectiveProductionConsumers: 0,
    previewConsumers: 1,
    uiAdditionalStops: 0,
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17IcpConsolidationGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
