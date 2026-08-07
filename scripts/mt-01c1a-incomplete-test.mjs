import { createHash } from "node:crypto";
import {
  applyEmployeeProfileBackfill,
  createMt01c1aPrisma,
  dryRunEmployeeProfiles,
  publicDryRunReport,
} from "./mt-01c1a-lib.mjs";

const prisma = createMt01c1aPrisma();
const results = [];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function check(name, condition) {
  if (!condition) throw new Error(`MT-01C1A_INCOMPLETE_TEST_FAILED: ${name}`);
  results.push({ name, passed: true });
}

try {
  const usersBefore = hash(await prisma.user.findMany({ orderBy: { id: "asc" } }));
  const membershipsBefore = hash(await prisma.tenantMembership.findMany({ orderBy: { id: "asc" } }));
  const profilesBefore = await prisma.employeeProfile.count();
  const report = await dryRunEmployeeProfiles(prisma);
  const publicReport = publicDryRunReport(report);

  check("18 inherited memberships audited", report.memberships === 18);
  check("no inherited profile is silently convertible", report.counts.convertible === 0);
  check("all inherited profiles require review", report.records.every((row) => row.classification === "AMBIGUOUS"));
  check("employment status remains explicit", publicReport.issueSummary["INCOMPLETE:employmentStatus:MISSING"] === 18);
  check("availability remains explicit", publicReport.issueSummary["INCOMPLETE:availabilityStatus:MISSING"] === 18);
  check("Planta mapping is observed explicitly", publicReport.observedLegacyValues.contractType.some((row) => row.value === "Planta" && row.count === 6));
  check("Personal Móvil mapping is observed explicitly", publicReport.observedLegacyValues.contractType.some((row) => row.value === "Personal Móvil" && row.count === 12));

  let blocked = null;
  try {
    await applyEmployeeProfileBackfill(prisma);
  } catch (error) {
    blocked = error;
  }
  check("backfill stops with a controlled domain error", blocked?.code === "MT01C1A_BACKFILL_BLOCKED");
  check("blocked backfill writes zero profiles", await prisma.employeeProfile.count() === profilesBefore);
  check("blocked backfill leaves User unchanged", hash(await prisma.user.findMany({ orderBy: { id: "asc" } })) === usersBefore);
  check("blocked backfill leaves TenantMembership unchanged", hash(await prisma.tenantMembership.findMany({ orderBy: { id: "asc" } })) === membershipsBefore);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results, dryRun: publicReport }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
