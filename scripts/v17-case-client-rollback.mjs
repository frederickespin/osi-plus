import { createV17CaseClientLocalPrisma } from "./v17-case-client-local-target.mjs";
import { validateV17CaseClientGuard, V17_CASE_CLIENT_MIGRATION } from "./validate-v17-case-client-guard.mjs";

const { prisma, target } = await createV17CaseClientLocalPrisma();
try {
  const guard = validateV17CaseClientGuard();
  if (guard.runtimeConsumers !== 0) throw new Error("V17_CASE_CLIENT_ROLLBACK_BLOCKED: existen consumidores runtime");
  const result = await prisma.$transaction(async (tx) => {
    const [linkedCases, linkedProjects, migrationRows] = await Promise.all([
      tx.pipelineCase.count({ where: { clientId: { not: null } } }),
      tx.project.count({ where: { pipelineCaseId: { not: null } } }),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, V17_CASE_CLIENT_MIGRATION),
    ]);
    if (linkedCases !== 0 || linkedProjects !== 0 || migrationRows[0]?.count !== 1) {
      throw new Error(`V17_CASE_CLIENT_ROLLBACK_BLOCKED: linkedCases=${linkedCases} linkedProjects=${linkedProjects} migrationRows=${migrationRows[0]?.count ?? 0}`);
    }
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_projects" DROP CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_client_id_fkey"`);
    await tx.$executeRawUnsafe(`DROP INDEX "osi"."osi_projects_tenant_id_pipeline_case_id_client_id_idx"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_projects" ADD CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE`);
    await tx.$executeRawUnsafe(`CREATE INDEX "osi_projects_tenant_id_pipeline_case_id_idx" ON "osi"."osi_projects"("tenant_id", "pipeline_case_id")`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_tenant_id_client_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_client_requires_tenant_check"`);
    await tx.$executeRawUnsafe(`DROP INDEX "osi"."osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx"`);
    await tx.$executeRawUnsafe(`DROP INDEX "osi"."osi_pipeline_cases_tenant_id_id_client_id_key"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP COLUMN "client_id"`);
    const deleted = await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name = '${V17_CASE_CLIENT_MIGRATION}'`);
    if (deleted !== 1) throw new Error(`V17_CASE_CLIENT_ROLLBACK_FAILED: migration rows=${deleted}`);
    return { linkedCases, linkedProjects, deletedMigrationRows: deleted };
  }, { maxWait: 5_000, timeout: 30_000 });
  process.stdout.write(`${JSON.stringify({ ok: true, target, migration: V17_CASE_CLIENT_MIGRATION, ...result }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, error: { name: error.name, code: error.code || "V17_CASE_CLIENT_ROLLBACK_FAILED", message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
