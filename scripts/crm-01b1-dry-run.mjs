import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

const LEGACY_STATUSES = Object.freeze([
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION",
  "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
]);
const AUTHORIZED_STATUSES = new Set([...LEGACY_STATUSES, "QUOTE_DRAFT", "WON", "LOST"]);

const { prisma, target } = await createCrm01b1LocalPrisma();
try {
  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [groups, versionRows, projectRows, caseProjectRows, commands] = await Promise.all([
      tx.$queryRawUnsafe(`SELECT status::text AS status, COUNT(*)::integer AS count FROM "osi"."osi_pipeline_cases" GROUP BY status ORDER BY status`),
      tx.$queryRawUnsafe(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE "version" = 1)::integer AS version_one,
               COUNT(*) FILTER (WHERE "version" <> 1)::integer AS unexpected_version,
               COUNT(*) FILTER (WHERE "status_changed_at" IS NOT NULL)::integer AS status_changed_at_present,
               COUNT(*) FILTER (WHERE "loss_reason_code" IS NOT NULL)::integer AS loss_reason_present
        FROM "osi"."osi_pipeline_cases"
      `),
      tx.$queryRawUnsafe(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE "pipeline_case_id" IS NULL)::integer AS without_pipeline_case,
               COUNT(*) FILTER (WHERE "pipeline_case_id" IS NOT NULL)::integer AS related
        FROM "osi"."osi_projects"
      `),
      tx.$queryRawUnsafe(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM "osi"."osi_projects" p
                 WHERE p."tenant_id" = c."tenant_id" AND p."pipeline_case_id" = c."id"
               ))::integer AS without_project
        FROM "osi"."osi_pipeline_cases" c
      `),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."pipeline_case_commands"`),
    ]);
    const counts = Object.fromEntries(LEGACY_STATUSES.map((status) => [status, 0]));
    const unknown = [];
    for (const row of groups) {
      if (!AUTHORIZED_STATUSES.has(row.status)) unknown.push({ status: row.status, count: Number(row.count) });
      if (Object.hasOwn(counts, row.status)) counts[row.status] = Number(row.count);
    }
    const versions = versionRows[0];
    return Object.freeze({
      mode: "READ_ONLY",
      readOnly: true,
      legacyStatusCounts: counts,
      approvedFrozen: counts.APPROVED,
      unknownStatuses: unknown,
      pipelineCases: {
        total: Number(versions.total),
        versionOne: Number(versions.version_one),
        unexpectedVersion: Number(versions.unexpected_version),
        statusChangedAtPresent: Number(versions.status_changed_at_present),
        lossReasonPresent: Number(versions.loss_reason_present),
        withoutProject: Number(caseProjectRows[0].without_project),
      },
      projects: {
        total: Number(projectRows[0].total),
        withoutPipelineCase: Number(projectRows[0].without_pipeline_case),
        related: Number(projectRows[0].related),
      },
      commands: Number(commands[0].count),
      writes: 0,
      wroteRows: 0,
    });
  }, { maxWait: 5_000, timeout: 15_000 });
  process.stdout.write(`${JSON.stringify({ ok: true, target, ...report }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { name: error.name, code: error.code || "CRM01B1_DRY_RUN_FAILED", message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
