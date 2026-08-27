import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  resolveV17CommercialCrmProductionClientAuthority,
} from "../shared/v17CommercialCrmProduction.js";
import { requireV17CommercialCrmProductionSessionMode } from "../api/_lib/v17CommercialCrmProductionAuth.js";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exactClient = Object.freeze({
  hubMode: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  clientMode: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  readMode: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  vercelEnvironment: "production",
  gitBranch: "main",
  hostname: "osi-plus-erp-v17.vercel.app",
});
const exactServer = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ",
  CRM_PIPELINE_MUTATION_MODE: "DISABLED",
  CRM_PIPELINE_ACTIVATION_BATCH: "CRM-01B3B1-PRODUCTION-V1",
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
  COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
});

let assertions = 0;
function check(label, callback) {
  callback();
  assertions += 1;
  process.stdout.write(`ok ${assertions} - ${label}\n`);
}

check("frontend exacto autoriza Production/main no loopback", () => {
  assert.deepEqual(resolveV17CommercialCrmProductionClientAuthority(exactClient), {
    requested: true, enabled: true, valid: true, reason: "AUTHORIZED_PRODUCTION",
  });
});

for (const [label, patch] of [
  ["Hub ausente", { hubMode: undefined }],
  ["cliente ausente", { clientMode: undefined }],
  ["lectura ausente", { readMode: undefined }],
  ["Preview rechazado", { vercelEnvironment: "preview" }],
  ["rama distinta", { gitBranch: "feature/pilot" }],
  ["loopback rechazado", { hostname: "127.0.0.1" }],
  ["casing rechazado", { hubMode: "production_read" }],
  ["whitespace rechazado", { readMode: "PRODUCTION_READ " }],
  ["comillas rechazadas", { clientMode: '"PRODUCTION_READ"' }],
  ["BOM rechazado", { hubMode: "\uFEFFPRODUCTION_READ" }],
]) {
  check(`frontend falla cerrado: ${label}`, () => {
    const result = resolveV17CommercialCrmProductionClientAuthority({ ...exactClient, ...patch });
    assert.equal(result.enabled, false);
    assert.equal(result.valid, false);
  });
}

check("frontend no solicitado conserva default inactivo", () => {
  assert.deepEqual(resolveV17CommercialCrmProductionClientAuthority({}), {
    requested: false, enabled: false, valid: true, reason: "NOT_REQUESTED",
  });
});

check("servidor exacto confirma lectura productiva", () => {
  assert.equal(requireV17CommercialCrmProductionSessionMode(exactServer), true);
});

for (const [label, patch] of [
  ["batch ausente", { CRM_PIPELINE_ACTIVATION_BATCH: undefined }],
  ["runtime ausente", { CRM_PIPELINE_RUNTIME_MODE: undefined }],
  ["marcador Vercel ausente", { VERCEL: undefined }],
  ["mutación ausente", { CRM_PIPELINE_MUTATION_MODE: undefined }],
  ["mutación habilitada", { CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY" }],
  ["Auth ausente", { MT01B_AUTH_MODE: undefined }],
  ["Auth no LEGACY", { MT01B_AUTH_MODE: "HYBRID" }],
  ["tenancy parcial", { COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" }],
  ["mutación comercial ausente", { COMMERCIAL_TENANCY_MUTATION_MODE: undefined }],
  ["mutación comercial local", { COMMERCIAL_TENANCY_MUTATION_MODE: "LOCAL_ONLY" }],
  ["tenant switch ausente", { MT01B_TENANT_SWITCH_ENABLED: undefined }],
  ["tenant switch", { MT01B_TENANT_SWITCH_ENABLED: "true" }],
  ["cliente V2 ausente", { VITE_MT01B2_CLIENT_ENABLED: undefined }],
  ["cliente V2", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
  ["entorno Preview", { VERCEL_ENV: "preview" }],
  ["rama no main", { VERCEL_GIT_COMMIT_REF: "feature/pilot" }],
  ["runtime alterado", { CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ\n" }],
]) {
  check(`servidor falla cerrado: ${label}`, () => {
    assert.throws(() => requireV17CommercialCrmProductionSessionMode({ ...exactServer, ...patch }), (error) => error?.code === "CRM_PIPELINE_CONFIGURATION_INVALID" && error?.status === 503);
  });
}

check("servidor inactivo no solicita autoridad productiva", () => {
  assert.equal(requireV17CommercialCrmProductionSessionMode({}), false);
});

check("App exige confirmación servidor antes del Hub lazy", () => {
  const app = read("src/App.tsx");
  assert.match(app, /hubMode\.mode === 'PRODUCTION_READ'[\s\S]*commercialCrmProductionAuthorized === true/u);
  assert.ok(app.indexOf("!hubMode.valid || !serverConfirmed") < app.indexOf("<AuthorizedHubEntry"));
});

check("Auth me confirma Production sólo con contexto revalidado", () => {
  const auth = read("api/auth/me.js");
  assert.match(auth, /resolveV17CommercialCrmProductionSessionContext/u);
  assert.match(auth, /commercialCrmProductionAuthorized: true/u);
});

check("Hub corrige copy local y declara CRM sólo lectura", () => {
  const hub = read("src/hub/HubWorkspace.tsx");
  assert.match(hub, /Comercial abre el ERP sólo cuando la sesión y el entorno están autorizados/u);
  assert.match(hub, /CRM · sólo lectura/u);
});

check("Hub, Inbox y Ficha no invocan escrituras comerciales generales", () => {
  const protectedUi = [
    read("src/hub/HubWorkspace.tsx"),
    read("src/commercial-crm/AdvancedErpShell.tsx"),
    read("src/commercial-crm/CommercialInboxModule.tsx"),
    read("src/commercial-crm/CommercialCaseDetail.tsx"),
    read("src/crm-relational/readApi.ts"),
  ].join("\n");
  assert.doesNotMatch(protectedUi, /\/api\/(?:clients|projects|k\/)|\/pipeline-owner-options|\/allowed-transitions|\/assign-owner|\/unassign-owner|\/transition/u);
  assert.doesNotMatch(protectedUi, /crm-relational\/api/u);
});

check("Survey y Cotización permanecen En integración", () => {
  const detail = read("src/commercial-crm/CommercialCaseDetail.tsx");
  assert.match(detail, /Survey en integración/u);
  assert.match(detail, /Cotización en integración/u);
});

check("no existe migración comercial ambigua", () => {
  const migrations = fs.readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(migrations.length, 21);
  assert.equal(migrations.some((entry) => /v17_(?:party|location|service|compliance)|migration.?19/iu.test(entry.name)), false);
});

process.stdout.write(JSON.stringify({ ok: true, assertions, productionRead: true, mutations: "DISABLED", ambiguousCommercialMigration: false }));
