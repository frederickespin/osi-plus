import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMt01c2b1LocalPrisma } from "./mt-01c2b1-local-target.mjs";

process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
process.env.JWT_SECRET ||= "mt01c2b1-local-contract-secret-not-for-production";

const { prisma, identity } = await createMt01c2b1LocalPrisma();
process.env.DATABASE_URL = process.env.MT01C2B1_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.MT01C2B1_TEST_DATABASE_URL;

const [{ signAccessToken }, { default: clientsHandler }, { default: projectsHandler }] = await Promise.all([
  import("../api/_lib/auth.js"),
  import("../api/clients/index.js"),
  import("../api/projects/index.js"),
]);

const run = `c2b1-${randomUUID().slice(0, 8)}`;
const results = [];
const created = { tenants: [], users: [], memberships: [], clients: [], projects: [], leads: [], pipelineCases: [] };

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function invoke(handler, token, { method = "GET", body, headers = {} } = {}) {
  const req = { method, headers: { authorization: `Bearer ${token}`, ...headers }, query: {}, body };
  const res = mockResponse();
  await handler(req, res);
  return res;
}

function clientData(id, code, tenantId = undefined) {
  return {
    id, code, name: "Cliente sintético C2B1", email: "shared-c2b1@example.test", phone: "0000000000",
    address: "Local", type: "corporate", status: "active", createdAt: "2026-08-09",
    ...(tenantId === undefined ? {} : { tenantId }),
  };
}

function projectData(id, code, clientId, tenantId = undefined) {
  return {
    id, code, name: "Proyecto sintético C2B1", clientId, clientName: "Cliente sintético C2B1",
    status: "active", startDate: "2026-08-09", ...(tenantId === undefined ? {} : { tenantId }),
  };
}

function pipelineData(id, code, extra = {}) {
  return {
    id, caseCode: code, mode: "LOCAL", serviceType: "MOVING", customerType: "L3_CORPORATE",
    ownerName: "Sin asignar", originLocation: "A", destinationLocation: "B", ...extra,
  };
}

async function fails(operation) {
  try { await operation(); return false; } catch { return true; }
}

