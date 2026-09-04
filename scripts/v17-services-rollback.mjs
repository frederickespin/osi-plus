function target() {
  const raw = process.env.V17_SERVICES_ROLLBACK_DATABASE_URL;
  if (!raw) throw new Error("V17_SERVICES_ROLLBACK_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  if (parsed.protocol !== "postgresql:" || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || parsed.port !== "55439" || parsed.pathname !== "/postgres" || parsed.searchParams.get("schema") !== "osi") {
    throw new Error("V17_SERVICES_ROLLBACK_DATABASE_TARGET_REJECTED");
  }
  return raw;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: target() });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."service_mutation_commands"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."pipeline_case_service_items"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."pipeline_case_service_revisions"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."service_default_combination_items"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."service_default_combinations"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."service_catalog_compatibilities"`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."service_catalog_items"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."v17_service_public_refs_immutable"()`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."v17_case_service_snapshot_immutable"()`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."v17_services_immutable_identity"()`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."v17_services_validate_relations"()`);
    for (const type of ["ServiceClassificationStatus", "CaseServiceItemSource", "CaseServiceItemKind", "CaseServiceSelectionSource", "ServiceCatalogStatus", "ServiceCatalogUsage"]) {
      await tx.$executeRawUnsafe(`DROP TYPE "osi"."${type}"`);
    }
    await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name"='20260904010000_v17_services_tenant_first'`);
  });
  const [migration, artifacts] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "osi"."_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`),
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name IN ('service_catalog_items','service_catalog_compatibilities','service_default_combinations','service_default_combination_items','pipeline_case_service_revisions','pipeline_case_service_items','service_mutation_commands')`),
  ]);
  if (migration[0]?.count !== 22 || artifacts[0]?.count !== 0) throw new Error("V17_SERVICES_ROLLBACK_INCOMPLETE");
  process.stdout.write(`${JSON.stringify({ ok: true, migrations: 22, serviceArtifacts: 0 })}\n`);
} finally {
  await prisma.$disconnect();
}
