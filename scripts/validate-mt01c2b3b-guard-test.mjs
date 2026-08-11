import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateMt01c2b3b } from "./validate-mt01c2b3b-guard.mjs";

const root = process.cwd();
const results = [];
function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
function rejected(name, options, pattern) {
  let error;
  try { validateMt01c2b3b({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}
const read = (path) => readFileSync(resolve(root, path), "utf8");

try {
  const baseline = validateMt01c2b3b({ root, env: {
    COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY",
    COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY",
    MT01B_AUTH_MODE: "LEGACY",
    MT01B_TENANT_SWITCH_ENABLED: "false",
    VITE_MT01B2_CLIENT_ENABLED: "false",
  } });
  check("estado actual aprobado", baseline.ok && baseline.migrations === 15 && baseline.preparedRoutes.length === 6 && baseline.activationBlockers.length === 4);
  rejected("TENANT_READ en CI rechazado", { env: { COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ" } }, /TENANT_READ/);
  rejected("TENANT_WRITE en CI rechazado", { env: { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE" } }, /TENANT_WRITE/);
  rejected("read con espacio rechazado", { env: { COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY " } }, /TENANT_READ/);
  rejected("migración 16 rechazada", { migrationNames: [...Array.from({ length: 15 }, (_, i) => `m${i}`), "20260801015000_mt01c2b3b"] }, /15 migraciones/);
  const service = read("api/_lib/commercialTenancyRead.js");
  rejected("filtro tenant eliminado rechazado", { overrides: { "api/_lib/commercialTenancyRead.js": service.replaceAll("tenantId: String(tenantId)", "id: { not: '' }") } }, /filtran todas/);
  rejected("owner interno expuesto rechazado", { overrides: { "api/_lib/commercialTenancyRead.js": service.replace("ownerMembershipId: true, ownerUserId: true", "") } }, /autoridad interna/);
  const clients = read("api/clients/index.js");
  rejected("cache compartida rechazada", { overrides: { "api/clients/index.js": clients.replaceAll("setPrivateNoStore(res);", "") } }, /caché/);
  rejected("permiso Client eliminado rechazado", { overrides: { "api/clients/index.js": clients.replace("PERMS.CLIENTS_VIEW", "PERMS.CLIENTS_CREATE") } }, /Client/);
  const validate = read("api/k/project-validate.js");
  rejected("update K ampliado rechazado", { overrides: { "api/k/project-validate.js": validate.replace('data: { kState: "VALIDATED"', 'data: { ...body, kState: "VALIDATED"') } }, /campos no autorizados/);
  rejected("transición K sin control optimista rechazada", { overrides: { "api/k/project-validate.js": validate.replace("transitionTenantProject(prisma", "findTenantProject(prisma") } }, /transición tenant/);
  const osi = read("api/osis/index.js");
  rejected("OSI activado prematuramente rechazado", { overrides: { "api/osis/index.js": `${osi}\nimport "../_lib/commercialTenancyRead.js";` } }, /activó sin aislamiento/);
  rejected("Lead runtime nuevo rechazado", { extraRuntimeSources: { "api/leads/index.js": "await prisma.lead.findMany({});" } }, /Lead\/PipelineCase/);
  rejected("readiness runtime rechazado", { extraRuntimeSources: { "api/new.js": 'import "../scripts/mt-01c2b3b-readiness.mjs";' } }, /readiness/);
  const envExample = read(".env.example");
  rejected("TENANT_READ versionado rechazado", { overrides: { ".env.example": envExample.replace('COMMERCIAL_TENANCY_READ_MODE="LEGACY_ONLY"', 'COMMERCIAL_TENANCY_READ_MODE="TENANT_READ"') } }, /READ debe|activa/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
