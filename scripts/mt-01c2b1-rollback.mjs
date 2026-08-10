import { createMt01c2b1LocalPrisma } from "./mt-01c2b1-local-target.mjs";

const MIGRATION = "20260801014000_mt01c2b1_commercial_tenant_foundation";

function invariant(condition, message) {
  if (!condition) throw new Error(`MT01C2B1_ROLLBACK_REJECTED: ${message}`);
}

const { prisma, identity } = await createMt01c2b1LocalPrisma();
try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '3000ms'`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '15000ms'`);

    const history = await tx.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "osi"."_prisma_migrations"
      ORDER BY migration_name
    `);
    invariant(history.length === 15, "se esperaban exactamente 15 migraciones");
    invariant(history.at(-1)?.migration_name === MIGRATION, "MT-01C2B1 no es la última migración");
    invariant(history.at(-1)?.finished_at && !history.at(-1)?.rolled_back_at, "migración 15 incompleta");

    const nonNull = await tx.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::integer FROM "osi"."osi_clients" WHERE tenant_id IS NOT NULL) AS clients,
        (SELECT COUNT(*)::integer FROM "osi"."osi_projects" WHERE tenant_id IS NOT NULL) AS projects,
        (SELECT COUNT(*)::integer FROM "osi"."osi_leads" WHERE tenant_id IS NOT NULL) AS leads,
        (SELECT COUNT(*)::integer FROM "osi"."osi_pipeline_cases"
          WHERE tenant_id IS NOT NULL OR owner_membership_id IS NOT NULL OR owner_user_id IS NOT NULL) AS pipeline_cases
    `);
    const counts = nonNull[0];
    invariant(Object.values(counts).every((value) => Number(value) === 0), "existen valores MT-01C2B1; no es seguro retirar la estructura");

    const rollbackStatements = [
      `DROP TRIGGER "osi_clients_tenant_project_restrict_trigger" ON "osi"."osi_clients"`,
      `DROP FUNCTION "osi"."mt01c2b1_restrict_tenant_client_delete"()`,
      `ALTER TABLE "osi"."osi_pipeline_cases"
        DROP CONSTRAINT "osi_pipeline_cases_enterprise_owner_fkey",
        DROP CONSTRAINT "osi_pipeline_cases_tenant_id_fkey",
        DROP CONSTRAINT "osi_pipeline_cases_enterprise_owner_complete_check"`,
      `ALTER TABLE "osi"."osi_leads"
        DROP CONSTRAINT "osi_leads_tenant_id_project_id_fkey",
        DROP CONSTRAINT "osi_leads_tenant_id_customer_id_fkey",
        DROP CONSTRAINT "osi_leads_tenant_id_fkey"`,
      `ALTER TABLE "osi"."osi_projects"
        DROP CONSTRAINT "osi_projects_tenant_id_client_id_fkey",
        DROP CONSTRAINT "osi_projects_tenant_id_fkey"`,
      `ALTER TABLE "osi"."osi_clients" DROP CONSTRAINT "osi_clients_tenant_id_fkey"`,
      `DROP INDEX "osi"."osi_pipeline_cases_tenant_owner_idx"`,
      `DROP INDEX "osi"."osi_pipeline_cases_tenant_id_status_updated_at_idx"`,
      `DROP INDEX "osi"."osi_pipeline_cases_tenant_id_id_key"`,
      `DROP INDEX "osi"."osi_leads_tenant_id_project_id_idx"`,
      `DROP INDEX "osi"."osi_leads_tenant_id_customer_id_idx"`,
      `DROP INDEX "osi"."osi_leads_tenant_id_status_updated_at_idx"`,
      `DROP INDEX "osi"."osi_leads_tenant_id_id_key"`,
      `DROP INDEX "osi"."osi_projects_tenant_id_client_id_idx"`,
      `DROP INDEX "osi"."osi_projects_tenant_id_status_idx"`,
      `DROP INDEX "osi"."osi_projects_tenant_id_id_key"`,
      `DROP INDEX "osi"."osi_clients_tenant_id_status_idx"`,
      `DROP INDEX "osi"."osi_clients_tenant_id_id_key"`,
      `ALTER TABLE "osi"."osi_pipeline_cases"
        DROP COLUMN "owner_user_id",
        DROP COLUMN "owner_membership_id",
        DROP COLUMN "tenant_id"`,
      `ALTER TABLE "osi"."osi_leads" DROP COLUMN "tenant_id"`,
      `ALTER TABLE "osi"."osi_projects" DROP COLUMN "tenant_id"`,
      `ALTER TABLE "osi"."osi_clients" DROP COLUMN "tenant_id"`,
    ];
    for (const statement of rollbackStatements) await tx.$executeRawUnsafe(statement);
    const removed = await tx.$executeRaw`
      DELETE FROM "osi"."_prisma_migrations" WHERE migration_name = ${MIGRATION}
    `;
    invariant(removed === 1, "no se retiró exactamente una fila de historial");
    return { migrationRemoved: MIGRATION, migrationRowsDeleted: removed, verifiedNullColumns: counts };
  }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 30_000 });

  process.stdout.write(`${JSON.stringify({ ok: true, target: identity, ...result }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
