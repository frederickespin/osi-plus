import { performance } from "node:perf_hooks";
import { createV17CasePublicRefLocalPrisma } from "./v17-case-public-ref-local-target.mjs";

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
function collectNodes(node, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node["Node Type"]) result.push({
    nodeType: node["Node Type"], indexName: node["Index Name"] || null,
    actualRows: node["Actual Rows"] ?? null, rowsRemoved: node["Rows Removed by Filter"] ?? 0,
    sharedHitBlocks: node["Shared Hit Blocks"] ?? 0, sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
  });
  for (const child of node.Plans || []) collectNodes(child, result);
  return result;
}

const { prisma, target } = await createV17CasePublicRefLocalPrisma();
const run = `v17pr-perf-${Date.now()}`;
try {
  const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant`, code: `${run}-T`.toUpperCase(), name: "Synthetic performance" } });
  for (let offset = 0; offset < 10_000; offset += 1_000) {
    await prisma.pipelineCase.createMany({ data: Array.from({ length: 1_000 }, (_, inner) => {
      const index = offset + inner;
      return {
        id: `${run}-case-${String(index).padStart(5, "0")}`, tenantId: tenant.id,
        caseCode: `${run}-CASE-${String(index).padStart(5, "0")}`.toUpperCase(), clientName: "Synthetic",
        mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL",
        status: index % 2 ? "AWAITING_ICP" : "NEW_INBOX", ownerName: "Unassigned",
        originLocation: "Synthetic origin", destinationLocation: "Synthetic destination",
      };
    }) });
  }
  await prisma.$executeRawUnsafe(`ANALYZE "osi"."osi_pipeline_cases"`);
  const selected = await prisma.pipelineCase.findFirstOrThrow({ where: { id: `${run}-case-05000` }, select: { publicRef: true } });
  const lookup = () => prisma.$queryRawUnsafe(`
    SELECT "caseCode", "status"
    FROM "osi"."osi_pipeline_cases"
    WHERE "tenant_id" = $1 AND "public_ref" = $2::uuid
  `, tenant.id, selected.publicRef);
  for (let index = 0; index < 10; index += 1) await lookup();
  const samples = [];
  for (let index = 0; index < 100; index += 1) {
    const started = performance.now();
    const rows = await lookup();
    if (rows.length !== 1) throw new Error("V17_PUBLIC_REF_PERFORMANCE_LOOKUP_INVALID");
    samples.push(performance.now() - started);
  }
  const explain = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT "caseCode", "status"
    FROM "osi"."osi_pipeline_cases"
    WHERE "tenant_id" = $1 AND "public_ref" = $2::uuid
  `, tenant.id, selected.publicRef);
  const payload = typeof explain[0]["QUERY PLAN"] === "string" ? JSON.parse(explain[0]["QUERY PLAN"]) : explain[0]["QUERY PLAN"];
  const plan = payload[0];
  const nodes = collectNodes(plan.Plan);
  if (!nodes.some((node) => node.indexName === "osi_pipeline_cases_tenant_id_public_ref_key")) throw new Error("V17_PUBLIC_REF_PERFORMANCE_INDEX_NOT_USED");
  if (nodes.some((node) => node.nodeType === "Seq Scan")) throw new Error("V17_PUBLIC_REF_PERFORMANCE_SEQUENTIAL_SCAN");
  if (nodes.reduce((sum, node) => sum + Number(node.actualRows || 0), 0) > 2) throw new Error("V17_PUBLIC_REF_PERFORMANCE_EXCESS_ROWS");
  const report = {
    ok: true, target, fixtureCases: 10_000, samples: 100, queryCountPerLookup: 1, nPlusOne: 0,
    timings: summarize(samples), planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], nodes,
  };
  await prisma.pipelineCase.deleteMany({ where: { id: { startsWith: `${run}-case-` } } });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  report.cleaned = await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 0;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  await prisma.pipelineCase.deleteMany({ where: { id: { startsWith: run } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: { startsWith: run } } }).catch(() => {});
  process.stdout.write(`${JSON.stringify({ ok: false, target, error: { name: error.name, code: error.code || "V17_PUBLIC_REF_PERFORMANCE_FAILED", message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
