import { createHash } from "node:crypto";

export const MT01C2B2 = Object.freeze({
  batchId: "MT-01C2B2-IPACKERS-DO-V1",
  tenantCode: "IPACKERS-DO",
  expected: Object.freeze({ clients: 7, projects: 2, leads: 0, pipelineCases: 51, mappedOwners: 39, unassigned: 12 }),
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function invariant(condition, code, message) { if (!condition) fail(code, message); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
const stable = (value) => JSON.stringify(canonicalize(value));
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
const rowHash = (business, enterprise) => digest({ businessHash: digest(business), enterprise });

function manifestBody(manifest) {
  const { manifestHash, ...body } = manifest || {};
  return { body, manifestHash };
}

export function assertMt01c2b2Manifest(manifest) {
  const { body, manifestHash } = manifestBody(manifest);
  invariant(manifest && typeof manifest === "object", "MT01C2B2_MANIFEST_INVALID", "Manifest ausente o inválido");
  invariant(manifestHash === digest(body), "MT01C2B2_MANIFEST_INVALID", "SHA-256 del manifest no coincide");
  invariant(body.batchId === MT01C2B2.batchId, "MT01C2B2_MANIFEST_BATCH_INVALID", "Batch ID del manifest no coincide");
  invariant(Array.isArray(body.clients) && body.clients.length === 7, "MT01C2B2_MANIFEST_CLIENTS_INVALID", "Manifest Client inválido");
  invariant(Array.isArray(body.projects) && body.projects.length === 2, "MT01C2B2_MANIFEST_PROJECTS_INVALID", "Manifest Project inválido");
  invariant(Array.isArray(body.pipelineCases) && body.pipelineCases.length === 51, "MT01C2B2_MANIFEST_CASES_INVALID", "Manifest PipelineCase inválido");
  const serialized = stable(body);
  invariant(!/(?:email|phone|name|payload|token|secret|milestone)/i.test(serialized), "MT01C2B2_MANIFEST_PII", "El manifest contiene campos no autorizados");
  return Object.freeze(manifest);
}

async function selectTenant(tx, lock = false) {
  const suffix = lock ? " FOR SHARE" : "";
  const rows = await tx.$queryRawUnsafe(`SELECT id,code,status FROM osi.tenants WHERE code='IPACKERS-DO'${suffix}`);
  const tenant = rows[0];
  invariant(rows.length === 1 && tenant.status === "ACTIVE", "MT01C2B2_TENANT_INVALID", "IPACKERS-DO no existe o no está ACTIVE");
  return tenant;
}

async function selectClients(tx, lock = false) {
  return tx.$queryRawUnsafe(`SELECT id,tenant_id,to_jsonb(c)-'tenant_id' AS business FROM osi.osi_clients c ORDER BY id${lock ? " FOR UPDATE" : ""}`);
}
async function selectProjects(tx, lock = false) {
  return tx.$queryRawUnsafe(`SELECT id,tenant_id,"clientId",to_jsonb(p)-'tenant_id' AS business FROM osi.osi_projects p ORDER BY id${lock ? " FOR UPDATE" : ""}`);
}
async function selectLeads(tx) {
  return tx.$queryRawUnsafe("SELECT id,tenant_id FROM osi.osi_leads ORDER BY id");
}
async function selectCases(tx, lock = false) {
  return tx.$queryRawUnsafe(`SELECT id,tenant_id,"ownerId",owner_membership_id,owner_user_id,to_jsonb(p)-'tenant_id'-'owner_membership_id'-'owner_user_id' AS business FROM osi.osi_pipeline_cases p ORDER BY id${lock ? " FOR UPDATE" : ""}`);
}
async function selectActiveMemberships(tx, lock = false) {
  return tx.$queryRawUnsafe(`
    SELECT m.id,m.tenant_id,m.user_id,m.status
    FROM osi.tenant_memberships m
    JOIN osi.osi_users u ON u.id=m.user_id
    WHERE m.status='ACTIVE'
    ORDER BY m.user_id,m.id${lock ? " FOR SHARE OF m,u" : ""}
  `);
}

function enterpriseState(rows, legacy, applied) {
  if (rows.every(legacy)) return "LEGACY";
  if (rows.every(applied)) return "APPLIED";
  return "PARTIAL";
}

function analyzeRows({ tenant, clients, projects, leads, pipelineCases, memberships }) {
  const expected = MT01C2B2.expected;
  invariant(clients.length === expected.clients, "MT01C2B2_CLIENT_COUNT", `Client ${clients.length}/${expected.clients}`);
  invariant(projects.length === expected.projects, "MT01C2B2_PROJECT_COUNT", `Project ${projects.length}/${expected.projects}`);
  invariant(leads.length === expected.leads, "MT01C2B2_LEAD_NOT_EMPTY", "Lead debe permanecer vacío");
  invariant(pipelineCases.length === expected.pipelineCases, "MT01C2B2_CASE_COUNT", `PipelineCase ${pipelineCases.length}/${expected.pipelineCases}`);

  const clientIds = new Set(clients.map((row) => row.id));
  for (const row of projects) invariant(clientIds.has(row.clientId), "MT01C2B2_PROJECT_CLIENT_UNKNOWN", "Project referencia Client fuera del lote aprobado");

  const activeByUser = new Map();
  for (const membership of memberships) activeByUser.set(membership.user_id, [...(activeByUser.get(membership.user_id) || []), membership]);
  const casePlans = pipelineCases.map((row) => {
    const active = row.ownerId ? (activeByUser.get(row.ownerId) || []) : [];
    const compatible = active.length === 1 && active[0].tenant_id === tenant.id ? active[0] : null;
    const proposed = Object.freeze({ tenantId: tenant.id, ownerMembershipId: compatible?.id || null, ownerUserId: compatible?.user_id || null });
    const before = { tenantId: null, ownerMembershipId: null, ownerUserId: null };
    const current = { tenantId: row.tenant_id, ownerMembershipId: row.owner_membership_id, ownerUserId: row.owner_user_id };
    return {
      id: row.id,
      beforeHash: rowHash(row.business, before),
      proposed,
      expectedAfterHash: rowHash(row.business, proposed),
      currentHash: rowHash(row.business, current),
    };
  });
  const mappedOwners = casePlans.filter((row) => row.proposed.ownerMembershipId).length;
  const unassigned = casePlans.length - mappedOwners;
  invariant(mappedOwners === expected.mappedOwners, "MT01C2B2_OWNER_COUNT", `Owners ${mappedOwners}/${expected.mappedOwners}`);
  invariant(unassigned === expected.unassigned, "MT01C2B2_UNASSIGNED_COUNT", `Sin asignar ${unassigned}/${expected.unassigned}`);

  const clientPlans = clients.map((row) => ({
    id: row.id,
    beforeHash: rowHash(row.business, { tenantId: null }),
    proposed: { tenantId: tenant.id },
    expectedAfterHash: rowHash(row.business, { tenantId: tenant.id }),
    currentHash: rowHash(row.business, { tenantId: row.tenant_id }),
  }));
  const projectPlans = projects.map((row) => ({
    id: row.id,
    beforeHash: rowHash(row.business, { tenantId: null }),
    proposed: { tenantId: tenant.id },
    expectedAfterHash: rowHash(row.business, { tenantId: tenant.id }),
    currentHash: rowHash(row.business, { tenantId: row.tenant_id }),
  }));
  const states = [
    enterpriseState(clientPlans, (row) => row.currentHash === row.beforeHash, (row) => row.currentHash === row.expectedAfterHash),
    enterpriseState(projectPlans, (row) => row.currentHash === row.beforeHash, (row) => row.currentHash === row.expectedAfterHash),
    enterpriseState(casePlans, (row) => row.currentHash === row.beforeHash, (row) => row.currentHash === row.expectedAfterHash),
  ];
  const state = states.every((value) => value === "LEGACY") ? "LEGACY" : states.every((value) => value === "APPLIED") ? "APPLIED" : "PARTIAL";
  invariant(state !== "PARTIAL", "MT01C2B2_PARTIAL_STATE", `Estado parcial o desconocido: ${states.join("/")}`);

  const clean = (row) => ({ id: row.id, beforeHash: row.beforeHash, proposed: row.proposed, expectedAfterHash: row.expectedAfterHash });
  const body = { batchId: MT01C2B2.batchId, clients: clientPlans.map(clean), projects: projectPlans.map(clean), pipelineCases: casePlans.map(clean) };
  const manifest = assertMt01c2b2Manifest(Object.freeze({ ...body, manifestHash: digest(body) }));
  return { manifest, state, summary: { ...expected, tenantCode: MT01C2B2.tenantCode, manifestHash: manifest.manifestHash, automaticInference: false } };
}

async function loadUnlocked(tx) {
  const tenant = await selectTenant(tx);
  const clients = await selectClients(tx);
  const projects = await selectProjects(tx);
  const leads = await selectLeads(tx);
  const pipelineCases = await selectCases(tx);
  const memberships = await selectActiveMemberships(tx);
  return { tenant, clients, projects, leads, pipelineCases, memberships };
}

function assertExpectedManifest(actual, expected) {
  assertMt01c2b2Manifest(expected);
  invariant(actual.manifestHash === expected.manifestHash, "MT01C2B2_MANIFEST_CHANGED", "El lote cambió después de crear el manifest");
}

export async function planMt01c2b2(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='1000ms'");
    const analysis = analyzeRows(await loadUnlocked(tx));
    return { readOnly: true, wroteRows: 0, ...analysis };
  }, { isolationLevel: "ReadCommitted", maxWait: 2_000, timeout: 10_000 });
}

export async function applyMt01c2b2(prisma, expectedManifest, options = {}) {
  assertMt01c2b2Manifest(expectedManifest);
  invariant(!options.failAt || ["AFTER_CLIENT_UPDATE", "DURING_FINAL_VALIDATION"].includes(options.failAt), "MT01C2B2_TEST_HOOK_INVALID", "Hook de prueba inválido");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3000ms'");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('MT-01C2B2:IPACKERS-DO:V1'))");
    const tenant = await selectTenant(tx, true);

    const clients = await selectClients(tx, true);
    const clientState = enterpriseState(clients, (row) => row.tenant_id === null, (row) => row.tenant_id === tenant.id);
    invariant(clientState !== "PARTIAL", "MT01C2B2_PARTIAL_STATE", "Client contiene estado parcial");
    let clientsUpdated = 0;
    for (const row of clients) clientsUpdated += await tx.$executeRaw`UPDATE osi.osi_clients SET tenant_id=${tenant.id} WHERE id=${row.id} AND tenant_id IS NULL`;
    if (options.failAt === "AFTER_CLIENT_UPDATE") fail("MT01C2B2_SYNTHETIC_FAILURE", "Fallo sintético después de Client");

    const projects = await selectProjects(tx, true);
    const projectState = enterpriseState(projects, (row) => row.tenant_id === null, (row) => row.tenant_id === tenant.id);
    invariant(projectState !== "PARTIAL", "MT01C2B2_PARTIAL_STATE", "Project contiene estado parcial");
    let projectsUpdated = 0;
    for (const row of projects) projectsUpdated += await tx.$executeRaw`UPDATE osi.osi_projects SET tenant_id=${tenant.id} WHERE id=${row.id} AND tenant_id IS NULL`;

    const pipelineCases = await selectCases(tx, true);
    const memberships = await selectActiveMemberships(tx, true);
    const leads = await selectLeads(tx);
    const initial = analyzeRows({ tenant, clients, projects, leads, pipelineCases, memberships });
    assertExpectedManifest(initial.manifest, expectedManifest);
    invariant([clientState, projectState, initial.state].every((value) => value === "LEGACY") || [clientState, projectState, initial.state].every((value) => value === "APPLIED"), "MT01C2B2_PARTIAL_STATE", "Las raíces no comparten el mismo estado inicial");

    let casesUpdated = 0;
    let ownersMapped = 0;
    if (initial.state === "LEGACY") {
      for (const row of initial.manifest.pipelineCases) {
        const changed = await tx.$executeRaw`
          UPDATE osi.osi_pipeline_cases
          SET tenant_id=${row.proposed.tenantId},owner_membership_id=${row.proposed.ownerMembershipId},owner_user_id=${row.proposed.ownerUserId}
          WHERE id=${row.id} AND tenant_id IS NULL AND owner_membership_id IS NULL AND owner_user_id IS NULL
        `;
        casesUpdated += changed;
        if (row.proposed.ownerMembershipId) ownersMapped += changed;
      }
    }
    if (options.failAt === "DURING_FINAL_VALIDATION") fail("MT01C2B2_SYNTHETIC_FAILURE", "Fallo sintético durante validación final");

    const final = analyzeRows(await loadUnlocked(tx));
    assertExpectedManifest(final.manifest, expectedManifest);
    invariant(final.state === "APPLIED", "MT01C2B2_POST_STATE_INVALID", "El lote no terminó completamente aplicado");
    return {
      batchId: MT01C2B2.batchId,
      manifest: final.manifest,
      initialState: initial.state,
      changed: { clients: clientsUpdated, projects: projectsUpdated, pipelineCases: casesUpdated, owners: ownersMapped },
      final: MT01C2B2.expected,
    };
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 30_000 });
}

