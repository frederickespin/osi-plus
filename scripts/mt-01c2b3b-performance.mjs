import { randomUUID } from "node:crypto";
import { createMt01c2b3bLocalPrisma } from "./mt-01c2b3b-local-target.mjs";
import { createIdentity } from "./mt-01b1-test-helpers.mjs";
import {
  commercialPagination,
  listTenantClients,
  listTenantPipelineCases,
  listTenantProjects,
} from "../api/_lib/commercialTenancyRead.js";

const ROUNDS = 30;
const FIXTURE_COUNT = 2_000;
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

async function measure(name, operation, rounds = ROUNDS) {
  for (let index = 0; index < 5; index += 1) await operation();
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

function summarizePlan(value) {
  const root = value?.[0]?.["QUERY PLAN"]?.[0];
  const indexes = new Set();
  const nodes = [];
  let rowsRemovedByFilter = 0;
  let sharedHitBlocks = 0;
  let sharedReadBlocks = 0;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node["Node Type"]) nodes.push(node["Node Type"]);
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    rowsRemovedByFilter += Number(node["Rows Removed by Filter"] || 0);
    sharedHitBlocks += Number(node["Shared Hit Blocks"] || 0);
    sharedReadBlocks += Number(node["Shared Read Blocks"] || 0);
    for (const child of node.Plans || []) visit(child);
  }
  visit(root?.Plan);
  return {
    planningMs: Number(root?.["Planning Time"] || 0),
    executionMs: Number(root?.["Execution Time"] || 0),
    returnedRows: Number(root?.Plan?.["Actual Rows"] || 0),
    rowsRemovedByFilter,
    sharedHitBlocks,
    sharedReadBlocks,
    nodes,
    indexes: [...indexes],
  };
}

async function explain(sql, ...parameters) {
  return summarizePlan(await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    ...parameters,
  ));
}

function tenantWhere(tenantId, extra = {}) {
  return { tenantId, ...extra };
}

function legacyRelationWhere(tenantId, extra = {}) {
  return {
    tenantId,
    tenantClient: { is: { tenantId } },
    ...extra,
  };
}

