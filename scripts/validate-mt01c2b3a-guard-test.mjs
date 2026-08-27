import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateMt01c2b3a } from "./validate-mt01c2b3a-guard.mjs";

const root = process.cwd();
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, options, pattern) {
  let error;
  try { validateMt01c2b3a({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateMt01c2b3a({ root, env: { MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false", COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY" } });
  check("estado actual aprobado", baseline.ok && baseline.migrations === 20 && baseline.preparedConsumers.length === 2);
  rejected("TENANT_WRITE en CI rechazado", { env: { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE" } }, /configuración comercial/);
  rejected("LEGACY_ONLY con casing distinto rechazado", { env: { COMMERCIAL_TENANCY_WRITE_MODE: "legacy_only" } }, /configuración comercial/);
  rejected("LEGACY_ONLY con espacio rechazado", { env: { COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY " } }, /configuración comercial/);
  rejected("LEGACY_ONLY con BOM rechazado", { env: { COMMERCIAL_TENANCY_WRITE_MODE: "\uFEFFLEGACY_ONLY" } }, /configuración comercial/);
  rejected("HYBRID rechazado", { env: { MT01B_AUTH_MODE: "HYBRID" } }, /HYBRID/);
  rejected("tenant switch rechazado", { env: { MT01B_TENANT_SWITCH_ENABLED: "true" } }, /tenant switch/);
  rejected("cliente V2 rechazado", { env: { VITE_MT01B2_CLIENT_ENABLED: "true" } }, /cliente V2/);
  rejected("migración 21 rechazada", { migrations: [...Array.from({ length: 20 }, (_, index) => `m${index}`), "20260828010000_unexpected"] }, /20 migraciones/);
  rejected("consumidor runtime nuevo rechazado", { extraRuntimeSources: { "api/new-endpoint.js": 'await createTenantClient(prisma, {});' } }, /consumidores preparados/);
  rejected("creación PipelineCase sin puente rechazada", { extraRuntimeSources: { "api/pipeline/new.js": "await prisma.pipelineCase.create({data:{}});" } }, /creadores runtime/);
  const clientSource = readFileSync(resolve(root, "api/clients/index.js"), "utf8");
  rejected("tenantId desde body rechazado", { overrides: { "api/clients/index.js": clientSource.replace("tenantId: auth.tenantId", "tenantId: body.tenantId") } }, /autoridad del navegador|contexto servidor/);
  rejected("Client sin rechazo de campos bloqueado", { overrides: { "api/clients/index.js": clientSource.replace("assertNoBrowserCommercialAuthority(body);", "") } }, /autoridad empresarial/);
  const projectValidate = readFileSync(resolve(root, "api/k/project-validate.js"), "utf8");
  rejected("actualización de tenant bloqueada", { overrides: { "api/k/project-validate.js": projectValidate.replaceAll('data: { kState: "VALIDATED"', 'data: { tenantId: body.tenantId, kState: "VALIDATED"') } }, /autoridad empresarial/);
  rejected("spread dentro de update K rechazado", { overrides: { "api/k/project-validate.js": projectValidate.replaceAll('data: { kState: "VALIDATED"', 'data: { ...body, kState: "VALIDATED"') } }, /campos permitidos/);
  rejected("ownerId heredado dentro de update rechazado", { overrides: { "api/k/project-validate.js": projectValidate.replaceAll('data: { kState: "VALIDATED"', 'data: { ownerId: body.ownerId, kState: "VALIDATED"') } }, /autoridad empresarial/);
  rejected("upsert comercial nuevo rechazado", { extraRuntimeSources: { "api/new-upsert.js": "await prisma.client.upsert({ where: { id }, update: {}, create: {} });" } }, /updates comerciales|creadores runtime/);
  rejected("createMany Lead nuevo rechazado", { extraRuntimeSources: { "api/new-lead.js": "await prisma.lead.createMany({ data: [] });" } }, /creadores runtime/);
  rejected("SQL raw comercial rechazado", { extraRuntimeSources: { "api/new-raw.js": "await prisma.$executeRawUnsafe('delete from osi.osi_clients');" } }, /SQL cruda/);
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  rejected("TENANT_WRITE versionado rechazado", { overrides: { ".env.example": envExample.replace('COMMERCIAL_TENANCY_WRITE_MODE="LEGACY_ONLY"', 'COMMERCIAL_TENANCY_WRITE_MODE="TENANT_WRITE"') } }, /configura TENANT_WRITE|LEGACY_ONLY/);
  const bridgeSource = readFileSync(resolve(root, "api/_lib/commercialTenancyWrite.js"), "utf8");
  rejected("TENANT_WRITE sin bloqueo Vercel rechazado", { overrides: { "api/_lib/commercialTenancyWrite.js": bridgeSource.replaceAll('"COMMERCIAL_TENANCY_CONFIGURATION_INVALID"', '"COMMERCIAL_MODE_REJECTED"') } }, /Vercel/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: { name: error.name, message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
}
