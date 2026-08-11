import { randomUUID } from "node:crypto";
import { createMt01c2b3bLocalPrisma } from "./mt-01c2b3b-local-target.mjs";
import { createIdentity } from "./mt-01b1-test-helpers.mjs";
import {
  commercialPagination,
  listTenantClients,
  listTenantPipelineCases,
  listTenantProjects,
} from "../api/_lib/commercialTenancyRead.js";

const { prisma, target } = await createMt01c2b3bLocalPrisma();
const run = `mt01c2b3b-perf-${randomUUID().slice(0, 8)}`;
const assertions = [];
const ids = { tenants: [], users: [], memberships: [], clients: [], projects: [], pipelineCases: [] };

function check(name, condition, detail) {
  assertions.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name);
}

function percentile(values, ratio) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)];
}

async function measure(name, operation, rounds = 30) {
  const values = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  return {
    name,
    rounds,
    p50Ms: Number(percentile(values, 0.5).toFixed(2)),
    p95Ms: Number(percentile(values, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2)),
  };
}

function planEvidence(value) {
  const indexes = new Set();
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node["Node Type"]) nodes.push(node["Node Type"]);
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    for (const child of node.Plans || []) visit(child);
  }
  visit(value?.[0]?.["QUERY PLAN"]?.[0]?.Plan);
  return { nodes, indexes: [...indexes] };
}

async function cleanup() {
  await prisma.pipelineCase.deleteMany({ where: { id: { in: ids.pipelineCases } } });
  await prisma.project.deleteMany({ where: { id: { in: ids.projects } } });
  await prisma.client.deleteMany({ where: { id: { in: ids.clients } } });
  await prisma.tenantMembership.deleteMany({ where: { id: { in: ids.memberships } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids.tenants } } });
}

try {
  const tenants = [];
  for (const label of ["one", "two"]) {
    const identity = await createIdentity(prisma, `${run}-${label}`, { role: "A" });
    tenants.push(identity);
    ids.tenants.push(identity.tenantId);
    ids.users.push(identity.userId);
    ids.memberships.push(identity.membershipId);
  }

  const clients = [];
  const projects = [];
  const pipelineCases = [];
  for (let index = 0; index < 2_000; index += 1) {
    const tenant = tenants[index % 2];
    const clientId = `${run}-client-${index}`;
    const projectId = `${run}-project-${index}`;
    clients.push({
      id: clientId, tenantId: tenant.tenantId, code: `${run}-C-${index}`.toUpperCase(),
      name: `Cliente rendimiento ${index}`, email: `${index}@example.invalid`, phone: "0000000000",
      address: "Local", type: "corporate", status: "active", createdAt: "2026-08-10",
    });
    projects.push({
      id: projectId, tenantId: tenant.tenantId, code: `${run}-P-${index}`.toUpperCase(),
      name: `Proyecto rendimiento ${index}`, clientId, clientName: `Cliente rendimiento ${index}`,
      status: "active", startDate: `2099-12-${String((index % 28) + 1).padStart(2, "0")}`,
    });
    pipelineCases.push({
      id: `${run}-pipeline-${index}`, tenantId: tenant.tenantId,
      caseCode: `${run}-CASE-${index}`.toUpperCase(), mode: "LOCAL", serviceType: "MOVING",
      customerType: "L4_PERSONAL", ownerName: "Sin asignar", originLocation: "Origen",
      destinationLocation: "Destino",
    });
  }
  await prisma.client.createMany({ data: clients });
  await prisma.project.createMany({ data: projects });
  await prisma.pipelineCase.createMany({ data: pipelineCases });
  ids.clients.push(...clients.map(({ id }) => id));
  ids.projects.push(...projects.map(({ id }) => id));
  ids.pipelineCases.push(...pipelineCases.map(({ id }) => id));

  check("volumen Client >= 2000", await prisma.client.count({ where: { id: { startsWith: run } } }) === 2_000);
  check("volumen Project >= 2000", await prisma.project.count({ where: { id: { startsWith: run } } }) === 2_000);
  check("volumen PipelineCase >= 2000", await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 2_000);

  const pagination = commercialPagination({ page: "1", pageSize: "100" });
  check("pageSize queda limitado a 100", pagination.pageSize === 100 && commercialPagination({ pageSize: "999" }).pageSize === 100);
  const queryCounts = { client: 0, project: 0, pipeline: 0 };
  const counted = {
    client: {
      count: (...args) => { queryCounts.client += 1; return prisma.client.count(...args); },
      findMany: (...args) => { queryCounts.client += 1; return prisma.client.findMany(...args); },
    },
    project: {
      count: (...args) => { queryCounts.project += 1; return prisma.project.count(...args); },
      findMany: (...args) => { queryCounts.project += 1; return prisma.project.findMany(...args); },
    },
    pipelineCase: {
      count: (...args) => { queryCounts.pipeline += 1; return prisma.pipelineCase.count(...args); },
      findMany: (...args) => { queryCounts.pipeline += 1; return prisma.pipelineCase.findMany(...args); },
    },
    $transaction: (...args) => prisma.$transaction(...args),
  };
  const tenantId = tenants[0].tenantId;
  const clientPage = await listTenantClients(counted, { tenantId, query: "", ...pagination });
  const projectPage = await listTenantProjects(counted, { tenantId, query: "", ...pagination });
  const pipelinePage = await listTenantPipelineCases(counted, { tenantId, ...pagination });
  check("cada listado usa dos consultas acotadas", queryCounts.client === 2 && queryCounts.project === 2 && queryCounts.pipeline === 2, queryCounts);
  check("sin N+1 y aislamiento en página", [clientPage, projectPage, pipelinePage].every((page) => page.total === 1_000 && page.data.length === 100));

  const metrics = [
    await measure("Client", () => listTenantClients(prisma, { tenantId, query: "", ...pagination })),
    await measure("Project", () => listTenantProjects(prisma, { tenantId, query: "", ...pagination })),
    await measure("PipelineCase", () => listTenantPipelineCases(prisma, { tenantId, ...pagination })),
  ];
  check("métricas p50/p95/máximo son finitas y acotadas localmente", metrics.every((metric) => (
    [metric.p50Ms, metric.p95Ms, metric.maxMs].every(Number.isFinite) && metric.maxMs < 5_000
  )), metrics);

  const plans = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return {
      client: planEvidence(await tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) SELECT * FROM osi.osi_clients WHERE tenant_id = $1 ORDER BY "createdAt" DESC, id ASC LIMIT 100`, tenantId)),
      project: planEvidence(await tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) SELECT * FROM osi.osi_projects WHERE tenant_id = $1 ORDER BY "startDate" DESC, id ASC LIMIT 100`, tenantId)),
      pipeline: planEvidence(await tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) SELECT * FROM osi.osi_pipeline_cases WHERE tenant_id = $1 ORDER BY "updatedAt" DESC, id ASC LIMIT 100`, tenantId)),
    };
  });
  for (const [name, evidence] of Object.entries(plans)) {
    check(`${name} dispone de índice tenant-first utilizable`, evidence.indexes.some((index) => /tenant/i.test(index)), evidence);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: assertions.length, target, metrics, plans, results: assertions }, null, 2)}\n`);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