async function countAndPage(where, pagination, include) {
  return prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.pageSize,
      omit: { tenantId: true },
      ...(include ? { include } : {}),
    }),
  ]);
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
  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    const tenant = tenants[index % 2];
    const clientId = `${run}-client-${index}`;
    clients.push({
      id: clientId,
      tenantId: tenant.tenantId,
      code: `${run}-C-${String(index).padStart(4, "0")}`.toUpperCase(),
      name: `Cliente rendimiento ${String(index).padStart(4, "0")}`,
      email: `${index}@example.invalid`,
      phone: "0000000000",
      address: "Local",
      type: "corporate",
      status: index % 4 === 0 ? "inactive" : "active",
      createdAt: "2026-08-10",
    });
    projects.push({
      id: `${run}-project-${index}`,
      tenantId: tenant.tenantId,
      code: `${run}-P-${String(index).padStart(4, "0")}`.toUpperCase(),
      name: `Proyecto rendimiento ${String(index).padStart(4, "0")}`,
      clientId,
      clientName: `Cliente rendimiento ${String(index).padStart(4, "0")}`,
      status: index % 4 === 0 ? "inactive" : "active",
      startDate: `2099-12-${String((index % 28) + 1).padStart(2, "0")}`,
    });
    pipelineCases.push({
      id: `${run}-pipeline-${index}`,
      tenantId: tenant.tenantId,
      caseCode: `${run}-CASE-${index}`.toUpperCase(),
      mode: "LOCAL",
      serviceType: "MOVING",
      customerType: "L4_PERSONAL",
      ownerName: "Sin asignar",
      originLocation: "Origen",
      destinationLocation: "Destino",
    });
  }
  await prisma.client.createMany({ data: clients });
  await prisma.project.createMany({ data: projects });
  await prisma.pipelineCase.createMany({ data: pipelineCases });
  ids.clients.push(...clients.map(({ id }) => id));
  ids.projects.push(...projects.map(({ id }) => id));
  ids.pipelineCases.push(...pipelineCases.map(({ id }) => id));
  await prisma.$executeRawUnsafe("ANALYZE osi.osi_clients, osi.osi_projects, osi.osi_pipeline_cases");

  check("fixtures Project y Client quedan fuera del cronómetro", (
    await prisma.project.count({ where: { id: { startsWith: run } } }) === FIXTURE_COUNT
    && await prisma.client.count({ where: { id: { startsWith: run } } }) === FIXTURE_COUNT
  ));
  check("fixture PipelineCase completo", await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === FIXTURE_COUNT);

  const tenantId = tenants[0].tenantId;
  const tenantClientId = clients[1].tenantId === tenantId ? clients[1].id : clients[0].id;
  const exactProject = projects.find((project) => project.tenantId === tenantId && project.status === "active");
  const firstPage = commercialPagination({ page: "1", pageSize: "100" });
  const deepPage = commercialPagination({ page: "9", pageSize: "100" });
  check("pageSize queda limitado a 100", firstPage.pageSize === 100 && commercialPagination({ pageSize: "999" }).pageSize === 100);

  const metrics = [];
  metrics.push(await measure("Project baseline relation check / first page", () => countAndPage(legacyRelationWhere(tenantId), firstPage)));
  metrics.push(await measure("Project TENANT_READ / first page", () => listTenantProjects(prisma, { tenantId, query: "", ...firstPage })));
  metrics.push(await measure("Project TENANT_READ / deep page", () => listTenantProjects(prisma, { tenantId, query: "", ...deepPage })));
  metrics.push(await measure("Project status filter", () => countAndPage(tenantWhere(tenantId, { status: "active" }), firstPage)));
  metrics.push(await measure("Project exact code", () => countAndPage(tenantWhere(tenantId, { code: exactProject.code }), firstPage)));
  metrics.push(await measure("Project name contains", () => countAndPage(tenantWhere(tenantId, { name: { contains: "rendimiento 01", mode: "insensitive" } }), firstPage)));
  metrics.push(await measure("Project related Client", () => countAndPage(tenantWhere(tenantId, { clientId: tenantClientId }), firstPage, { tenantClient: { select: { id: true, code: true, name: true } } })));
  metrics.push(await measure("Project count only", () => prisma.project.count({ where: tenantWhere(tenantId) })));
  metrics.push(await measure("Project rows only", () => prisma.project.findMany({
    where: tenantWhere(tenantId),
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
    take: 100,
    omit: { tenantId: true },
  })));
  metrics.push(await measure("Project include Client", () => prisma.project.findMany({
    where: tenantWhere(tenantId),
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
    take: 100,
    omit: { tenantId: true },
    include: { tenantClient: { select: { id: true, code: true, name: true } } },
  })));
  metrics.push(await measure("Project LEGACY_ONLY full list", () => prisma.project.findMany({
    orderBy: { startDate: "desc" },
    omit: { tenantId: true },
  })));
  metrics.push(await measure("Client regression", () => listTenantClients(prisma, { tenantId, query: "", ...firstPage })));
  metrics.push(await measure("PipelineCase regression", () => listTenantPipelineCases(prisma, { tenantId, ...firstPage })));

  const plans = {
    baselineCount: await explain(`
      SELECT count(*) FROM osi.osi_projects p
      WHERE p.tenant_id = $1
        AND EXISTS (
          SELECT 1 FROM osi.osi_clients c
          WHERE c.tenant_id = p.tenant_id AND c.id = p."clientId" AND c.tenant_id = $1
        )
    `, tenantId),
    optimizedCount: await explain("SELECT count(*) FROM osi.osi_projects WHERE tenant_id = $1", tenantId),
    baselineRows: await explain(`
      SELECT p.* FROM osi.osi_projects p
      WHERE p.tenant_id = $1
        AND EXISTS (
          SELECT 1 FROM osi.osi_clients c
          WHERE c.tenant_id = p.tenant_id AND c.id = p."clientId" AND c.tenant_id = $1
        )
      ORDER BY p."startDate" DESC, p.id ASC LIMIT 100
    `, tenantId),
    optimizedRows: await explain(`
      SELECT * FROM osi.osi_projects
      WHERE tenant_id = $1 ORDER BY "startDate" DESC, id ASC LIMIT 100
    `, tenantId),
    deepPage: await explain(`
      SELECT * FROM osi.osi_projects
      WHERE tenant_id = $1 ORDER BY "startDate" DESC, id ASC LIMIT 100 OFFSET 800
    `, tenantId),
    status: await explain(`
      SELECT * FROM osi.osi_projects
      WHERE tenant_id = $1 AND status = $2 ORDER BY "startDate" DESC, id ASC LIMIT 100
    `, tenantId, "active"),
    exactCode: await explain(`
      SELECT * FROM osi.osi_projects
      WHERE tenant_id = $1 AND code = $2 ORDER BY "startDate" DESC, id ASC LIMIT 100
    `, tenantId, exactProject.code),
    nameContains: await explain(`
      SELECT * FROM osi.osi_projects
      WHERE tenant_id = $1 AND name ILIKE $2 ORDER BY "startDate" DESC, id ASC LIMIT 100
    `, tenantId, "%rendimiento 01%"),
    relatedClient: await explain(`
      SELECT p.*, c.id AS related_client_id
      FROM osi.osi_projects p
      INNER JOIN osi.osi_clients c ON c.tenant_id = p.tenant_id AND c.id = p."clientId"
      WHERE p.tenant_id = $1 AND p."clientId" = $2
      ORDER BY p."startDate" DESC, p.id ASC LIMIT 100
    `, tenantId, tenantClientId),
  };
  const projectIndexes = (await prisma.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'osi' AND tablename = 'osi_projects'
    ORDER BY indexname
  `)).map(({ indexname }) => indexname);

  const page = await listTenantProjects(prisma, { tenantId, query: "", ...firstPage });
  const [baselineTotal, baselineData] = await countAndPage(legacyRelationWhere(tenantId), firstPage);
  const deep = await listTenantProjects(prisma, { tenantId, query: "", ...deepPage });
  const queryCounts = { count: 0, findMany: 0 };
  const countedPrisma = {
    project: {
      count: (...args) => { queryCounts.count += 1; return prisma.project.count(...args); },
      findMany: (...args) => { queryCounts.findMany += 1; return prisma.project.findMany(...args); },
    },
    $transaction: (...args) => prisma.$transaction(...args),
  };
  await listTenantProjects(countedPrisma, { tenantId, query: "", ...firstPage });
  check("TENANT_READ conserva total y página exactos", page.total === FIXTURE_COUNT / 2 && page.data.length === 100);
  check("optimización conserva resultados y orden del filtro relacional", (
    baselineTotal === page.total
    && JSON.stringify(baselineData.map(({ id }) => id)) === JSON.stringify(page.data.map(({ id }) => id))
  ));
  check("paginación profunda permanece estable y sin solapamiento", (
    deep.total === page.total
    && deep.data.length === 100
    && !deep.data.some(({ id }) => page.data.some((project) => project.id === id))
  ));
  check("TENANT_READ no expone tenantId", page.data.every((project) => !("tenantId" in project)));
  check("TENANT_READ ejecuta exactamente count y página, sin N+1", queryCounts.count === 1 && queryCounts.findMany === 1, queryCounts);
  check("planes capturan ANALYZE y BUFFERS", Object.values(plans).every((plan) => (
    Number.isFinite(plan.executionMs) && Number.isFinite(plan.sharedHitBlocks)
  )));
  check("código exacto dispone del índice unique existente", plans.exactCode.indexes.some((index) => /code_key/i.test(index)), plans.exactCode);
  check("estado dispone del índice tenant-first existente", projectIndexes.some((index) => /tenant_id_status_idx/i.test(index)), { projectIndexes, plan: plans.status });
  check("relación Client dispone del índice tenant/client existente", projectIndexes.some((index) => /tenant_id_client_id_idx/i.test(index)), { projectIndexes, plan: plans.relatedClient });
  const metric = (name) => metrics.find((entry) => entry.name === name);
  check("lista Project cumple p95 <= 25 ms", metric("Project TENANT_READ / first page").p95Ms <= 25, metric("Project TENANT_READ / first page"));
  check("código exacto cumple p95 <= 25 ms", metric("Project exact code").p95Ms <= 25, metric("Project exact code"));
  check("búsqueda textual cumple p95 <= 75 ms", metric("Project name contains").p95Ms <= 75, metric("Project name contains"));
  check("Client y PipelineCase permanecen bajo 25 ms p95", (
    metric("Client regression").p95Ms <= 25 && metric("PipelineCase regression").p95Ms <= 25
  ), { client: metric("Client regression"), pipeline: metric("PipelineCase regression") });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    assertions: assertions.length,
    fixtureCount: FIXTURE_COUNT,
    target,
    metrics,
    plans,
    projectIndexes,
    results: assertions,
  }, null, 2)}\n`);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
