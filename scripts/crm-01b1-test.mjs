import { createHash } from "node:crypto";
import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

const { prisma, target } = await createCrm01b1LocalPrisma();
const run = `crm01b1-${Date.now()}`;
const rollbackSignal = "CRM01B1_TEST_ROLLBACK";

function userData(id, role = "V") {
  return {
    id, code: id.toUpperCase(), name: `Synthetic ${id}`, email: `${id}@example.test`, phone: "0000000000",
    role, status: "active", joinDate: "2026-08-11", passwordHash: "synthetic-not-a-login-hash",
  };
}
function caseData(id, tenantId, status = "NEW_INBOX") {
  return {
    id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING",
    customerType: "L4_PERSONAL", status, ownerName: "Unassigned", originLocation: "Origin", destinationLocation: "Destination",
  };
}
function payloadHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

try {
  let fixtureIds;
  try {
    await prisma.$transaction(async (tx) => {
      let savepoint = 0;
      async function isolated(name, operation, shouldFail) {
        const point = `crm01b1_sp_${savepoint += 1}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
        let error;
        try { await operation(); } catch (caught) { error = caught; }
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
        check(name, shouldFail ? Boolean(error) : !error);
      }

      const tenantOne = await tx.tenant.create({ data: { id: `${run}-tenant-1`, code: `${run}-T1`.toUpperCase(), name: "Synthetic tenant one" } });
      const tenantTwo = await tx.tenant.create({ data: { id: `${run}-tenant-2`, code: `${run}-T2`.toUpperCase(), name: "Synthetic tenant two" } });
      const adminOne = await tx.user.create({ data: userData(`${run}-admin-1`, "A") });
      const sellerOne = await tx.user.create({ data: userData(`${run}-seller-1`) });
      const adminTwo = await tx.user.create({ data: userData(`${run}-admin-2`, "A") });
      const membershipAdminOne = await tx.tenantMembership.create({ data: { id: `${run}-membership-admin-1`, tenantId: tenantOne.id, userId: adminOne.id, role: "A" } });
      const membershipSellerOne = await tx.tenantMembership.create({ data: { id: `${run}-membership-seller-1`, tenantId: tenantOne.id, userId: sellerOne.id, role: "V" } });
      const membershipAdminTwo = await tx.tenantMembership.create({ data: { id: `${run}-membership-admin-2`, tenantId: tenantTwo.id, userId: adminTwo.id, role: "A" } });
      const pipelineOne = await tx.pipelineCase.create({ data: caseData(`${run}-case-1`, tenantOne.id) });
      const pipelineTwo = await tx.pipelineCase.create({ data: caseData(`${run}-case-2`, tenantTwo.id) });
      const approved = await tx.pipelineCase.create({ data: caseData(`${run}-approved`, tenantOne.id, "APPROVED") });
      const clientOne = await tx.client.create({ data: {
        id: `${run}-client-1`, tenantId: tenantOne.id, code: `${run}-CLIENT-1`.toUpperCase(), name: "Synthetic client",
        email: `${run}-client@example.test`, phone: "0000000000", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-11",
      } });
      const clientTwo = await tx.client.create({ data: {
        id: `${run}-client-2`, tenantId: tenantTwo.id, code: `${run}-CLIENT-2`.toUpperCase(), name: "Synthetic client two",
        email: `${run}-client-2@example.test`, phone: "0000000000", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-11",
      } });
      fixtureIds = { tenantOne: tenantOne.id, tenantTwo: tenantTwo.id };

      check("filas legacy reciben versión uno", pipelineOne.version === 1 && pipelineOne.statusChangedAt === null && pipelineOne.lossReasonCode === null);
      check("APPROVED preservado sin reinterpretación", approved.status === "APPROVED" && approved.version === 1 && approved.statusChangedAt === null);

      await isolated("version mínima rechazada", () => tx.pipelineCase.update({ where: { id: pipelineOne.id }, data: { version: 0 } }), true);
      await isolated("LOST exige motivo", () => tx.pipelineCase.update({ where: { id: pipelineOne.id }, data: { status: "LOST" } }), true);
      await isolated("código de pérdida válido", () => tx.pipelineCase.update({ where: { id: pipelineOne.id }, data: { status: "LOST", lossReasonCode: "PRICE" } }), false);
      await isolated("código de pérdida inválido", () => tx.pipelineCase.update({ where: { id: pipelineOne.id }, data: { status: "LOST", lossReasonCode: "FREE TEXT" } }), true);
      await isolated("estado no LOST rechaza motivo", () => tx.pipelineCase.update({ where: { id: pipelineOne.id }, data: { lossReasonCode: "PRICE" } }), true);

      const common = {
        tenantId: tenantOne.id,
        pipelineCaseId: pipelineOne.id,
        payloadHash: payloadHash("assign-one"),
        previousStatus: "NEW_INBOX",
        resultingStatus: "NEW_INBOX",
        actorMembershipId: membershipAdminOne.id,
        actorUserId: adminOne.id,
        actorRole: "A",
      };
      const assign = await tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-assign`, requestId: `${run}.request.assign`, commandType: "ASSIGN_OWNER",
        expectedVersion: 1, resultingVersion: 2,
        resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } });
      check("ASSIGN_OWNER válido", assign.resultingVersion === 2);
      await isolated("requestId único por tenant", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-duplicate-request`, requestId: assign.requestId, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("resultingVersion debe ser expectedVersion más uno", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-bad-step`, requestId: `${run}.request.bad-step`, commandType: "ASSIGN_OWNER",
        expectedVersion: 1, resultingVersion: 3, resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("versión resultante duplicada rechazada", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-version-duplicate`, requestId: `${run}.request.version-duplicate`, commandType: "ASSIGN_OWNER",
        expectedVersion: 1, resultingVersion: 2, resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("actor cross-tenant rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-cross-actor`, requestId: `${run}.request.cross-actor`, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, actorMembershipId: membershipAdminTwo.id, actorUserId: adminTwo.id,
        resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("owner parcial rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-partial-owner`, requestId: `${run}.request.partial-owner`, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, resultingOwnerMembershipId: membershipSellerOne.id,
      } }), true);
      await isolated("owner cross-tenant rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-cross-owner`, requestId: `${run}.request.cross-owner`, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3,
        resultingOwnerMembershipId: membershipAdminTwo.id, resultingOwnerUserId: adminTwo.id,
      } }), true);
      await isolated("ASSIGN_OWNER no puede cambiar estado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-assign-state`, requestId: `${run}.request.assign-state`, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, resultingStatus: "AWAITING_ICP",
        resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("evidencia parcial rechazada", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-partial-evidence`, requestId: `${run}.request.partial-evidence`, commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
        evidenceType: "QUOTE",
      } }), true);
      await isolated("requestId no canónico rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-request-invalid`, requestId: " bad ", commandType: "ASSIGN_OWNER",
        expectedVersion: 2, resultingVersion: 3, resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);
      await isolated("payloadHash no canónico rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-hash-invalid`, requestId: `${run}.request.hash-invalid`, commandType: "ASSIGN_OWNER",
        payloadHash: "A".repeat(64), expectedVersion: 2, resultingVersion: 3,
        resultingOwnerMembershipId: membershipSellerOne.id, resultingOwnerUserId: sellerOne.id,
      } }), true);

      const unassign = await tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-unassign`, requestId: `${run}.request.unassign`, commandType: "UNASSIGN_OWNER",
        payloadHash: payloadHash("unassign"), expectedVersion: 2, resultingVersion: 3,
        previousOwnerMembershipId: membershipSellerOne.id, previousOwnerUserId: sellerOne.id,
      } });
      check("UNASSIGN_OWNER válido", unassign.resultingVersion === 3);
      const transition = await tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-transition`, requestId: `${run}.request.transition`, commandType: "TRANSITION",
        payloadHash: payloadHash("transition"), expectedVersion: 3, resultingVersion: 4, resultingStatus: "AWAITING_ICP",
      } });
      check("TRANSITION válido", transition.previousStatus !== transition.resultingStatus);
      await isolated("TRANSITION hacia APPROVED congelado rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-to-approved`, requestId: `${run}.request.to-approved`, commandType: "TRANSITION",
        payloadHash: payloadHash("to-approved"), expectedVersion: 7, resultingVersion: 8,
        previousStatus: "NEGOTIATION", resultingStatus: "APPROVED",
      } }), true);
      await isolated("TRANSITION desde APPROVED congelado rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-from-approved`, requestId: `${run}.request.from-approved`, commandType: "TRANSITION",
        payloadHash: payloadHash("from-approved"), expectedVersion: 8, resultingVersion: 9,
        previousStatus: "APPROVED", resultingStatus: "OPS_HANDOFF",
      } }), true);
      const lost = await tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-lost`, requestId: `${run}.request.lost`, commandType: "TRANSITION",
        payloadHash: payloadHash("lost"), expectedVersion: 4, resultingVersion: 5,
        previousStatus: "AWAITING_ICP", resultingStatus: "LOST", reasonCode: "PRICE",
      } });
      check("LOST exige código allowlisted", lost.reasonCode === "PRICE");
      const reopen = await tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-reopen`, requestId: `${run}.request.reopen`, commandType: "REOPEN",
        payloadHash: payloadHash("reopen"), expectedVersion: 5, resultingVersion: 6,
        previousStatus: "LOST", resultingStatus: "NEW_INBOX", reasonCode: "MANUAL_REVIEW",
      } });
      check("REOPEN válido exige razón canónica", reopen.reasonCode === "MANUAL_REVIEW");
      await isolated("REOPEN hacia APPROVED congelado rechazado", () => tx.pipelineCaseCommand.create({ data: {
        ...common, id: `${run}-command-reopen-approved`, requestId: `${run}.request.reopen-approved`, commandType: "REOPEN",
        payloadHash: payloadHash("reopen-approved"), expectedVersion: 9, resultingVersion: 10,
        previousStatus: "LOST", resultingStatus: "APPROVED", reasonCode: "MANUAL_REVIEW",
      } }), true);
      await isolated("UPDATE del journal rechazado", () => tx.pipelineCaseCommand.update({ where: { id: assign.id }, data: { actorRole: "V" } }), true);
      await isolated("DELETE del journal rechazado", () => tx.pipelineCaseCommand.delete({ where: { id: assign.id } }), true);

      const crossTenantCommand = await tx.pipelineCaseCommand.create({ data: {
        id: `${run}-command-tenant-2`, tenantId: tenantTwo.id, pipelineCaseId: pipelineTwo.id,
        requestId: assign.requestId, commandType: "TRANSITION", payloadHash: payloadHash("tenant-two"),
        expectedVersion: 1, resultingVersion: 2, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP",
        actorMembershipId: membershipAdminTwo.id, actorUserId: adminTwo.id, actorRole: "A",
      } });
      check("mismo requestId permitido entre tenants", crossTenantCommand.requestId === assign.requestId);

      const project = await tx.project.create({ data: {
        id: `${run}-project-1`, tenantId: tenantOne.id, pipelineCaseId: pipelineOne.id, code: `${run}-PROJECT-1`.toUpperCase(),
        name: "Synthetic project", clientId: clientOne.id, clientName: clientOne.name, status: "active", startDate: "2026-08-11",
      } });
      check("Project y PipelineCase del mismo tenant permitidos", project.pipelineCaseId === pipelineOne.id);
      await isolated("Project/PipelineCase cross-tenant rechazado", () => tx.project.create({ data: {
        id: `${run}-project-cross`, tenantId: tenantOne.id, pipelineCaseId: pipelineTwo.id, code: `${run}-PROJECT-X`.toUpperCase(),
        name: "Cross", clientId: clientOne.id, clientName: clientOne.name, status: "active", startDate: "2026-08-11",
      } }), true);
      await isolated("ON DELETE RESTRICT protege PipelineCase relacionado", () => tx.pipelineCase.delete({ where: { id: pipelineOne.id } }), true);
      check("segundo tenant conserva cliente independiente", clientTwo.tenantId === tenantTwo.id);
      throw new Error(rollbackSignal);
    }, { maxWait: 5_000, timeout: 60_000 });
  } catch (error) {
    if (error.message !== rollbackSignal) throw error;
  }
  const [tenantResidue, caseResidue, commandResidue] = await Promise.all([
    prisma.tenant.count({ where: { id: { startsWith: run } } }),
    prisma.pipelineCase.count({ where: { id: { startsWith: run } } }),
    prisma.pipelineCaseCommand.count({ where: { id: { startsWith: run } } }),
  ]);
  check("rollback integral de fixtures", tenantResidue === 0 && caseResidue === 0 && commandResidue === 0);
  process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, passed: results.filter((item) => item.passed).length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, assertions: results.length, passed: results.filter((item) => item.passed).length, error: { name: error.name, code: error.code || "CRM01B1_TEST_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