async function rootFingerprint() {
  const rows = await Promise.all([
    prisma.client.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.project.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.lead.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.pipelineCase.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
  ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

const initialFingerprint = await rootFingerprint();
try {
  for (const suffix of ["a", "b"]) {
    const tenant = await prisma.tenant.create({ data: { id: `${run}-tenant-${suffix}`, code: `${run.toUpperCase()}-${suffix.toUpperCase()}`, name: `Tenant ${suffix}` } });
    created.tenants.push(tenant.id);
    const user = await prisma.user.create({ data: {
      id: `${run}-user-${suffix}`, code: `${run.toUpperCase()}-U-${suffix.toUpperCase()}`, name: `Actor ${suffix}`,
      email: `${run}-${suffix}@example.test`, phone: "0000000000", role: "A", status: "active",
      joinDate: "2026-08-09", passwordHash: "synthetic-no-login",
    } });
    created.users.push(user.id);
    const membership = await prisma.tenantMembership.create({ data: { id: `${run}-membership-${suffix}`, tenantId: tenant.id, userId: user.id, role: "A", status: "ACTIVE" } });
    created.memberships.push(membership.id);
  }
  const [tenantA, tenantB] = created.tenants;
  const [userA, userB] = created.users;
  const [membershipA, membershipB] = created.memberships;

  const inactiveUser = await prisma.user.create({ data: {
    id: `${run}-user-inactive-membership`, code: `${run.toUpperCase()}-U-INACTIVE`, name: "Actor inactive membership",
    email: `${run}-inactive@example.test`, phone: "0000000000", role: "A", status: "active",
    joinDate: "2026-08-09", passwordHash: "synthetic-no-login",
  } });
  created.users.push(inactiveUser.id);
  const inactiveMembership = await prisma.tenantMembership.create({ data: {
    id: `${run}-membership-inactive`, tenantId: tenantA, userId: inactiveUser.id, role: "A", status: "INACTIVE",
  } });
  created.memberships.push(inactiveMembership.id);

  const ambiguousUser = await prisma.user.create({ data: {
    id: `${run}-user-ambiguous`, code: `${run.toUpperCase()}-U-AMBIGUOUS`, name: "Actor ambiguous membership",
    email: `${run}-ambiguous@example.test`, phone: "0000000000", role: "A", status: "active",
    joinDate: "2026-08-09", passwordHash: "synthetic-no-login",
  } });
  created.users.push(ambiguousUser.id);
  for (const [suffix, tenantId] of [["a", tenantA], ["b", tenantB]]) {
    const membership = await prisma.tenantMembership.create({ data: {
      id: `${run}-membership-ambiguous-${suffix}`, tenantId, userId: ambiguousUser.id, role: "A", status: "ACTIVE",
    } });
    created.memberships.push(membership.id);
  }

  const legacyClient = await prisma.client.create({ data: clientData(`${run}-client-legacy`, `${run}-CLI-LEGACY`) });
  created.clients.push(legacyClient.id);
  check("inserción Client heredada conserva tenantId NULL", legacyClient.tenantId === null);
  const clientA = await prisma.client.create({ data: clientData(`${run}-client-a`, `${run}-CLI-A`, tenantA) });
  const clientB = await prisma.client.create({ data: clientData(`${run}-client-b`, `${run}-CLI-B`, tenantB) });
  created.clients.push(clientA.id, clientB.id);
  check("identificadores no únicos pueden repetirse entre tenants", clientA.email === clientB.email && clientA.name === clientB.name);
  check("tenant inexistente es rechazado", await fails(() => prisma.client.create({ data: clientData(`${run}-bad-client`, `${run}-CLI-BAD`, `${run}-missing`) })));
  check("unicidad global de code permanece sin cambios", await fails(() => prisma.client.create({ data: clientData(`${run}-duplicate-code`, clientA.code, tenantB) })));

  const legacyProject = await prisma.project.create({ data: projectData(`${run}-project-legacy`, `${run}-PRJ-LEGACY`, legacyClient.id) });
  created.projects.push(legacyProject.id);
  check("inserción Project heredada conserva tenantId NULL", legacyProject.tenantId === null);
  const projectA = await prisma.project.create({ data: projectData(`${run}-project-a`, `${run}-PRJ-A`, clientA.id, tenantA) });
  const projectB = await prisma.project.create({ data: projectData(`${run}-project-b`, `${run}-PRJ-B`, clientB.id, tenantB) });
  created.projects.push(projectA.id, projectB.id);
  check("Project y Client del mismo tenant aceptados", projectA.tenantId === tenantA && projectA.clientId === clientA.id);
  check("Project y Client cruzados rechazados", await fails(() => prisma.project.create({ data: projectData(`${run}-project-cross`, `${run}-PRJ-CROSS`, clientA.id, tenantB) })));
  check("Project con tenant inexistente rechazado", await fails(() => prisma.project.create({ data: projectData(`${run}-project-missing`, `${run}-PRJ-MISSING`, clientA.id, `${run}-missing`) })));

  const legacyLead = await prisma.lead.create({ data: { id: `${run}-lead-legacy`, code: `${run}-LEAD-LEGACY`, status: "new", clientName: "Legacy", customerId: legacyClient.id } });
  created.leads.push(legacyLead.id);
  check("inserción Lead heredada conserva tenantId NULL", legacyLead.tenantId === null);
  const leadA = await prisma.lead.create({ data: { id: `${run}-lead-a`, code: `${run}-LEAD-A`, status: "new", clientName: "A", tenantId: tenantA, customerId: clientA.id, projectId: projectA.id } });
  created.leads.push(leadA.id);
  check("Lead conserva sus relaciones actuales dentro del tenant", leadA.tenantId === tenantA);
  check("Lead y Client cruzados rechazados", await fails(() => prisma.lead.create({ data: { id: `${run}-lead-cross-client`, code: `${run}-LEAD-XC`, status: "new", clientName: "X", tenantId: tenantA, customerId: clientB.id } })));
  check("Lead y Project cruzados rechazados", await fails(() => prisma.lead.create({ data: { id: `${run}-lead-cross-project`, code: `${run}-LEAD-XP`, status: "new", clientName: "X", tenantId: tenantA, projectId: projectB.id } })));
  const conflictingEvidenceLead = await prisma.lead.create({ data: {
    id: `${run}-lead-evidence-conflict`, code: `${run}-LEAD-EVIDENCE-CONFLICT`, status: "new",
    clientName: "Conflicting evidence", customerId: clientA.id, projectId: projectB.id,
  } });
  created.leads.push(conflictingEvidenceLead.id);

  const legacyPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-legacy`, `${run}-CASE-LEGACY`) });
  created.pipelineCases.push(legacyPipeline.id);
  check("PipelineCase heredado conserva campos empresariales NULL", legacyPipeline.tenantId === null && legacyPipeline.ownerMembershipId === null && legacyPipeline.ownerUserId === null);
  const unassignedPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-unassigned`, `${run}-CASE-UNASSIGNED`, { tenantId: tenantA }) });
  created.pipelineCases.push(unassignedPipeline.id);
  check("PipelineCase tenantizado puede permanecer sin owner", unassignedPipeline.tenantId === tenantA && unassignedPipeline.ownerMembershipId === null);
  const ownedPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-owned`, `${run}-CASE-OWNED`, { tenantId: tenantA, ownerMembershipId: membershipA, ownerUserId: userA, ownerName: "Actor A" }) });
  created.pipelineCases.push(ownedPipeline.id);
  check("owner empresarial válido aceptado", ownedPipeline.ownerMembershipId === membershipA && ownedPipeline.ownerUserId === userA);
  const convertibleOwnerPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-owner-convertible`, `${run}-CASE-OWNER-CONVERTIBLE`, { ownerId: userA, ownerName: "Actor A" }) });
  created.pipelineCases.push(convertibleOwnerPipeline.id);
  check("owner heredado permanece disponible para dry-run", convertibleOwnerPipeline.ownerId === userA && convertibleOwnerPipeline.tenantId === null);
  check("owner de otro tenant rechazado", await fails(() => prisma.pipelineCase.create({ data: pipelineData(`${run}-case-cross-owner`, `${run}-CASE-CROSS`, { tenantId: tenantA, ownerMembershipId: membershipB, ownerUserId: userB }) })));
  check("membership y user incompatibles son rechazados", await fails(() => prisma.pipelineCase.create({ data: pipelineData(`${run}-case-wrong-user`, `${run}-CASE-WRONG-USER`, { tenantId: tenantA, ownerMembershipId: membershipA, ownerUserId: userB }) })));
  check("owner incompleto membership-only rechazado", await fails(() => prisma.pipelineCase.create({ data: pipelineData(`${run}-case-partial-m`, `${run}-CASE-PM`, { tenantId: tenantA, ownerMembershipId: membershipA }) })));
  check("owner incompleto user-only rechazado", await fails(() => prisma.pipelineCase.create({ data: pipelineData(`${run}-case-partial-u`, `${run}-CASE-PU`, { tenantId: tenantA, ownerUserId: userA }) })));
  check("owner completo sin tenant rechazado", await fails(() => prisma.pipelineCase.create({ data: pipelineData(`${run}-case-no-tenant`, `${run}-CASE-NT`, { ownerMembershipId: membershipA, ownerUserId: userA }) })));

  const inactiveOwnerPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-owner-inactive`, `${run}-CASE-OWNER-INACTIVE`, { ownerId: inactiveUser.id }) });
  const ambiguousOwnerPipeline = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-owner-ambiguous`, `${run}-CASE-OWNER-AMBIGUOUS`, { ownerId: ambiguousUser.id }) });
  const normalizedDuplicateA = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-normalized-a`, `${run}-CASE-NORMALIZED`, { ownerId: userA }) });
  const normalizedDuplicateB = await prisma.pipelineCase.create({ data: pipelineData(`${run}-case-normalized-b`, `${run}-case-normalized`, { ownerId: userA }) });
  created.pipelineCases.push(inactiveOwnerPipeline.id, ambiguousOwnerPipeline.id, normalizedDuplicateA.id, normalizedDuplicateB.id);

  const legacyToken = signAccessToken({ sub: userA, email: `${run}-a@example.test`, role: "A" });
  const clientsResponse = await invoke(clientsHandler, legacyToken);
  const projectsResponse = await invoke(projectsHandler, legacyToken);
  check("GET /api/clients conserva envoltura LEGACY", clientsResponse.statusCode === 200 && JSON.stringify(Object.keys(clientsResponse.body).sort()) === JSON.stringify(["data", "ok", "total"]));
  check("GET /api/projects conserva envoltura LEGACY", projectsResponse.statusCode === 200 && JSON.stringify(Object.keys(projectsResponse.body).sort()) === JSON.stringify(["data", "ok", "total"]));
  check("Client no expone tenantId", clientsResponse.body.data.every((row) => !Object.hasOwn(row, "tenantId")));
  check("Project no expone tenantId", projectsResponse.body.data.every((row) => !Object.hasOwn(row, "tenantId")));
  check("contratos no exponen owner empresarial", JSON.stringify([clientsResponse.body, projectsResponse.body]).match(/ownerMembershipId|ownerUserId/) === null);

  const forgedClientResponse = await invoke(clientsHandler, legacyToken, { method: "POST", headers: { "x-osi-role": "A", "x-osi-userid": userB }, body: {
    code: `${run}-CLI-FORGED`, name: "Forged tenant ignored", email: `${run}-forged-client@example.test`, phone: "0000000000",
    address: "Local", type: "corporate", status: "active", tenantId: tenantB,
  } });
  check("POST Client con tenantId falsificado conserva contrato", forgedClientResponse.statusCode === 201 && !Object.hasOwn(forgedClientResponse.body.data, "tenantId"));
  created.clients.push(forgedClientResponse.body.data.id);
  const forgedClient = await prisma.client.findUnique({ where: { id: forgedClientResponse.body.data.id } });
  check("headers y body falsificados no escriben Client.tenantId", forgedClient?.tenantId === null);

  const forgedProjectResponse = await invoke(projectsHandler, legacyToken, { method: "POST", headers: { "x-osi-role": "A", "x-osi-userid": userB }, body: {
    code: `${run}-PRJ-FORGED`, name: "Forged tenant ignored", clientId: legacyClient.id, clientName: legacyClient.name,
    status: "active", startDate: "2026-08-09", tenantId: tenantB,
  } });
  check("POST Project con tenantId falsificado conserva contrato", forgedProjectResponse.statusCode === 201 && !Object.hasOwn(forgedProjectResponse.body.data, "tenantId"));
  created.projects.push(forgedProjectResponse.body.data.id);
  const forgedProject = await prisma.project.findUnique({ where: { id: forgedProjectResponse.body.data.id } });
  check("headers y body falsificados no escriben Project.tenantId", forgedProject?.tenantId === null);

  const dryRunProcess = spawnSync(process.execPath, ["scripts/mt-01c2b1-dry-run.mjs"], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
  const dryRun = dryRunProcess.status === 0 ? JSON.parse(dryRunProcess.stdout) : null;
  check("dry-run usa transacción READ ONLY y cero escrituras", dryRun?.readOnly === true && dryRun?.wroteRows === 0);
  check("dry-run clasifica las cuatro raíces sintéticas", dryRun?.roots?.Client?.total >= 3 && dryRun?.roots?.Project?.total >= 3 && dryRun?.roots?.Lead?.total >= 2 && dryRun?.roots?.PipelineCase?.total >= 4, dryRun?.roots);
  check("dry-run identifica owner convertible sin inferirlo", dryRun?.owners?.convertible >= 1 && dryRun?.decisions?.inferredRows === 0);
  check("dry-run identifica owner sin membresía activa", dryRun?.owners?.withoutActiveMembership >= 1);
  check("dry-run identifica owner ambiguo entre tenants", dryRun?.owners?.ambiguousBetweenTenants >= 1);
  check("dry-run identifica evidencia padre/hijo contradictoria", dryRun?.parentChildContradictions?.leadEvidenceConflict >= 1);
  check("dry-run identifica colisión normalizada bajo evidencia tenant", dryRun?.potentialNormalizedDuplicatesUnderTenantEvidence?.pipelineCaseCode >= 1);

  check("Client tenantizado no se elimina mientras Project lo referencia", await fails(() => prisma.client.delete({ where: { id: clientA.id } })));
  check("fallo RESTRICT no elimina parcialmente Project o Client", (await prisma.client.count({ where: { id: clientA.id } })) === 1 && (await prisma.project.count({ where: { id: projectA.id } })) === 1);

  const cascadeClient = await prisma.client.create({ data: clientData(`${run}-client-cascade`, `${run}-CLI-CASCADE`) });
  const cascadeProject = await prisma.project.create({ data: projectData(`${run}-project-cascade`, `${run}-PRJ-CASCADE`, cascadeClient.id) });
  created.clients.push(cascadeClient.id);
  created.projects.push(cascadeProject.id);
  await prisma.client.delete({ where: { id: cascadeClient.id } });
  check("Project legacy conserva ON DELETE CASCADE", (await prisma.project.count({ where: { id: cascadeProject.id } })) === 0);

  const mt01c2b1Indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='osi' AND indexname ~ '^osi_(clients|projects|leads|pipeline_cases)_tenant'
    ORDER BY indexname
  `);
  const normalizedIndexDefinitions = mt01c2b1Indexes.map((row) => row.indexdef.replace(/^CREATE UNIQUE INDEX|^CREATE INDEX/, "CREATE INDEX"));
  check("migración crea exactamente 12 índices tenant y ninguno exacto redundante", mt01c2b1Indexes.length === 12 && new Set(normalizedIndexDefinitions).size === 12, mt01c2b1Indexes.map((row) => row.indexname));

  const timings = [];
  for (let index = 0; index < 100; index += 1) {
    const started = performance.now();
    await prisma.project.findMany({ where: { tenantId: tenantA }, select: { id: true }, take: 20 });
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const metrics = {
    samples: timings.length,
    p50Ms: Number(timings[Math.floor(timings.length * 0.50)].toFixed(3)),
    p95Ms: Number(timings[Math.floor(timings.length * 0.95)].toFixed(3)),
    maxMs: Number(timings.at(-1).toFixed(3)),
  };
  check("consulta tenant-first responde en prueba local", metrics.maxMs < 5_000, metrics);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, target: identity, metrics, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, results, error: { name: error.name, code: error.code, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.lead.deleteMany({ where: { id: { in: created.leads } } }).catch(() => {});
  await prisma.pipelineCase.deleteMany({ where: { id: { in: created.pipelineCases } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } }).catch(() => {});
  await prisma.client.deleteMany({ where: { id: { in: created.clients } } }).catch(() => {});
  await prisma.tenantMembership.deleteMany({ where: { id: { in: created.memberships } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } }).catch(() => {});
  const finalFingerprint = await rootFingerprint().catch(() => null);
  if (finalFingerprint !== initialFingerprint) {
    process.stderr.write("MT01C2B1_TEST_CLEANUP_FAILED: fingerprint de raíces no restaurado\n");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
