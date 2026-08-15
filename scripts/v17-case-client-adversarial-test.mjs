import { createV17CaseClientLocalPrisma } from "./v17-case-client-local-target.mjs";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function clientData(id, tenantId) {
  return {
    id, tenantId, code: id.toUpperCase(), name: `Synthetic ${id}`, email: `${id}@example.test`,
    phone: "0000000000", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-15",
  };
}
function caseData(id, tenantId, clientId) {
  return {
    id, tenantId, clientId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL",
    serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "Unassigned",
    originLocation: "Origin", destinationLocation: "Destination",
  };
}
function projectData(id, tenantId, pipelineCaseId, client) {
  return {
    id, tenantId, pipelineCaseId, code: id.toUpperCase(), name: `Synthetic ${id}`, clientId: client.id,
    clientName: client.name, status: "active", startDate: "2026-08-15",
  };
}
function errorCode(settled) {
  if (settled.status !== "rejected") return null;
  const explicit = settled.reason?.code || settled.reason?.meta?.code;
  if (explicit) return String(explicit);
  const message = String(settled.reason?.message || "");
  if (settled.reason?.name === "PrismaClientUnknownRequestError" && /(?:code:\s*"23001"|violates RESTRICT)/i.test(message)) return "PG_RESTRICT_23001";
  return "UNKNOWN";
}

const { prisma, target } = await createV17CaseClientLocalPrisma();
const run = `v17cc-adv-${Date.now()}`;
const rollbackSignal = "V17_CASE_CLIENT_ADVERSARIAL_ROLLBACK";
const raceMetrics = { rounds: 20, operations: 0, rejected: 0, unexpected: 0, deadlocks: 0, errorCodes: {}, unexpectedKinds: {} };

