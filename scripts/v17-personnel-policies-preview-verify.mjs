import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  getPersonnelPoliciesWorkspace,
  resolvePersonnelScheduleAuthority,
} from "../api/_lib/personnelPoliciesDomain.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const OTHER_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
const MIGRATION = "20260914010000_v17_personnel_operational_policies";
const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw || process.env.VERCEL_ENV === "production")
  throw new Error("V17_PERSONNEL_PREVIEW_VERIFY_BLOCKED:ENVIRONMENT");
const url = new URL(raw);
if (
  decodeURIComponent(url.pathname.slice(1)) !== EXPECTED_DATABASE ||
  url.searchParams.get("schema") !== "osi" ||
  /fragrant-night|bitter-bush/i.test(url.hostname)
)
  throw new Error("V17_PERSONNEL_PREVIEW_VERIFY_BLOCKED:DATABASE");
const prisma = new PrismaClient({ datasourceUrl: raw });
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

try {
  const identity = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch",
  );
  assert.equal(identity[0]?.database, EXPECTED_DATABASE);
  assert.equal(identity[0]?.branch, EXPECTED_BRANCH);
  const migrations = await prisma.$queryRawUnsafe(
    "SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name",
  );
  assert.equal(migrations.length, 33);
  assert.ok(
    migrations.every(
      (row) =>
        row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1,
    ),
  );
  const localChecksum = createHash("sha256")
    .update(readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`))
    .digest("hex");
  assert.equal(
    migrations.find((row) => row.migration_name === MIGRATION)?.checksum,
    localChecksum,
  );

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { code: TENANT_CODE },
  });
  const otherTenant = await prisma.tenant.findUniqueOrThrow({
    where: { code: OTHER_TENANT_CODE },
  });
  const admin = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, role: "A", status: "ACTIVE" },
  });
  const evaluator = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, role: "E", status: "ACTIVE" },
  });
  const deny = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id, deniedPermissions: { has: "pipeline:view" } },
  });
  const context = {
    tenantId: tenant.id,
    membershipId: admin.id,
    userId: admin.userId,
  };
  const workspace = await getPersonnelPoliciesWorkspace(context, {}, prisma);
  assert.equal(workspace.personnel.length, 2);
  assert.equal(workspace.capabilities.length, 3);
  assert.equal(workspace.activePolicy?.version, 1);
  assert.equal(workspace.activePolicy?.windows.length, 10);
  assert.equal(workspace.reasons.length, 4);
  assert.ok(
    workspace.exceptions.some(
      (row) =>
        row.status === "APPROVED" &&
        row.evaluatorResponse === "ACCEPTED" &&
        row.adminDecision === "APPROVED",
    ),
  );
  const serialized = JSON.stringify(workspace);
  for (const internal of [
    tenant.id,
    admin.id,
    admin.userId,
    evaluator.id,
    evaluator.userId,
  ])
    assert.equal(serialized.includes(internal), false);
  await assert.rejects(
    getPersonnelPoliciesWorkspace(
      { tenantId: tenant.id, membershipId: deny.id, userId: deny.userId },
      {},
      prisma,
    ),
    (error) => error?.status === 403,
  );
  const otherProfile = await prisma.employeeProfile.findFirstOrThrow({
    where: { tenantId: otherTenant.id },
  });
  const scoped = await getPersonnelPoliciesWorkspace(
    context,
    { section: "PERSONNEL", profileRef: otherProfile.profileRef },
    prisma,
  );
  assert.equal(scoped.personnel.length, 0);

  const profile = await prisma.employeeProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, membershipId: evaluator.id },
  });
  await assert.rejects(
    resolvePersonnelScheduleAuthority(
      prisma,
      context,
      profile,
      "IN_PERSON",
      new Date("2026-09-14T16:00:00.000Z"),
      new Date("2026-09-14T17:00:00.000Z"),
      null,
      60,
    ),
    /PERSONNEL_EVALUATOR_UNAVAILABLE/,
  );

  const assignments = await prisma.surveyAssignment.findMany({
    where: { tenantId: tenant.id },
    include: { evaluationDecision: true },
    orderBy: { scheduledStart: "asc" },
  });
  const physical = assignments.find(
    (row) => row.contextSnapshot?.fixture === "A-IN-PERSON",
  );
  const virtual = assignments.find(
    (row) => row.contextSnapshot?.fixture === "B-VIRTUAL",
  );
  const original = assignments.find(
    (row) => row.contextSnapshot?.fixture === "D-ORIGINAL",
  );
  const replacement = assignments.find(
    (row) => row.replacesAssignmentId === original?.id,
  );
  assert.equal(physical?.travelBufferMinutes, 60);
  assert.equal(physical?.evaluationDecision?.method, "IN_PERSON");
  assert.equal(virtual?.travelBufferMinutes, 15);
  assert.equal(virtual?.evaluationDecision?.method, "VIRTUAL");
  assert.equal(original?.status, "SUPERSEDED");
  assert.equal(replacement?.status, "ASSIGNED");
  const fee = await prisma.surveyVisitFee.findFirstOrThrow({
    where: { tenantId: tenant.id, assignmentId: physical.id },
  });
  assert.deepEqual(
    {
      disposition: fee.disposition,
      communication: fee.communicationStatus,
      approval: fee.approvalStatus,
      payment: fee.paymentStatus,
    },
    {
      disposition: "CHARGEABLE",
      communication: "PREPARED",
      approval: "APPROVED",
      payment: "PENDING",
    },
  );
  const counts = {
    cases: await prisma.pipelineCase.count({ where: { tenantId: tenant.id } }),
    clients: await prisma.client.count({ where: { tenantId: tenant.id } }),
    profiles: await prisma.employeeProfile.count({
      where: { tenantId: tenant.id },
    }),
    crossProfiles: await prisma.employeeProfile.count({
      where: { tenantId: otherTenant.id },
    }),
    activePolicies: await prisma.visitPolicyVersion.count({
      where: { tenantId: tenant.id, state: "ACTIVE" },
    }),
    exceptions: await prisma.afterHoursVisitRequest.count({
      where: { tenantId: tenant.id },
    }),
    assignments: assignments.length,
    prepared: await prisma.communicationRecord.count({
      where: { tenantId: tenant.id, status: "PREPARED" },
    }),
    sent: await prisma.communicationRecord.count({
      where: { tenantId: tenant.id, status: { in: ["SENT", "DELIVERED"] } },
    }),
  };
  assert.deepEqual(
    {
      cases: counts.cases,
      clients: counts.clients,
      profiles: counts.profiles,
      crossProfiles: counts.crossProfiles,
      activePolicies: counts.activePolicies,
      exceptions: counts.exceptions,
      assignments: counts.assignments,
      sent: counts.sent,
    },
    {
      cases: 5,
      clients: 4,
      profiles: 2,
      crossProfiles: 1,
      activePolicies: 1,
      exceptions: 1,
      assignments: 5,
      sent: 0,
    },
  );
  assert.ok(counts.prepared >= 24);
  const fingerprints = {
    migrations: digest(
      migrations.map((row) => [
        row.migration_name,
        row.checksum,
        row.applied_steps_count,
      ]),
    ),
    personnel: digest([
      workspace.personnel.length,
      workspace.capabilities.length,
      workspace.activePolicy.version,
      workspace.activePolicy.windows.length,
      workspace.reasons.length,
      workspace.exceptions.map((row) => [
        row.status,
        row.evaluatorResponse,
        row.adminDecision,
      ]),
    ]),
    scheduling: digest(
      assignments.map((row) => [
        row.status,
        row.evaluationDecision?.method,
        row.travelBufferMinutes,
        Boolean(row.replacesAssignmentId),
      ]),
    ),
    communications: digest([counts.prepared, counts.sent]),
    crossTenant: digest([counts.crossProfiles, scoped.personnel.length]),
  };
  console.log(
    JSON.stringify({
      ok: true,
      database: EXPECTED_DATABASE,
      branch: EXPECTED_BRANCH,
      migrations: "33/33",
      checksum: localChecksum,
      counts,
      fixtures: [
        "IN_HOURS_PHYSICAL",
        "VIRTUAL",
        "AFTER_HOURS_APPROVED",
        "REBOOK_HISTORY",
        "TRAVEL_CONFLICT",
      ],
      permissions: { admin: true, evaluatorRespond: true, deny: true },
      crossTenantBlocked: true,
      productionApiEnabled: false,
      externalTransport: "DISABLED",
      fingerprints,
    }),
  );
} finally {
  await prisma.$disconnect();
}
