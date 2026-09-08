import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const raw = process.env.V17_SERVICE_PACKAGES_ROLLBACK_DATABASE_URL; assert.ok(raw, "V17_SERVICE_PACKAGES_ROLLBACK_DATABASE_URL_REQUIRED"); const target = new URL(raw); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && target.port === "55439" && /service_packages/i.test(target.pathname) && target.searchParams.get("schema") === "osi" && process.env.V17_SERVICE_PACKAGES_ROLLBACK_CONFIRM === "YES", "V17_SERVICE_PACKAGES_ROLLBACK_LOCAL_ONLY");
const prisma = new PrismaClient({ datasourceUrl: raw });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "osi"."service_configuration_conflicts", "osi"."service_configuration_audit_events", "osi"."service_configuration_commands", "osi"."case_service_configuration_items", "osi"."case_service_configuration_revisions", "osi"."service_material_policy_lines", "osi"."service_material_policy_versions", "osi"."service_material_policies", "osi"."service_package_requirements", "osi"."service_package_version_services", "osi"."service_package_version_modes", "osi"."service_package_versions", "osi"."service_packages", "osi"."service_catalog_modes", "osi"."service_mode_definitions" CASCADE`);
    await tx.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."service_configuration_ref_guard"(), "osi"."service_configuration_public_ref_immutable"(), "osi"."service_configuration_version_guard"(), "osi"."service_configuration_append_only"() CASCADE`);
    await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."ServiceConfigurationConflictState", "osi"."ServiceRequirementSource", "osi"."CaseServiceConfigurationItemKind", "osi"."CaseServiceConfigurationSource", "osi"."ServiceResourceChargeType", "osi"."ServiceMaterialDisposition", "osi"."ServiceRequirementKind", "osi"."ServicePackageServiceKind", "osi"."ServiceConfigurationState" CASCADE`);
    await tx.$executeRaw`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name='20260915010000_v17_service_packages_resources'`;
  });
  process.stdout.write(`${JSON.stringify({ ok: true, rolledBackTo: "33/33", target: "local-only" })}\n`);
} finally { await prisma.$disconnect(); }
