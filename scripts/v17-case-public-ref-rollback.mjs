import { createV17CasePublicRefLocalPrisma } from "./v17-case-public-ref-local-target.mjs";
import { validateV17CasePublicRefGuard, V17_CASE_PUBLIC_REF_MIGRATION } from "./validate-v17-case-public-ref-guard.mjs";

const { prisma, target } = await createV17CasePublicRefLocalPrisma();
try {
  const guard = validateV17CasePublicRefGuard();
  if (guard.runtimeConsumers !== 0) throw new Error("V17_PUBLIC_REF_ROLLBACK_BLOCKED_RUNTIME_CONSUMERS");
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, V17_CASE_PUBLIC_REF_MIGRATION);
    if (rows[0]?.count !== 1) throw new Error("V17_PUBLIC_REF_ROLLBACK_MIGRATION_STATE_INVALID");
    await tx.$executeRawUnsafe(`DROP TRIGGER "osi_pipeline_cases_public_ref_immutable_trg" ON "osi"."osi_pipeline_cases"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."osi_prevent_pipeline_case_public_ref_change"()`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP COLUMN "public_ref"`);
    const deleted = await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name = '${V17_CASE_PUBLIC_REF_MIGRATION}'`);
    if (deleted !== 1) throw new Error("V17_PUBLIC_REF_ROLLBACK_HISTORY_INVALID");
    return { deletedMigrationRows: deleted };
  }, { maxWait: 5_000, timeout: 30_000 });
  process.stdout.write(`${JSON.stringify({ ok: true, target, migration: V17_CASE_PUBLIC_REF_MIGRATION, ...result }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, error: { name: error.name, code: error.code || "V17_PUBLIC_REF_ROLLBACK_FAILED", message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