try {
  try {
    await prisma.$transaction(async (tx) => {
      let savepoint = 0;
      async function rawRejected(name, operation) {
        const point = `v17cc_adv_sp_${savepoint += 1}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
        let error;
        try { await operation(); } catch (caught) { error = caught; }
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
        check(name, Boolean(error), error ? { code: error.code || "POSTGRES_CONSTRAINT" } : undefined);
      }

      const tenantOne = await tx.tenant.create({ data: { id: `${run}-raw-t1`, code: `${run}-RAW-T1`.toUpperCase(), name: "Raw tenant one" } });
      const tenantTwo = await tx.tenant.create({ data: { id: `${run}-raw-t2`, code: `${run}-RAW-T2`.toUpperCase(), name: "Raw tenant two" } });
      const clientOne = await tx.client.create({ data: clientData(`${run}-raw-client-1`, tenantOne.id) });
      const clientTwo = await tx.client.create({ data: clientData(`${run}-raw-client-2`, tenantTwo.id) });
      const pipelineCase = await tx.pipelineCase.create({ data: caseData(`${run}-raw-case`, tenantOne.id, clientOne.id) });

      const columns = await tx.$queryRawUnsafe(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'osi' AND table_name = 'osi_projects'
          AND column_name IN ('tenant_id', 'pipeline_case_id', 'clientId')
        ORDER BY column_name
      `);
      const nullable = Object.fromEntries(columns.map((row) => [row.column_name, row.is_nullable]));
      check("Project.clientId es NOT NULL y tenantId/pipelineCaseId permanecen nullable",
        nullable.clientId === "NO" && nullable.tenant_id === "YES" && nullable.pipeline_case_id === "YES", nullable);
      const [partialCheck] = await tx.$queryRawUnsafe(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE connamespace = 'osi'::regnamespace
          AND conname = 'osi_projects_pipeline_case_requires_tenant_check'
      `);
      check("migración 16 conserva CHECK contra pipelineCaseId con tenantId NULL",
        /pipeline_case_id.*IS NULL.*tenant_id.*IS NOT NULL/i.test(partialCheck?.definition || ""), partialCheck?.definition);

      const insertProject = (id, tenantId, caseId, clientId) => tx.$executeRawUnsafe(`
        INSERT INTO "osi"."osi_projects"
          ("id", "tenant_id", "pipeline_case_id", "code", "name", "clientId", "clientName", "status", "startDate")
        VALUES ($1, $2, $3, $4, 'Synthetic raw project', $5, 'Synthetic', 'active', '2026-08-15')
      `, id, tenantId, caseId, id.toUpperCase(), clientId);
      await rawRejected("INSERT rechaza pipelineCaseId no nulo con tenantId NULL",
        () => insertProject(`${run}-raw-project-null-tenant`, null, pipelineCase.id, clientOne.id));
      await rawRejected("INSERT rechaza pipelineCaseId no nulo con clientId NULL",
        () => insertProject(`${run}-raw-project-null-client`, tenantOne.id, pipelineCase.id, null));
      await rawRejected("INSERT rechaza pipelineCaseId con tenantId/clientId NULL",
        () => insertProject(`${run}-raw-project-null-both`, null, pipelineCase.id, null));

      const legacyProject = await tx.project.create({ data: projectData(`${run}-raw-project-update`, null, null, clientOne) });
      await rawRejected("UPDATE rechaza agregar pipelineCaseId mientras tenantId es NULL",
        () => tx.$executeRawUnsafe(`UPDATE "osi"."osi_projects" SET "pipeline_case_id" = $1 WHERE "id" = $2`, pipelineCase.id, legacyProject.id));
      const linkedProject = await tx.project.create({ data: projectData(`${run}-raw-project-linked`, tenantOne.id, pipelineCase.id, clientOne) });
      await rawRejected("UPDATE rechaza clientId NULL en Project enlazado",
        () => tx.$executeRawUnsafe(`UPDATE "osi"."osi_projects" SET "clientId" = NULL WHERE "id" = $1`, linkedProject.id));
      await rawRejected("UPDATE rechaza tenantId NULL en Project enlazado",
        () => tx.$executeRawUnsafe(`UPDATE "osi"."osi_projects" SET "tenant_id" = NULL WHERE "id" = $1`, linkedProject.id));
      await rawRejected("INSERT crudo rechaza PipelineCase.clientId no nulo con tenantId NULL", () => tx.$executeRawUnsafe(`
        INSERT INTO "osi"."osi_pipeline_cases"
          ("id", "tenant_id", "client_id", "caseCode", "clientName", "mode", "serviceType", "customerType", "ownerName", "originLocation", "destinationLocation")
        VALUES ($1, NULL, $2, $3, 'Synthetic', 'LOCAL', 'MOVING', 'L4_PERSONAL', 'Unassigned', 'Origin', 'Destination')
      `, `${run}-raw-case-null-tenant`, clientOne.id, `${run}-RAW-CASE-NULL-TENANT`.toUpperCase()));
      await rawRejected("UPDATE rechaza cambiar Client del caso enlazado",
        () => tx.pipelineCase.update({ where: { id: pipelineCase.id }, data: { clientId: clientTwo.id, tenantId: tenantTwo.id } }));
      await rawRejected("el mismo ID físico de Client no puede duplicarse entre tenants",
        () => tx.client.create({ data: clientData(clientOne.id, tenantTwo.id) }));
      throw new Error(rollbackSignal);
    }, { maxWait: 5_000, timeout: 60_000 });
  } catch (error) {
    if (error.message !== rollbackSignal) throw error;
  }
  check("pruebas SQL crudas revierten completamente", await prisma.pipelineCase.count({ where: { id: { startsWith: `${run}-raw-` } } }) === 0);

  const raceTenant = await prisma.tenant.create({ data: { id: `${run}-race-tenant`, code: `${run}-RACE-T`.toUpperCase(), name: "Race tenant" } });
  const raceClientA = await prisma.client.create({ data: clientData(`${run}-race-client-a`, raceTenant.id) });
  const raceClientB = await prisma.client.create({ data: clientData(`${run}-race-client-b`, raceTenant.id) });
  function inspectSettled(settled) {
    raceMetrics.operations += settled.length;
    for (const outcome of settled) {
      const code = errorCode(outcome);
      if (!code) continue;
      raceMetrics.rejected += 1;
      raceMetrics.errorCodes[code] = (raceMetrics.errorCodes[code] || 0) + 1;
      if (code === "P2034" || /40P01|deadlock/i.test(String(outcome.reason?.message || ""))) raceMetrics.deadlocks += 1;
      if (!new Set(["P2003", "P2014", "PG_RESTRICT_23001"]).has(code)) {
        raceMetrics.unexpected += 1;
        const kind = `${outcome.reason?.name || "Error"}:${String(outcome.reason?.message || "").replace(/\s+/g, " ").trim().slice(0, 160)}`;
        raceMetrics.unexpectedKinds[kind] = (raceMetrics.unexpectedKinds[kind] || 0) + 1;
      }
    }
  }

  for (let round = 0; round < raceMetrics.rounds; round += 1) {
    const suffix = String(round).padStart(2, "0");

    const caseA = await prisma.pipelineCase.create({ data: caseData(`${run}-race-a-${suffix}`, raceTenant.id, raceClientA.id) });
    const raceA = await Promise.allSettled([
      prisma.project.create({ data: projectData(`${run}-race-a-project-${suffix}`, raceTenant.id, caseA.id, raceClientA) }),
      prisma.pipelineCase.update({ where: { id: caseA.id }, data: { clientId: raceClientB.id } }),
    ]);
    inspectSettled(raceA);
    const [caseAAfter, projectAAfter] = await Promise.all([
      prisma.pipelineCase.findUnique({ where: { id: caseA.id } }),
      prisma.project.findUnique({ where: { id: `${run}-race-a-project-${suffix}` } }),
    ]);
    check(`carrera enlace/Client A coherente ${suffix}`, !projectAAfter || projectAAfter.clientId === caseAAfter.clientId);

    const caseB = await prisma.pipelineCase.create({ data: caseData(`${run}-race-b-${suffix}`, raceTenant.id, raceClientA.id) });
    const raceB = await Promise.allSettled([
      prisma.pipelineCase.update({ where: { id: caseB.id }, data: { clientId: raceClientB.id } }),
      prisma.project.create({ data: projectData(`${run}-race-b-project-${suffix}`, raceTenant.id, caseB.id, raceClientB) }),
    ]);
    inspectSettled(raceB);
    const [caseBAfter, projectBAfter] = await Promise.all([
      prisma.pipelineCase.findUnique({ where: { id: caseB.id } }),
      prisma.project.findUnique({ where: { id: `${run}-race-b-project-${suffix}` } }),
    ]);
    check(`carrera cambio/enlace Client B coherente ${suffix}`, !projectBAfter || projectBAfter.clientId === caseBAfter.clientId);

    const deletableClient = await prisma.client.create({ data: clientData(`${run}-race-delete-client-${suffix}`, raceTenant.id) });
    const raceC = await Promise.allSettled([
      prisma.client.delete({ where: { id: deletableClient.id } }),
      prisma.pipelineCase.create({ data: caseData(`${run}-race-create-case-${suffix}`, raceTenant.id, deletableClient.id) }),
    ]);
    inspectSettled(raceC);
    const [clientCAfter, caseCAfter] = await Promise.all([
      prisma.client.findUnique({ where: { id: deletableClient.id } }),
      prisma.pipelineCase.findUnique({ where: { id: `${run}-race-create-case-${suffix}` } }),
    ]);
    check(`carrera eliminar Client/crear caso coherente ${suffix}`, !caseCAfter || Boolean(clientCAfter));

    const caseD = await prisma.pipelineCase.create({ data: caseData(`${run}-race-delete-case-${suffix}`, raceTenant.id, raceClientA.id) });
    const raceD = await Promise.allSettled([
      prisma.pipelineCase.delete({ where: { id: caseD.id } }),
      prisma.project.create({ data: projectData(`${run}-race-d-project-${suffix}`, raceTenant.id, caseD.id, raceClientA) }),
    ]);
    inspectSettled(raceD);
    const [caseDAfter, projectDAfter] = await Promise.all([
      prisma.pipelineCase.findUnique({ where: { id: caseD.id } }),
      prisma.project.findUnique({ where: { id: `${run}-race-d-project-${suffix}` } }),
    ]);
    check(`carrera eliminar caso/enlazar Project coherente ${suffix}`, !projectDAfter || Boolean(caseDAfter));
  }
  check("80 carreras terminan sin deadlocks", raceMetrics.deadlocks === 0, raceMetrics);
  check("80 carreras sólo producen conflictos FK controlados", raceMetrics.unexpected === 0, raceMetrics);
  check("carreras no dejan vínculos parciales", await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::integer AS count
    FROM "osi"."osi_projects" p
    LEFT JOIN "osi"."osi_pipeline_cases" c
      ON c."tenant_id" = p."tenant_id" AND c."id" = p."pipeline_case_id" AND c."client_id" = p."clientId"
    WHERE p."id" LIKE $1 AND p."pipeline_case_id" IS NOT NULL AND c."id" IS NULL
  `, `${run}-race-%`).then((rows) => rows[0]?.count === 0));
  process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, passed: results.filter((item) => item.passed).length, raceMetrics, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, assertions: results.length, passed: results.filter((item) => item.passed).length, raceMetrics, error: { name: error.name, code: error.code || "V17_CASE_CLIENT_ADVERSARIAL_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.project.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.pipelineCase.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.client.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.tenant.deleteMany({ where: { id: { startsWith: run } } });
  } finally {
    await prisma.$disconnect();
  }
}
