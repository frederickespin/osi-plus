import { PrismaClient } from "@prisma/client";

const raw = process.env.V17_COMMERCIAL_RELATIONSHIPS_TEST_DATABASE_URL;
if (!raw) throw new Error("V17_COMMERCIAL_RELATIONSHIPS_TEST_DATABASE_URL_REQUIRED");
const target = new URL(raw);
if (process.env.V17_COMMERCIAL_RELATIONSHIPS_LOCAL_ROLLBACK !== "YES" || target.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55432" || target.pathname !== "/v17_commercial_relationships_12a" || target.searchParams.get("schema") !== "osi") throw new Error("V17_COMMERCIAL_RELATIONSHIPS_LOCAL_ROLLBACK_GUARD");

const prisma = new PrismaClient({ datasourceUrl: raw });
const tables = ["pipeline_case_commercial_parties", "pipeline_case_commercial_context_versions", "commercial_price_adjustments", "commercial_commission_agreement_versions", "commercial_referral_agreement_versions", "commercial_pricing_agreement_versions", "commercial_tariff_versions", "commercial_instruction_versions", "commercial_certifications", "commercial_association_memberships", "commercial_relationship_events", "commercial_relationship_commands", "commercial_entity_contacts", "commercial_relationships", "commercial_entities"];
const types = ["CommercialCasePartyRole", "CommercialCommissionKind", "CommercialCalculationType", "CommercialPriceAdjustmentKind", "CommercialVersionState", "CommercialRelationshipType", "CommercialRecordStatus", "CommercialEntityKind"];
try {
  await prisma.$transaction(async (tx) => {
    for (const table of tables) await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "osi"."${table}" CASCADE`);
    await tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS "osi"."commercial_relationship_public_identity_immutable"() CASCADE');
    await tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS "osi"."commercial_relationship_append_only"() CASCADE');
    for (const type of types) await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."${type}"`);
    await tx.$executeRawUnsafe('DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name" = \'20260912010000_v17_commercial_relationships\'');
  });
  const [migrations, residue] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM "osi"."_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL'),
    prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name IN (${tables.map((name) => `'${name}'`).join(",")})`),
  ]);
  if (migrations[0]?.count !== 30 || residue[0]?.count !== 0) throw new Error("V17_COMMERCIAL_RELATIONSHIPS_ROLLBACK_INCOMPLETE");
  console.log(JSON.stringify({ ok: true, target: "LOCAL_ONLY", restoredMigrations: "30/30", residue: 0 }));
} finally { await prisma.$disconnect(); }
