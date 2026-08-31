import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";

function testTarget() {
  const raw = process.env.V17_CRM_ICP_TEST_DATABASE_URL;
  if (!raw) throw new Error("V17_CRM_ICP_TEST_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  const allowedDatabase = new Set(["osi_v17_icp_local", "osi_db01n_ci"]);
  const allowedPort = new Set(["55445", "55432"]);
  if (parsed.protocol !== "postgresql:" || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || !allowedPort.has(parsed.port) || !allowedDatabase.has(parsed.pathname.slice(1))
    || parsed.searchParams.get("schema") !== "osi") {
    throw new Error("V17_CRM_ICP_TEST_DATABASE_TARGET_REJECTED");
  }
  return raw;
}

testTarget();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: process.env.V17_CRM_ICP_TEST_DATABASE_URL });
const results = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  results.push({ name, passed: true });
}
async function rejected(name, action) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(name, Boolean(error));
}

const marker = randomUUID().replaceAll("-", "").slice(0, 12);
const tenantId = `icp_t_${marker}`;
const otherTenantId = `icp_o_${marker}`;
const clientId = `icp_c_${marker}`;
const otherClientId = `icp_oc_${marker}`;
let fixturesCleaned = false;

async function cleanupFixtures() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_route_snapshots" DISABLE TRIGGER USER`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."client_addresses" DISABLE TRIGGER USER`);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."osi_pipeline_case_quotes"
        WHERE "caseId" IN (
          SELECT "id" FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" IN ($1, $2)
        )
      `, tenantId, otherTenantId);
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."pipeline_case_route_snapshots" WHERE "tenant_id" IN ($1, $2)
      `, tenantId, otherTenantId);
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" IN ($1, $2)
      `, tenantId, otherTenantId);
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."client_addresses" WHERE "tenant_id" IN ($1, $2)
      `, tenantId, otherTenantId);
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."osi_clients" WHERE "tenant_id" IN ($1, $2)
      `, tenantId, otherTenantId);
      await tx.$executeRawUnsafe(`
        DELETE FROM "osi"."tenants" WHERE "id" IN ($1, $2)
      `, tenantId, otherTenantId);
    });
    fixturesCleaned = true;
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."client_addresses" ENABLE TRIGGER USER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_route_snapshots" ENABLE TRIGGER USER`);
  }
}

