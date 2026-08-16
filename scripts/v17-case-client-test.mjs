import { createHash } from "node:crypto";
import { createV17CaseClientLocalPrisma } from "./v17-case-client-local-target.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function clientData(id, tenantId) {
  return {
    id, tenantId, code: id.toUpperCase(), name: `Synthetic ${id}`, email: `${id}@example.test`,
    phone: "0000000000", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-15",
  };
}
function caseData(id, tenantId, clientId = null) {
  return {
    id, tenantId, clientId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL",
    serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "Unassigned",
    originLocation: "Origin", destinationLocation: "Destination",
  };
}

const { prisma, target } = await createV17CaseClientLocalPrisma();
const run = `v17cc-${Date.now()}`;
const rollbackSignal = "V17_CASE_CLIENT_TEST_ROLLBACK";

try {
  try {
    await prisma.$transaction(async (tx) => {
      let savepoint = 0;
      async function isolated(name, operation, shouldFail = true) {
        const point = `v17cc_sp_${savepoint += 1}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
        let error;
        try { await operation(); } catch (caught) { error = caught; }
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
        check(name, shouldFail ? Boolean(error) : !error);
      }

      const tenantOne = await tx.tenant.create({ data: { id: `${run}-tenant-1`, code: `${run}-T1`.toUpperCase(), name: "Synthetic tenant one" } });
      const tenantTwo = await tx.tenant.create({ data: { id: `${run}-tenant-2`, code: `${run}-T2`.toUpperCase(), name: "Synthetic tenant two" } });
      const clientOneA = await tx.client.create({ data: clientData(`${run}-client-1a`, tenantOne.id) });
      const clientOneB = await tx.client.create({ data: clientData(`${run}-client-1b`, tenantOne.id) });
      const clientTwoA = await tx.client.create({ data: clientData(`${run}-client-2a`, tenantTwo.id) });
      await tx.client.create({ data: clientData(`${run}-client-2b`, tenantTwo.id) });

      const related = await tx.pipelineCase.create({ data: caseData(`${run}-case-related`, tenantOne.id, clientOneA.id) });
      check("PipelineCase con Client del mismo tenant permitido", related.clientId === clientOneA.id);
      await isolated("Client de otro tenant rechazado", () => tx.pipelineCase.create({ data: caseData(`${run}-case-cross-client`, tenantOne.id, clientTwoA.id) }));
      const nullable = await tx.pipelineCase.create({ data: caseData(`${run}-case-null`, tenantOne.id) });
      check("PipelineCase sin clientId permitido durante expansión", nullable.clientId === null);
      await isolated("PipelineCase con Client y tenant NULL rechazado", () => tx.pipelineCase.create({ data: caseData(`${run}-case-no-tenant`, null, clientOneA.id) }));

      const projectLegacy = await tx.project.create({ data: {
        id: `${run}-project-legacy`, tenantId: tenantOne.id, pipelineCaseId: null,
        code: `${run}-PROJECT-LEGACY`.toUpperCase(), name: "Legacy project", clientId: clientOneA.id,
        clientName: clientOneA.name, status: "active", startDate: "2026-08-15",
      } });
      check("Project sin pipelineCaseId conserva contrato", projectLegacy.pipelineCaseId === null);
      const project = await tx.project.create({ data: {
        id: `${run}-project-related`, tenantId: tenantOne.id, pipelineCaseId: related.id,
        code: `${run}-PROJECT-RELATED`.toUpperCase(), name: "Related project", clientId: clientOneA.id,
        clientName: clientOneA.name, status: "active", startDate: "2026-08-15",
      } });
      check("Project con caso y Client coincidentes permitido", project.pipelineCaseId === related.id);
      await isolated("Project con caso de otro Client rechazado", () => tx.project.create({ data: {
        id: `${run}-project-wrong-client`, tenantId: tenantOne.id, pipelineCaseId: related.id,
        code: `${run}-PROJECT-WRONG-CLIENT`.toUpperCase(), name: "Wrong client", clientId: clientOneB.id,
        clientName: clientOneB.name, status: "active", startDate: "2026-08-15",
      } }));
      await isolated("Project cross-tenant rechazado", () => tx.project.create({ data: {
        id: `${run}-project-cross-tenant`, tenantId: tenantTwo.id, pipelineCaseId: related.id,
        code: `${run}-PROJECT-CROSS-TENANT`.toUpperCase(), name: "Cross tenant", clientId: clientTwoA.id,
        clientName: clientTwoA.name, status: "active", startDate: "2026-08-15",
      } }));
      await isolated("cambio de clientId que rompe Project rechazado", () => tx.pipelineCase.update({ where: { id: related.id }, data: { clientId: clientOneB.id } }));
      await isolated("eliminación de Client referenciado rechazada", () => tx.client.delete({ where: { id: clientOneA.id } }));
      await isolated("eliminación de PipelineCase referenciado rechazada", () => tx.pipelineCase.delete({ where: { id: related.id } }));

      const legacyRows = Array.from({ length: 51 }, (_, index) => caseData(`${run}-legacy-${String(index).padStart(2, "0")}`, tenantOne.id));
      await tx.pipelineCase.createMany({ data: legacyRows });
      const legacySnapshot = await tx.pipelineCase.findMany({
        where: { id: { startsWith: `${run}-legacy-` } },
        select: { id: true, clientId: true, status: true, ownerMembershipId: true, ownerUserId: true, version: true },
        orderBy: { id: "asc" },
      });
      const before = fingerprint(legacySnapshot);
      const journalBefore = await tx.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: `${run}-legacy-` } } });
      check("los 51 casos heredados permanecen con clientId NULL", legacySnapshot.length === 51 && legacySnapshot.every((item) => item.clientId === null));
      const unchanged = await tx.pipelineCase.findMany({
        where: { id: { startsWith: `${run}-legacy-` } },
        select: { id: true, clientId: true, status: true, ownerMembershipId: true, ownerUserId: true, version: true },
        orderBy: { id: "asc" },
      });
      check("estado, owner y versión permanecen intactos", fingerprint(unchanged) === before);
      check("journal permanece intacto", journalBefore === 0 && await tx.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: `${run}-legacy-` } } }) === 0);

      const constraints = await tx.$queryRawUnsafe(`
        SELECT conname, confdeltype, confupdtype
        FROM pg_constraint
        WHERE connamespace = 'osi'::regnamespace
          AND conname IN (
            'osi_pipeline_cases_tenant_id_client_id_fkey',
            'osi_projects_tenant_id_pipeline_case_id_client_id_fkey'
          ) ORDER BY conname
      `);
      check("ambas FK empresariales usan RESTRICT", constraints.length === 2 && constraints.every((row) => row.confdeltype === "r" && row.confupdtype === "r"));
      throw new Error(rollbackSignal);
    }, { maxWait: 5_000, timeout: 60_000 });
  } catch (error) {
    if (error.message !== rollbackSignal) throw error;
  }
  const residue = await prisma.pipelineCase.count({ where: { id: { startsWith: run } } });
  check("fixtures completamente revertidos", residue === 0);
  process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, passed: results.filter((item) => item.passed).length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, assertions: results.length, passed: results.filter((item) => item.passed).length, error: { name: error.name, code: error.code || "V17_CASE_CLIENT_TEST_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
