import { createHash } from "node:crypto";
import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function caseData(id, tenantId) {
  return {
    id, tenantId, caseCode: id.toUpperCase(), clientName: "Concurrency fixture", mode: "LOCAL",
    serviceType: "MOVING", customerType: "L4_PERSONAL", status: "NEW_INBOX",
    ownerName: "Unassigned", originLocation: "Origin", destinationLocation: "Destination",
  };
}

const { prisma, target } = await createCrm01b1LocalPrisma();
const run = `crm01b1-race-${Date.now()}`;
const tenantIds = [`${run}-tenant-a`, `${run}-tenant-b`];
const userIds = [`${run}-user-a`, `${run}-user-b`];
const membershipIds = [`${run}-membership-a`, `${run}-membership-b`];
const caseIds = [`${run}-case-a`, `${run}-case-b`];

async function executeAssign({ index, tenantId, userId, membershipId, pipelineCaseId, requestId }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.pipelineCase.updateMany({
      where: { id: pipelineCaseId, tenantId, version: 1 },
      data: { version: 2, ownerMembershipId: membershipId, ownerUserId: userId },
    });
    if (updated.count !== 1) return { outcome: "CONFLICT", index };
    await tx.pipelineCaseCommand.create({ data: {
      id: `${run}-command-${tenantId.endsWith("-a") ? "a" : "b"}-${index}`,
      tenantId, pipelineCaseId, requestId, commandType: "ASSIGN_OWNER",
      payloadHash: hash(`${tenantId}:${pipelineCaseId}:${index}`), expectedVersion: 1, resultingVersion: 2,
      previousStatus: "NEW_INBOX", resultingStatus: "NEW_INBOX",
      resultingOwnerMembershipId: membershipId, resultingOwnerUserId: userId,
      actorMembershipId: membershipId, actorUserId: userId, actorRole: "A",
    } });
    return { outcome: "WINNER", index };
  }, { maxWait: 5_000, timeout: 10_000 });
}

try {
  for (let index = 0; index < 2; index += 1) {
    await prisma.tenant.create({ data: { id: tenantIds[index], code: `${run}-T${index}`.toUpperCase(), name: `Race tenant ${index}` } });
    await prisma.user.create({ data: {
      id: userIds[index], code: `${run}-U${index}`.toUpperCase(), name: `Race actor ${index}`,
      email: `${run}-${index}@example.test`, phone: "0000000000", role: "A", status: "active",
      joinDate: "2026-08-11", passwordHash: "synthetic-not-login",
    } });
    await prisma.tenantMembership.create({ data: {
      id: membershipIds[index], tenantId: tenantIds[index], userId: userIds[index], role: "A", status: "ACTIVE",
    } });
    await prisma.pipelineCase.create({ data: caseData(caseIds[index], tenantIds[index]) });
  }

  const race = await Promise.all(Array.from({ length: 20 }, (_, index) => executeAssign({
    index, tenantId: tenantIds[0], userId: userIds[0], membershipId: membershipIds[0],
    pipelineCaseId: caseIds[0], requestId: `${run}.race.${index}`,
  })));
  const winners = race.filter((entry) => entry.outcome === "WINNER");
  const conflicts = race.filter((entry) => entry.outcome === "CONFLICT");
  const [caseAfterRace, commandCount] = await Promise.all([
    prisma.pipelineCase.findUnique({ where: { id: caseIds[0] } }),
    prisma.pipelineCaseCommand.count({ where: { tenantId: tenantIds[0], pipelineCaseId: caseIds[0] } }),
  ]);
  check("20 comandos con expectedVersion idéntica producen un ganador", winners.length === 1, { winners: winners.length, conflicts: conflicts.length });
  check("los otros 19 intentos terminan en conflicto controlado", conflicts.length === 19);
  check("caso y journal terminan en una sola versión coherente", caseAfterRace.version === 2 && commandCount === 1
    && caseAfterRace.ownerMembershipId === membershipIds[0] && caseAfterRace.ownerUserId === userIds[0]);

  const sharedRequestId = `${run}.cross-tenant.same-request`;
  const crossTenant = await executeAssign({
    index: 100, tenantId: tenantIds[1], userId: userIds[1], membershipId: membershipIds[1],
    pipelineCaseId: caseIds[1], requestId: sharedRequestId,
  });
  check("segundo tenant progresa de forma independiente", crossTenant.outcome === "WINNER");
  const second = await prisma.pipelineCase.findUnique({ where: { id: caseIds[1] } });
  check("la versión del segundo tenant es independiente", second.version === 2 && second.ownerMembershipId === membershipIds[1]);
} catch (error) {
  process.exitCode = 1;
  results.push({ name: "suite", passed: false, error: error.message });
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { in: caseIds } } });
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.pipelineCase.deleteMany({ where: { id: { in: caseIds } } });
      await tx.tenantMembership.deleteMany({ where: { id: { in: membershipIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }, { maxWait: 5_000, timeout: 20_000 });
    const residues = await prisma.pipelineCase.count({ where: { id: { in: caseIds } } });
    check("fixtures concurrentes eliminados completamente", residues === 0);
  } catch (cleanupError) {
    process.exitCode = 1;
    results.push({ name: "cleanup", passed: false, error: cleanupError.message });
  }
  await prisma.$disconnect();
}

process.stdout.write(`${JSON.stringify({
  ok: process.exitCode !== 1,
  target,
  assertions: results.filter((entry) => entry.passed).length,
  results,
}, null, 2)}\n`);
