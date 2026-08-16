import { performance } from "node:perf_hooks";
import { createV17CaseClientLocalPrisma } from "./v17-case-client-local-target.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}
function summarize(values) {
  return Object.freeze({
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  });
}
function collectPlanNodes(value, target = []) {
  if (!value || typeof value !== "object") return target;
  if (value["Node Type"]) target.push({
    nodeType: value["Node Type"],
    indexName: value["Index Name"] || null,
    actualRows: value["Actual Rows"] ?? null,
    rowsRemoved: value["Rows Removed by Filter"] ?? 0,
  });
  for (const child of value.Plans || []) collectPlanNodes(child, target);
  return target;
}

const { prisma, target } = await createV17CaseClientLocalPrisma();
const run = `v17perf-${Date.now()}`;
const rollbackSignal = "V17_CASE_CLIENT_PERFORMANCE_ROLLBACK";

try {
  let report;
  try {
    await prisma.$transaction(async (tx) => {
      const tenantId = `${run}-tenant`;
      await tx.tenant.create({ data: { id: tenantId, code: `${run}-T`.toUpperCase(), name: "Synthetic performance tenant" } });
      const clients = Array.from({ length: 100 }, (_, index) => ({
        id: `${run}-client-${String(index).padStart(3, "0")}`, tenantId,
        code: `${run}-C-${String(index).padStart(3, "0")}`.toUpperCase(), name: `Synthetic client ${index}`,
        email: `${run}-${index}@example.test`, phone: "0000000000", address: "Synthetic",
        type: "PERSON", status: "active", createdAt: "2026-08-15",
      }));
      await tx.client.createMany({ data: clients });
      for (let offset = 0; offset < 10_000; offset += 1_000) {
        await tx.pipelineCase.createMany({ data: Array.from({ length: 1_000 }, (_, inner) => {
          const index = offset + inner;
          return {
            id: `${run}-case-${String(index).padStart(5, "0")}`, tenantId, clientId: clients[index % clients.length].id,
            caseCode: `${run}-CASE-${String(index).padStart(5, "0")}`.toUpperCase(), clientName: "Synthetic",
            mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL",
            status: index % 2 === 0 ? "NEW_INBOX" : "AWAITING_ICP", ownerName: "Unassigned",
            originLocation: "Origin", destinationLocation: "Destination",
          };
        }) });
      }
      for (let offset = 0; offset < 1_000; offset += 250) {
        await tx.project.createMany({ data: Array.from({ length: 250 }, (_, inner) => {
          const index = offset + inner;
          const client = clients[index % clients.length];
          return {
            id: `${run}-project-${String(index).padStart(4, "0")}`, tenantId,
            pipelineCaseId: `${run}-case-${String(index).padStart(5, "0")}`, clientId: client.id,
            code: `${run}-PROJECT-${String(index).padStart(4, "0")}`.toUpperCase(), name: "Synthetic project",
            clientName: client.name, status: "active", startDate: "2026-08-15",
          };
        }) });
      }
      await tx.$executeRawUnsafe("ANALYZE osi.osi_pipeline_cases");
      await tx.$executeRawUnsafe("ANALYZE osi.osi_projects");

      const selectedClient = clients[37].id;
      const scenarios = {
        tenantClient: async () => tx.$queryRawUnsafe(`
          SELECT "id", "status", "updatedAt" FROM "osi"."osi_pipeline_cases"
          WHERE "tenant_id" = $1 AND "client_id" = $2
          ORDER BY "status", "updatedAt" DESC LIMIT 100`, tenantId, selectedClient),
        statusClient: async () => tx.$queryRawUnsafe(`
          SELECT "id", "updatedAt" FROM "osi"."osi_pipeline_cases"
          WHERE "tenant_id" = $1 AND "client_id" = $2 AND "status" = 'AWAITING_ICP'::"osi"."PipelineCaseStatus"
          ORDER BY "updatedAt" DESC LIMIT 100`, tenantId, selectedClient),
        projectCaseClient: async () => tx.$queryRawUnsafe(`
          SELECT "id" FROM "osi"."osi_projects"
          WHERE "tenant_id" = $1 AND "pipeline_case_id" = $2 AND "clientId" = $3`,
          tenantId, `${run}-case-00037`, selectedClient),
      };
      const timings = {};
      for (const [name, operation] of Object.entries(scenarios)) {
        for (let warmup = 0; warmup < 5; warmup += 1) await operation();
        const samples = [];
        for (let sample = 0; sample < 50; sample += 1) {
          const started = performance.now();
          await operation();
          samples.push(performance.now() - started);
        }
        timings[name] = summarize(samples);
      }

      const plans = {};
      const planQueries = {
        tenantClient: [`SELECT "id", "status", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" = $1 AND "client_id" = $2 ORDER BY "status", "updatedAt" DESC LIMIT 100`, tenantId, selectedClient],
        statusClient: [`SELECT "id", "updatedAt" FROM "osi"."osi_pipeline_cases" WHERE "tenant_id" = $1 AND "client_id" = $2 AND "status" = 'AWAITING_ICP'::"osi"."PipelineCaseStatus" ORDER BY "updatedAt" DESC LIMIT 100`, tenantId, selectedClient],
        projectCaseClient: [`SELECT "id" FROM "osi"."osi_projects" WHERE "tenant_id" = $1 AND "pipeline_case_id" = $2 AND "clientId" = $3`, tenantId, `${run}-case-00037`, selectedClient],
      };
      for (const [name, [sql, ...params]] of Object.entries(planQueries)) {
        const explain = await tx.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, ...params);
        const payload = typeof explain[0]["QUERY PLAN"] === "string" ? JSON.parse(explain[0]["QUERY PLAN"]) : explain[0]["QUERY PLAN"];
        const plan = payload[0];
        plans[name] = Object.freeze({
          planningMs: plan["Planning Time"], executionMs: plan["Execution Time"],
          nodes: Object.freeze(collectPlanNodes(plan.Plan)),
        });
      }
      check("fixture contiene 10,000 PipelineCase", await tx.pipelineCase.count({ where: { id: { startsWith: `${run}-case-` } } }) === 10_000);
      check("búsqueda tenant + Client usa índice V17", plans.tenantClient.nodes.some((node) => node.indexName === "osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx"));
      check("búsqueda estado + Client usa índice V17", plans.statusClient.nodes.some((node) => node.indexName === "osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx"));
      check("Projects por caso/Client usa índice triple", plans.projectCaseClient.nodes.some((node) => node.indexName === "osi_projects_tenant_id_pipeline_case_id_client_id_idx"));
      check("cada escenario ejecuta una sola consulta y cero N+1", Object.keys(scenarios).length === 3);
      report = Object.freeze({ fixtureCases: 10_000, fixtureProjects: 1_000, samplesPerScenario: 50, queryCountPerRequest: 1, timings, plans });
      throw new Error(rollbackSignal);
    }, { maxWait: 5_000, timeout: 120_000 });
  } catch (error) {
    if (error.message !== rollbackSignal) throw error;
  }
  check("fixtures de rendimiento revertidos", await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 0);
  process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, passed: results.filter((item) => item.passed).length, ...report, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, assertions: results.length, passed: results.filter((item) => item.passed).length, error: { name: error.name, code: error.code || "V17_CASE_CLIENT_PERFORMANCE_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
