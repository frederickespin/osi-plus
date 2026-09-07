import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const raw = process.env.V17_COMMUNICATIONS_ROLLBACK_DATABASE_URL;
assert.ok(raw, "V17_COMMUNICATIONS_ROLLBACK_DATABASE_URL_REQUIRED");
const target = new URL(raw);
assert.equal(target.protocol, "postgresql:");
assert.ok(new Set(["127.0.0.1", "localhost", "::1"]).has(target.hostname), "V17_COMMUNICATIONS_ROLLBACK_LOCAL_ONLY");
assert.match(target.pathname.slice(1), /communications/i, "V17_COMMUNICATIONS_ROLLBACK_DATABASE_REJECTED");
assert.equal(target.searchParams.get("schema"), "osi", "V17_COMMUNICATIONS_ROLLBACK_SCHEMA_REJECTED");
assert.equal(process.env.V17_COMMUNICATIONS_ROLLBACK_CONFIRM, "YES", "V17_COMMUNICATIONS_ROLLBACK_CONFIRM_REQUIRED");

const prisma = new PrismaClient({ datasourceUrl: raw });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "osi"."communication_audit_events", "osi"."communication_commands", "osi"."communication_records", "osi"."communication_template_versions", "osi"."communication_templates" CASCADE`);
    await tx.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."communication_append_only"(), "osi"."communication_record_guard"(), "osi"."communication_template_version_guard"(), "osi"."communication_template_guard"()`);
    for (const type of ["CommunicationStatus", "CommunicationMilestone", "CommunicationAudience", "CommunicationChannel", "CommunicationTemplateVersionState", "CommunicationTemplateState", "CommunicationTemplateCategory"]) {
      await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."${type}"`);
    }
    await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name"='20260913010000_v17_communications_templates'`);
  });
  const [status] = await prisma.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "osi"."_prisma_migrations") AS "migrations", to_regclass('osi.communication_templates') IS NULL AS "tablesAbsent"`);
  assert.equal(status.migrations, 31);
  assert.equal(status.tablesAbsent, true);
  process.stdout.write(`${JSON.stringify({ ok: true, rolledBackTo: 31, localOnly: true })}\n`);
} finally {
  await prisma.$disconnect();
}
