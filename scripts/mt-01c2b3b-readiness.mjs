import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createMt01c2b3bLocalPrisma } from "./mt-01c2b3b-local-target.mjs";

const CHECK_NAMES = Object.freeze([
  "clientsWithoutTenant",
  "projectsWithoutTenant",
  "pipelineCasesWithoutTenant",
  "leadsWithoutTenant",
  "partialOwners",
  "crossTenantParents",
  "incompatibleMembershipUsers",
]);

export async function runCommercialReadiness({
  raw = process.env.MT01C2B3B_READINESS_DATABASE_URL,
} = {}) {
  const { prisma, target } = await createMt01c2b3bLocalPrisma(raw, "MT01C2B3B_READINESS_DATABASE_URL");
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      const [counts] = await tx.$queryRawUnsafe(`
        SELECT
          (SELECT COUNT(*)::integer FROM "osi"."osi_clients" WHERE "tenant_id" IS NULL) AS "clientsWithoutTenant",
          (SELECT COUNT(*)::integer FROM "osi"."osi_projects" WHERE "tenant_id" IS NULL) AS "projectsWithoutTenant",
          (SELECT COUNT(*)::integer FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" IS NULL) AS "pipelineCasesWithoutTenant",
          (SELECT COUNT(*)::integer FROM "osi"."osi_leads" WHERE "tenant_id" IS NULL) AS "leadsWithoutTenant",
          (SELECT COUNT(*)::integer FROM "osi"."osi_pipeline_cases"
            WHERE ("owner_membership_id" IS NULL) <> ("owner_user_id" IS NULL)
               OR ("tenant_id" IS NULL AND ("owner_membership_id" IS NOT NULL OR "owner_user_id" IS NOT NULL))) AS "partialOwners",
          (
            (SELECT COUNT(*) FROM "osi"."osi_projects" p JOIN "osi"."osi_clients" c ON c."id" = p."clientId"
              WHERE p."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND p."tenant_id" <> c."tenant_id")
            +
            (SELECT COUNT(*) FROM "osi"."osi_leads" l JOIN "osi"."osi_clients" c ON c."id" = l."customerId"
              WHERE l."tenant_id" IS NOT NULL AND c."tenant_id" IS NOT NULL AND l."tenant_id" <> c."tenant_id")
            +
            (SELECT COUNT(*) FROM "osi"."osi_leads" l JOIN "osi"."osi_projects" p ON p."id" = l."projectId"
              WHERE l."tenant_id" IS NOT NULL AND p."tenant_id" IS NOT NULL AND l."tenant_id" <> p."tenant_id")
          )::integer AS "crossTenantParents",
          (SELECT COUNT(*)::integer
             FROM "osi"."osi_pipeline_cases" pc
             JOIN "osi"."tenant_memberships" tm ON tm."id" = pc."owner_membership_id"
            WHERE pc."tenant_id" IS DISTINCT FROM tm."tenant_id"
               OR pc."owner_user_id" IS DISTINCT FROM tm."user_id") AS "incompatibleMembershipUsers"
      `);
      return Object.fromEntries(CHECK_NAMES.map((name) => [name, Number(counts?.[name] || 0)]));
    });
    return Object.freeze({
      ok: CHECK_NAMES.every((name) => result[name] === 0),
      target,
      counts: Object.freeze(result),
    });
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  runCommercialReadiness()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.ok) process.exitCode = 2;
    })
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
      process.exitCode = 1;
    });
}