export async function rollbackMt01c2b2(prisma, expectedManifest) {
  assertMt01c2b2Manifest(expectedManifest);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3000ms'");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('MT-01C2B2:IPACKERS-DO:V1'))");
    const tenant = await selectTenant(tx, true);
    const clients = await selectClients(tx, true);
    const projects = await selectProjects(tx, true);
    const pipelineCases = await selectCases(tx, true);
    const memberships = await selectActiveMemberships(tx, true);
    const leads = await selectLeads(tx);
    const current = analyzeRows({ tenant, clients, projects, leads, pipelineCases, memberships });
    assertExpectedManifest(current.manifest, expectedManifest);

    if (current.state === "LEGACY") return { batchId: MT01C2B2.batchId, initialState: "LEGACY", rolledBack: { clients: 0, projects: 0, pipelineCases: 0 } };
    invariant(current.state === "APPLIED", "MT01C2B2_ROLLBACK_DRIFT", "El lote no coincide con los hashes posteriores esperados");
    let cases = 0;
    let projectsUpdated = 0;
    let clientsUpdated = 0;
    for (const row of [...expectedManifest.pipelineCases].reverse()) cases += await tx.$executeRaw`UPDATE osi.osi_pipeline_cases SET tenant_id=NULL,owner_membership_id=NULL,owner_user_id=NULL WHERE id=${row.id} AND tenant_id=${row.proposed.tenantId} AND owner_membership_id IS NOT DISTINCT FROM ${row.proposed.ownerMembershipId} AND owner_user_id IS NOT DISTINCT FROM ${row.proposed.ownerUserId}`;
    for (const row of [...expectedManifest.projects].reverse()) projectsUpdated += await tx.$executeRaw`UPDATE osi.osi_projects SET tenant_id=NULL WHERE id=${row.id} AND tenant_id=${row.proposed.tenantId}`;
    for (const row of [...expectedManifest.clients].reverse()) clientsUpdated += await tx.$executeRaw`UPDATE osi.osi_clients SET tenant_id=NULL WHERE id=${row.id} AND tenant_id=${row.proposed.tenantId}`;

    const final = analyzeRows(await loadUnlocked(tx));
    assertExpectedManifest(final.manifest, expectedManifest);
    invariant(final.state === "LEGACY", "MT01C2B2_ROLLBACK_INCOMPLETE", "Rollback incompleto");
    return { batchId: MT01C2B2.batchId, initialState: "APPLIED", rolledBack: { clients: clientsUpdated, projects: projectsUpdated, pipelineCases: cases } };
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 30_000 });
}
