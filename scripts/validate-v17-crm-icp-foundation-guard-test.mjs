import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ICP_MIGRATION, validateV17CrmIcpFoundationGuard } from "./validate-v17-crm-icp-foundation-guard.mjs";

const schemaPath = "prisma/schema.prisma";
const migrationPath = `prisma/migrations/${ICP_MIGRATION}/migration.sql`;
const domainPath = "api/_lib/crmIcpV2Domain.js";
const clientRoutePath = "api/clients/index.js";
const pipelineRoutePath = "api/crm/pipeline-cases/index.js";
const base = Object.freeze({
  [schemaPath]: readFileSync(resolve(schemaPath), "utf8"),
  [migrationPath]: readFileSync(resolve(migrationPath), "utf8"),
  [domainPath]: readFileSync(resolve(domainPath), "utf8"),
  [clientRoutePath]: readFileSync(resolve(clientRoutePath), "utf8"),
  [pipelineRoutePath]: readFileSync(resolve(pipelineRoutePath), "utf8"),
});
const results = [];
function pass(name, overrides = {}) {
  const result = validateV17CrmIcpFoundationGuard({ overrides });
  assert.equal(result.ok, true, name);
  results.push({ name, passed: true });
}
function fail(name, path, transform, expected) {
  const source = base[path];
  const changed = transform(source);
  assert.notEqual(changed, source, `${name}: fixture no cambió`);
  let error;
  try { validateV17CrmIcpFoundationGuard({ overrides: { [path]: changed } }); } catch (caught) { error = caught; }
  assert.match(String(error?.message || ""), expected, name);
  results.push({ name, passed: true });
}

pass("árbol actual cumple la fundación ICP v2");
fail("falla sin addressRef tenant-first", schemaPath,
  (text) => text.replace('@@unique([tenantId, addressRef], map: "client_addresses_tenant_address_ref_key")', ""), /ClientAddress público tenant-first/);
fail("falla si ClientAddress depende de Location histórica", schemaPath,
  (text) => text.replace("routeSnapshots       PipelineCaseRouteSnapshot[] @relation(\"RouteSnapshotSourceAddress\")",
    "routeSnapshots       PipelineCaseRouteSnapshot[] @relation(\"RouteSnapshotSourceAddress\")\n  legacyLocation       Location?"), /depende de modelos históricos/);
fail("falla si Client.code usa MAX+1", migrationPath,
  (text) => text.replace("nextval('osi.icp_client_code_seq'::regclass)::text", '(SELECT (MAX("code") + 1)::text FROM "osi"."osi_clients")'), /MAX\+1/);
fail("falla si la migración reescribe casos legacy", migrationPath,
  (text) => `${text}\nUPDATE "osi"."osi_pipeline_cases" SET "originLocation" = 'inferred';\n`, /reescribe datos empresariales/);
fail("falla si se permiten nueve paradas", migrationPath,
  (text) => text.replace('"stop_order" BETWEEN 1 AND 8', '"stop_order" BETWEEN 1 AND 9'), /ocho paradas/);
fail("falla sin inmutabilidad del snapshot", migrationPath,
  (text) => text.replace('BEFORE UPDATE OR DELETE ON "osi"."pipeline_case_route_snapshots"', 'BEFORE UPDATE ON "osi"."pipeline_case_route_snapshots"'), /snapshots no son inmutables/);
fail("falla sin origen único por versión", migrationPath,
  (text) => text.replace('WHERE "role" = \'ORIGIN\';', ';'), /origen único/);
fail("falla sin revisión siguiente", migrationPath,
  (text) => text.replace('CREATE TRIGGER "pipeline_case_route_snapshots_next_revision"', 'CREATE TRIGGER "route_trigger_removed"'), /siguiente revisión/);
fail("falla si cotización FINAL acepta PENDING", migrationPath,
  (text) => text.replace('CREATE TRIGGER "osi_pipeline_case_quotes_final_destination_guard"', 'CREATE TRIGGER "quote_guard_removed"'), /cotización FINAL/);
fail("falla si PENDING no exige autoridad", domainPath,
  (text) => text.replace("authority.pendingDestinationAuthorized !== true", "false"), /PENDING no exige autoridad/);
fail("falla si se elimina precedencia de deniedPermissions", domainPath,
  (text) => text.replace('denied.has("pipeline:view")', "false"), /deniedPermissions/);
fail("falla si se registra PII desde el dominio", domainPath,
  (text) => `${text}\nconsole.log('query');\n`, /registrar o colocar PII/);
fail("falla si la fundación habilita API productiva", domainPath,
  (text) => text.replace("productionApiEnabled: false", "productionApiEnabled: true"), /habilita API productiva/);
fail("falla si una ruta importa el dominio antes de autorización", pipelineRoutePath,
  (text) => `import { normalizeCrmIcpV2CreateInput } from "../../_lib/crmIcpV2Domain.js";\n${text}`, /API ICP fue habilitada/);
fail("falla si POST general de Client pierde la compuerta", clientRoutePath,
  (text) => text.replace('if (req.method === "POST" && !requireCommercialTenancyMutation(req, res)) return;', ""), /POST general de Client perdió/);
fail("falla si duplicado RNC deja de bloquear", domainPath,
  (text) => text.replace('if (assessment.exactTaxId === true) fail("CRM_ICP_CLIENT_DUPLICATE", 409);', ""), /duplicado RNC/);
fail("falla si duplicado teléfono+correo deja de bloquear", domainPath,
  (text) => text.replace('if (assessment.exactPhoneEmail === true) fail("CRM_ICP_CLIENT_DUPLICATE", 409);', ""), /teléfono\+correo/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
