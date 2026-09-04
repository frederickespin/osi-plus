function target() {
  const raw = process.env.V17_SURVEY_ROLLBACK_DATABASE_URL;
  if (!raw) throw new Error("V17_SURVEY_ROLLBACK_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "postgresql:" ||
    !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) ||
    parsed.port !== "55439" ||
    parsed.pathname !== "/v17_survey_foundation_04a" ||
    parsed.searchParams.get("schema") !== "osi"
  ) throw new Error("V17_SURVEY_ROLLBACK_DATABASE_TARGET_REJECTED");
  return raw;
}

const TABLES = [
  "survey_mutation_commands", "survey_publication_signatures", "survey_publication_access",
  "survey_publication_items", "survey_publications", "survey_photos", "survey_blob_objects",
  "survey_access_observations", "survey_draft_items", "survey_drafts", "survey_assignments",
  "survey_condition_catalog_items", "survey_article_catalog_items", "survey_area_catalog_items",
  "survey_catalog_versions",
];
const FUNCTIONS = ["survey_guard_publication_update", "survey_guard_draft_mutation", "survey_guard_stable_refs", "survey_guard_immutable"];
const TYPES = ["SurveyBlobStatus", "SurveyPhotoPurpose", "SurveyConditionKind", "SurveyAccessFlag", "SurveyAccessSide", "SurveyMetricSource", "SurveyMeasurementUnit", "SurveyItemFlag", "SurveyItemCondition", "SurveyShipmentMode", "SurveyPublicationStatus", "SurveyDraftStatus", "SurveyAssignmentStatus", "SurveyCatalogVersionStatus"];
const MIGRATION = "20260905010000_v17_survey_foundation";
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: target() });

try {
  await prisma.$transaction(async (tx) => {
    for (const table of TABLES) await tx.$executeRawUnsafe(`DROP TABLE "osi"."${table}"`);
    for (const fn of FUNCTIONS) await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."${fn}"()`);
    for (const type of TYPES) await tx.$executeRawUnsafe(`DROP TYPE "osi"."${type}"`);
    await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name"='${MIGRATION}'`);
  });
  const [migrations, tables, types] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "osi"."_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`),
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name LIKE 'survey_%' AND table_name NOT IN ('surveys','survey_rooms','survey_items','survey_media','survey_signatures','survey_site_access')`),
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='osi' AND t.typname IN (${TYPES.map((type) => `'${type}'`).join(",")})`),
  ]);
  if (migrations[0]?.count !== 23 || tables[0]?.count !== 0 || types[0]?.count !== 0) throw new Error("V17_SURVEY_ROLLBACK_INCOMPLETE");
  process.stdout.write(`${JSON.stringify({ ok: true, migrations: 23, surveyTables: 0, surveyTypes: 0 })}\n`);
} finally { await prisma.$disconnect(); }
