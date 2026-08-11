import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { createCrm01aLocalPrisma } from "./crm-01a-local-target.mjs";
import { listCrmPipelineCases, parsePipelineListQuery } from "../api/_lib/crmPipelineRead.js";

const FIXTURE_COUNTS = Object.freeze([2_000, 10_000]);
const ROUNDS = 30;
const { prisma, target } = await createCrm01aLocalPrisma();
const run = `crm01a-perf-${randomUUID().slice(0, 8)}`;
const tenantId = randomUUID();
const results = [];

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function measure(name, query) {
  const filters = parsePipelineListQuery(query);
  for (let index = 0; index < 3; index += 1) await listCrmPipelineCases(prisma, { tenantId, filters });
  const samples = [];
  for (let index = 0; index < ROUNDS; index += 1) {
    const start = performance.now();
    await listCrmPipelineCases(prisma, { tenantId, filters });
    samples.push(performance.now() - start);
  }
  return Object.freeze({
    name,
    rounds: ROUNDS,
    queriesPerRequest: 2,
    p50Ms: Number(percentile(samples, 0.50).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
  });
}

function summarizePlan(planRows) {
  const root = planRows[0]?.["QUERY PLAN"]?.[0]?.Plan;
  const nodes = [];
  function visit(node) {
    if (!node) return;
    nodes.push({
      nodeType: node["Node Type"],
      relation: node["Relation Name"],
      index: node["Index Name"],
      actualRows: node["Actual Rows"],
      rowsRemoved: node["Rows Removed by Filter"] || 0,
      sharedHitBlocks: node["Shared Hit Blocks"] || 0,
      sharedReadBlocks: node["Shared Read Blocks"] || 0,
      actualTotalTimeMs: node["Actual Total Time"],
    });
    for (const child of node.Plans || []) visit(child);
  }
  visit(root);
  return Object.freeze({ executionTimeMs: planRows[0]?.["QUERY PLAN"]?.[0]?.["Execution Time"], nodes: Object.freeze(nodes) });
}

try {
  await prisma.tenant.create({ data: { id: tenantId, code: run.toUpperCase(), name: "CRM-01A performance local" } });
  const statuses = ["NEW_INBOX", "AWAITING_ICP", "QUOTE_SENT", "NEGOTIATION", "APPROVED"];
  const fixtureRange = (start, count) => Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `${run}-${String(index).padStart(4, "0")}`,
      tenantId,
      caseCode: `${run}-CASE-${String(index).padStart(4, "0")}`.toUpperCase(),
      clientName: `Cliente rendimiento ${index}`,
      mode: index % 2 === 0 ? "LOCAL" : "EXPORT",
      serviceType: index % 2 === 0 ? "MOVING" : "STORAGE",
      customerType: "L4_PERSONAL",
      status: statuses[index % statuses.length],
      ownerName: "Sin asignar",
      originLocation: `Origen ${index % 20}`,
      destinationLocation: `Destino ${index % 25}`,
      updatedAt: new Date(1_800_000_000_000 + index * 1_000),
    };
  });
  const datasets = [];
  let inserted = 0;
  for (const fixtureCount of FIXTURE_COUNTS) {
    await prisma.pipelineCase.createMany({ data: fixtureRange(inserted, fixtureCount - inserted) });
    inserted = fixtureCount;
    check(`fixture ${fixtureCount.toLocaleString("en-US")} separado de medición`, await prisma.pipelineCase.count({ where: { tenantId } }) === fixtureCount);
    const metrics = [
      await measure("lista primera página", { page: "1", pageSize: "50" }),
      await measure("lista página profunda", { page: String(Math.max(2, Math.floor(fixtureCount / 50) - 5)), pageSize: "50" }),
      await measure("filtro estado", { status: "QUOTE_SENT", pageSize: "50" }),
      await measure("filtro unassigned", { unassigned: "true", pageSize: "50" }),
      await measure("búsqueda comercial", { q: `Cliente rendimiento ${fixtureCount - 1}`, pageSize: "50" }),
    ];
    check(`${fixtureCount.toLocaleString("en-US")} mantiene dos consultas y cero N+1`, metrics.every((metric) => metric.queriesPerRequest === 2));
    datasets.push(Object.freeze({ fixtures: fixtureCount, metrics: Object.freeze(metrics) }));
  }

  const listPlan = summarizePlan(await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, "caseCode", status, "updatedAt"
    FROM osi.osi_pipeline_cases
    WHERE tenant_id = $1
    ORDER BY "updatedAt" DESC, id ASC
    LIMIT 50
  `, tenantId));
  const statusPlan = summarizePlan(await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, "caseCode", status, "updatedAt"
    FROM osi.osi_pipeline_cases
    WHERE tenant_id = $1 AND status = 'QUOTE_SENT'::osi."PipelineCaseStatus"
    ORDER BY "updatedAt" DESC, id ASC
    LIMIT 50
  `, tenantId));
  const searchPlan = summarizePlan(await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, "caseCode", status, "updatedAt"
    FROM osi.osi_pipeline_cases
    WHERE tenant_id = $1 AND "clientName" ILIKE '%rendimiento 1999%'
    ORDER BY "updatedAt" DESC, id ASC
    LIMIT 50
  `, tenantId));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    target,
    fixtureSets: FIXTURE_COUNTS,
    datasets,
    plans: { list: listPlan, status: statusPlan, search: searchPlan },
    crm01bIndexAssessment: {
      current: ["tenantId,status,updatedAt", "tenantId,ownerMembershipId,ownerUserId"],
      missingForGeneralOrder: "(tenant_id, updatedAt DESC, id)",
      textualSearch: "evaluar pg_trgm/índices funcionales sólo con evidencia de volumen productivo",
      migration16Created: false,
    },
    assertions: results.length,
    results,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, assertions: results.filter((item) => item.passed).length, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { await prisma.pipelineCase.deleteMany({ where: { tenantId } }); } catch {}
  try { await prisma.tenant.delete({ where: { id: tenantId } }); } catch {}
  await prisma.$disconnect();
}
