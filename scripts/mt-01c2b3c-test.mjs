import { readFileSync } from "node:fs";
import {
  assertNoBrowserCommercialAuthority,
  COMMERCIAL_TENANCY_ACTIVATION_BATCH,
  resolveCommercialTenancyModes,
} from "../api/_lib/commercialTenancyWrite.js";

const results = [];
function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
function allowed(name, env, expectedTenant = false) {
  let result;
  try { result = resolveCommercialTenancyModes(env); } catch { result = null; }
  check(name, result?.tenantMode === expectedTenant);
}
function rejected(name, env) {
  let error;
  try { resolveCommercialTenancyModes(env); } catch (caught) { error = caught; }
  check(name, error?.status === 503
    && error?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID"
    && !JSON.stringify(error).includes(COMMERCIAL_TENANCY_ACTIVATION_BATCH));
}

const tenant = {
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
};
const production = {
  ...tenant,
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH,
};

try {
  allowed("variables ausentes conservan LEGACY_ONLY", {}, false);
  allowed("par LEGACY_ONLY exacto permitido", {
    COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY",
    COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY",
  }, false);
  rejected("WRITE tenant y READ legacy rechazados", { ...tenant, COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" });
  rejected("READ tenant y WRITE legacy rechazados", { ...tenant, COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY" });
  rejected("par tenant sin batch rechazado en Production", { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: undefined });
  rejected("batch incorrecto rechazado", { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V2" });
  for (const [label, value] of [
    ["BOM", `\uFEFF${COMMERCIAL_TENANCY_ACTIVATION_BATCH}`],
    ["espacio inicial", ` ${COMMERCIAL_TENANCY_ACTIVATION_BATCH}`],
    ["espacio final", `${COMMERCIAL_TENANCY_ACTIVATION_BATCH} `],
    ["comillas", `"${COMMERCIAL_TENANCY_ACTIVATION_BATCH}"`],
    ["salto", `${COMMERCIAL_TENANCY_ACTIVATION_BATCH}\n`],
    ["casing", COMMERCIAL_TENANCY_ACTIVATION_BATCH.toLowerCase()],
  ]) rejected(`batch con ${label} rechazado`, { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: value });
  rejected("Preview permanece bloqueado", { ...production, VERCEL_ENV: "preview" });
  rejected("Production en rama distinta de main rechazado", { ...production, VERCEL_GIT_COMMIT_REF: "feature/test" });
  rejected("casing alternativo de Production rechazado", { ...production, VERCEL_ENV: "Production" });
  allowed("Production main con batch exacto permite el par tenant", production, true);
  allowed("desarrollo local conserva el mecanismo de ensayo", { ...tenant, VERCEL_ENV: "development" }, true);
  rejected("valor WRITE desconocido rechazado", { ...production, COMMERCIAL_TENANCY_WRITE_MODE: "FUTURE" });
  rejected("valor READ desconocido rechazado", { ...production, COMMERCIAL_TENANCY_READ_MODE: "FUTURE" });
  rejected("runtime Vercel sin ambiente inequívoco rechazado", { ...tenant, VERCEL: "1", COMMERCIAL_TENANCY_ACTIVATION_BATCH });

  let browserAuthority;
  try { assertNoBrowserCommercialAuthority({ tenantId: "forged", role: "A" }); } catch (error) { browserAuthority = error; }
  check("body no puede seleccionar tenant o rol", browserAuthority?.code === "COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN");
  const headersIgnored = resolveCommercialTenancyModes({ ...production, "x-osi-role": "A", "x-osi-userid": "forged" });
  check("headers no participan en la activación", headersIgnored.tenantMode === true && !Object.hasOwn(headersIgnored, "tenantId"));

  const source = readFileSync(new URL("../api/_lib/commercialTenancyWrite.js", import.meta.url), "utf8");
  const v2Branch = source.slice(source.indexOf("if (isMembershipAccessTokenCandidate(token))"), source.indexOf("return resolveLegacyCommercialContext", source.indexOf("if (isMembershipAccessTokenCandidate(token))")));
  check("JWT V2 candidato no degrada a LEGACY", /return resolveV2CommercialContext/.test(v2Branch) && !/catch/.test(v2Branch));
  check("resultado no expone activation batch", !JSON.stringify(resolveCommercialTenancyModes(production)).includes(COMMERCIAL_TENANCY_ACTIVATION_BATCH));

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, effectiveDefaults: { write: "LEGACY_ONLY", read: "LEGACY_ONLY" }, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
