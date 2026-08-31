function rollbackTarget() {
  const raw = process.env.V17_CRM_ICP_ROLLBACK_DATABASE_URL;
  if (!raw) throw new Error("V17_CRM_ICP_ROLLBACK_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  if (parsed.protocol !== "postgresql:" || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || parsed.port !== "55445" || parsed.pathname.slice(1) !== "osi_v17_icp_rollback"
    || parsed.searchParams.get("schema") !== "osi") {
    throw new Error("V17_CRM_ICP_ROLLBACK_TARGET_REJECTED");
  }
  return raw;
}

rollbackTarget();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: process.env.V17_CRM_ICP_ROLLBACK_DATABASE_URL });

try {
  await prisma.$transaction(async (tx) => {
    const preflight = await tx.$queryRawUnsafe(`
      SELECT
        (SELECT count(*)::int FROM "osi"."client_addresses") AS "addresses",
        (SELECT count(*)::int FROM "osi"."pipeline_case_route_snapshots") AS "snapshots",
        (SELECT count(*)::int FROM "osi"."osi_pipeline_cases" WHERE "route_contract_version" <> 1 OR "route_revision" <> 0 OR "destination_status" IS NOT NULL) AS "v2Cases",
        (SELECT count(*)::int FROM "osi"."osi_clients" WHERE "normalized_email" IS NOT NULL OR "tax_id_normalized" IS NOT NULL) AS "normalizedClients"
    `);
    if (preflight[0].addresses !== 0 || preflight[0].snapshots !== 0 || preflight[0].v2Cases !== 0 || preflight[0].normalizedClients !== 0) {
      throw new Error("V17_CRM_ICP_ROLLBACK_DATA_PRESENT");
    }
    await tx.$executeRawUnsafe(`DROP TRIGGER "osi_pipeline_case_quotes_final_destination_guard" ON "osi"."osi_pipeline_case_quotes"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_case_quotes_reject_final_pending_destination"()`);
    await tx.$executeRawUnsafe(`DROP TRIGGER "osi_pipeline_cases_route_snapshot_set_complete" ON "osi"."osi_pipeline_cases"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_cases_validate_route_snapshot_set"()`);
    await tx.$executeRawUnsafe(`DROP TRIGGER "osi_pipeline_cases_route_revision_control" ON "osi"."osi_pipeline_cases"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_cases_validate_route_revision"()`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."pipeline_case_route_snapshots"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_case_route_snapshots_before_insert"()`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_case_route_snapshots_reject_mutation"()`);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "osi"."osi_pipeline_cases"
        DROP CONSTRAINT "osi_pipeline_cases_icp_contact_check",
        DROP CONSTRAINT "osi_pipeline_cases_route_contract_check",
        DROP COLUMN "case_contact_name",
        DROP COLUMN "case_contact_phone",
        DROP COLUMN "case_contact_phone_normalized",
        DROP COLUMN "case_contact_email",
        DROP COLUMN "case_contact_email_normalized",
        DROP COLUMN "intake_channel",
        DROP COLUMN "client_profile_type",
        DROP COLUMN "route_contract_version",
        DROP COLUMN "route_revision",
        DROP COLUMN "destination_status"
    `);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."client_addresses"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."client_addresses_reject_address_ref_mutation"()`);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "osi"."osi_clients"
        DROP CONSTRAINT "osi_clients_icp_normalized_values_check",
        DROP COLUMN "normalized_email",
        DROP COLUMN "tax_id_normalized"
    `);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."next_icp_client_code"()`);
    await tx.$executeRawUnsafe(`DROP SEQUENCE "osi"."icp_client_code_seq"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineClientProfileType"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineIntakeChannel"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineDestinationStatus"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineCaseRouteRole"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."ClientAddressStatus"`);
    await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name"='20260831010000_v17_crm_icp_foundation'`);
  });
  const status = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM "osi"."_prisma_migrations") AS "migrations",
      to_regclass('osi.client_addresses') IS NULL AS "addressTableAbsent",
      to_regclass('osi.pipeline_case_route_snapshots') IS NULL AS "routeTableAbsent"
  `);
  if (status[0].migrations !== 21 || !status[0].addressTableAbsent || !status[0].routeTableAbsent) {
    throw new Error("V17_CRM_ICP_ROLLBACK_INCOMPLETE");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, migrations: 21, addressTableAbsent: true, routeTableAbsent: true })}\n`);
} finally {
  await prisma.$disconnect();
}