async function insertTenant(id, code) {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants" ("id", "code", "name", "country_code", "created_at", "updated_at")
    VALUES ($1, $2, 'Synthetic ICP tenant', 'DO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, id, code.toUpperCase());
}
async function insertClient(id, tenant, code, overrides = {}) {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_clients"
      ("id", "tenant_id", "code", "name", "email", "phone", "address", "type", "status", "createdAt",
       "normalizedPhone", "normalized_email", "tax_id_normalized", "updatedAt")
    VALUES ($1, $2, $3, 'Synthetic Client', $4, $5, 'Synthetic legacy address', 'INDIVIDUAL', 'ACTIVE',
      '2026-08-31', $6, $7, $8, CURRENT_TIMESTAMP)
  `, id, tenant, code, overrides.email ?? `client-${code}@example.test`, overrides.phone ?? "+18095550100",
  overrides.normalizedPhone ?? null, overrides.normalizedEmail ?? null, overrides.taxIdNormalized ?? null);
}
async function insertCase(id, tenant, linkedClient, code, mode = "LOCAL") {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_cases"
      ("id", "public_ref", "tenant_id", "client_id", "caseCode", "clientName", "mode", "serviceType",
       "customerType", "status", "version", "ownerName", "estimatedCbm", "requiresSurvey", "surveyMethod",
       "flags", "originLocation", "destinationLocation", "destinationContracted", "assetsCount", "createdAt", "updatedAt")
    VALUES ($1, pg_catalog.gen_random_uuid(), $2, $3, $4, 'Legacy text is not authority', $5::"osi"."PipelineMode",
      'SYNTHETIC_SERVICE', 'L4_PERSONAL', 'NEW_INBOX', 1, 'Sin asignar', 0, false, 'NO_APLICA', ARRAY[]::text[],
      'Legacy origin remains unchanged', 'Legacy destination remains unchanged', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, id, tenant, linkedClient, code, mode);
}
async function insertSnapshot(tx, { caseId, version, role, stopOrder = 0, sourceAddressRef = null, country = "DO", province = "Distrito Nacional", city = "Santo Domingo", street = "Synthetic street 1" }) {
  await tx.$executeRawUnsafe(`
    INSERT INTO "osi"."pipeline_case_route_snapshots"
      ("tenant_id", "pipeline_case_id", "route_version", "role", "stop_order", "source_address_ref",
       "country_code", "province_state", "city_municipality", "street_and_number")
    VALUES ($1, $2, $3, $4::"osi"."PipelineCaseRouteRole", $5, $6::uuid, $7, $8, $9, $10)
  `, tenantId, caseId, version, role, stopOrder, sourceAddressRef, country, province, city, street);
}
async function commitRoute(caseId, version, destinationStatus, snapshots) {
  await prisma.$transaction(async (tx) => {
    for (const snapshot of snapshots) await insertSnapshot(tx, { caseId, version, ...snapshot });
    await tx.$executeRawUnsafe(`
      UPDATE "osi"."osi_pipeline_cases"
      SET "route_contract_version"=2, "route_revision"=$1,
          "destination_status"=$2::"osi"."PipelineDestinationStatus"
      WHERE "tenant_id"=$3 AND "id"=$4
    `, version, destinationStatus, tenantId, caseId);
  });
}

try {
  const migration = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS "count", count(*) FILTER (WHERE "finished_at" IS NULL)::int AS "failed"
    FROM "osi"."_prisma_migrations"
  `);
  check("PostgreSQL contiene exactamente 22 migraciones completas", migration[0].count === 22 && migration[0].failed === 0);

  await insertTenant(tenantId, `ICP-${marker}`);
  await insertTenant(otherTenantId, `ICP-O-${marker}`);
  await insertClient(clientId, tenantId, `ICP-C-${marker}`, {
    normalizedPhone: "+18095550101", normalizedEmail: `client-${marker}@example.test`, taxIdNormalized: `RNC${marker.toUpperCase()}`,
  });
  await insertClient(otherClientId, otherTenantId, `ICP-OC-${marker}`);

  const generatedCodes = await Promise.all(Array.from({ length: 32 }, () => prisma.$queryRawUnsafe(
    `SELECT "osi"."next_icp_client_code"() AS "code"`,
  )));
  check("generador DB concurrente produce códigos únicos sin MAX+1", new Set(generatedCodes.map((row) => row[0].code)).size === 32);

  await rejected("RNC exacto queda bloqueado tenant-first", () => insertClient(`icp_tax_${marker}`, tenantId, `ICP-T-${marker}`, {
    taxIdNormalized: `RNC${marker.toUpperCase()}`,
  }));
  await rejected("teléfono+correo exactos quedan bloqueados tenant-first", () => insertClient(`icp_pe_${marker}`, tenantId, `ICP-P-${marker}`, {
    normalizedPhone: "+18095550101", normalizedEmail: `client-${marker}@example.test`,
  }));
  await insertClient(`icp_cross_${marker}`, otherTenantId, `ICP-X-${marker}`, {
    normalizedPhone: "+18095550101", normalizedEmail: `client-${marker}@example.test`, taxIdNormalized: `RNC${marker.toUpperCase()}`,
  });
  check("unicidad de Client no colisiona entre tenants", true);

  const addressRows = await prisma.$queryRawUnsafe(`
    INSERT INTO "osi"."client_addresses"
      ("id", "tenant_id", "client_id", "country_code", "province_state", "city_municipality", "street_and_number", "label")
    VALUES ($1, $2, $3, 'DO', 'Distrito Nacional', 'Santo Domingo', 'Synthetic street 1', 'Principal')
    RETURNING "address_ref"::text AS "addressRef"
  `, `icp_a_${marker}`, tenantId, clientId);
  const addressRef = addressRows[0].addressRef;
  await rejected("addressRef es inmutable", () => prisma.$executeRawUnsafe(`
    UPDATE "osi"."client_addresses" SET "address_ref"=pg_catalog.gen_random_uuid()
    WHERE "tenant_id"=$1 AND "address_ref"=$2::uuid
  `, tenantId, addressRef));

  const caseId = `icp_case_${marker}`;
  await insertCase(caseId, tenantId, clientId, `ICP-CASE-${marker}`);
  await commitRoute(caseId, 1, "CONFIRMED", [
    { role: "ORIGIN", sourceAddressRef: addressRef },
    { role: "DESTINATION" },
    ...Array.from({ length: 8 }, (_, index) => ({ role: "ADDITIONAL_STOP", stopOrder: index + 1 })),
  ]);
  const routeRows = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS "count" FROM "osi"."pipeline_case_route_snapshots"
    WHERE "tenant_id"=$1 AND "pipeline_case_id"=$2 AND "route_version"=1
  `, tenantId, caseId);
  check("una versión conserva origen, destino y hasta ocho paradas", routeRows[0].count === 10);
  await rejected("una novena parada queda bloqueada", () => prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."pipeline_case_route_snapshots"
      ("tenant_id", "pipeline_case_id", "route_version", "role", "stop_order", "country_code", "city_municipality")
    VALUES ($1, $2, 2, 'ADDITIONAL_STOP', 9, 'DO', 'Santo Domingo')
  `, tenantId, caseId));
  await rejected("snapshots de ruta no admiten UPDATE", () => prisma.$executeRawUnsafe(`
    UPDATE "osi"."pipeline_case_route_snapshots" SET "city_municipality"='Changed'
    WHERE "tenant_id"=$1 AND "pipeline_case_id"=$2
  `, tenantId, caseId));
  await rejected("snapshots de ruta no admiten DELETE", () => prisma.$executeRawUnsafe(`
    DELETE FROM "osi"."pipeline_case_route_snapshots" WHERE "tenant_id"=$1 AND "pipeline_case_id"=$2
  `, tenantId, caseId));
  await rejected("la siguiente versión no puede saltarse", () => insertSnapshot(prisma, {
    caseId, version: 3, role: "ORIGIN",
  }));

  const crossCaseId = `icp_cross_case_${marker}`;
  await insertCase(crossCaseId, tenantId, clientId, `ICP-XCASE-${marker}`);
  const otherAddress = await prisma.$queryRawUnsafe(`
    INSERT INTO "osi"."client_addresses"
      ("id", "tenant_id", "client_id", "country_code", "city_municipality")
    VALUES ($1, $2, $3, 'DO', 'Santo Domingo') RETURNING "address_ref"::text AS "addressRef"
  `, `icp_oa_${marker}`, otherTenantId, otherClientId);
  await rejected("addressRef cross-tenant no puede ser procedencia", () => insertSnapshot(prisma, {
    caseId: crossCaseId, version: 1, role: "ORIGIN", sourceAddressRef: otherAddress[0].addressRef,
  }));

  const pendingCaseId = `icp_pending_${marker}`;
  await insertCase(pendingCaseId, tenantId, clientId, `ICP-PEND-${marker}`);
  await commitRoute(pendingCaseId, 1, "PENDING", [{ role: "ORIGIN" }]);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_case_quotes" ("id", "caseId", "level", "version", "status", "createdAt", "updatedAt")
    VALUES ($1, $2, 'BASIC', 1, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, `icp_q_${marker}`, pendingCaseId);
  await rejected("cotización FINAL queda bloqueada con destino PENDING", () => prisma.$executeRawUnsafe(`
    UPDATE "osi"."osi_pipeline_case_quotes" SET "status"='FINAL' WHERE "id"=$1
  `, `icp_q_${marker}`));

  const invalidExportId = `icp_export_${marker}`;
  await insertCase(invalidExportId, tenantId, clientId, `ICP-EXP-${marker}`, "EXPORT");
  await rejected("EXPORT incompleto falla al confirmar la transacción", () => commitRoute(invalidExportId, 1, "CONFIRMED", [
    { role: "ORIGIN", province: null, street: null },
    { role: "DESTINATION", country: "US", province: null, city: "Miami", street: null },
  ]));

  const legacyRows = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS "count" FROM "osi"."osi_pipeline_cases"
    WHERE "route_contract_version"=1 AND "route_revision"=0 AND "destination_status" IS NULL
  `);
  check("casos no estructurados conservan contrato v1 sin backfill inferido", legacyRows[0].count >= 2);
  await cleanupFixtures();
  const remainingFixtures = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM "osi"."tenants" WHERE "id" IN ($1, $2)) AS "tenants",
      (SELECT count(*)::int FROM "osi"."osi_clients" WHERE "tenant_id" IN ($1, $2)) AS "clients",
      (SELECT count(*)::int FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" IN ($1, $2)) AS "cases",
      (SELECT count(*)::int FROM "osi"."client_addresses" WHERE "tenant_id" IN ($1, $2)) AS "addresses",
      (SELECT count(*)::int FROM "osi"."pipeline_case_route_snapshots" WHERE "tenant_id" IN ($1, $2)) AS "snapshots"
  `, tenantId, otherTenantId);
  check("fixtures ICP se eliminan antes de continuar la suite canónica",
    Object.values(remainingFixtures[0]).every((count) => count === 0));
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  if (!fixturesCleaned) await cleanupFixtures();
  await prisma.$disconnect();
}
