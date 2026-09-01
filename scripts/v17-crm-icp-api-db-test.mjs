import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createCrmIcpV2Case,
  findCrmIcpV2Case,
  searchCrmIcpClients,
} from "../api/_lib/crmIcpV2ApiDomain.js";
import {
  hashCrmIcpV2Payload,
  normalizeCrmIcpV2UnsignedInput,
} from "../api/_lib/crmIcpV2Domain.js";

function testTarget() {
  const raw = process.env.V17_CRM_ICP_API_TEST_DATABASE_URL;
  if (!raw) throw new Error("V17_CRM_ICP_API_TEST_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  if (parsed.protocol !== "postgresql:" || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || !new Set(["55445", "55432"]).has(parsed.port)
    || !new Set(["osi_v17_icp_local", "osi_db01n_ci"]).has(parsed.pathname.slice(1))
    || parsed.searchParams.get("schema") !== "osi") {
    throw new Error("V17_CRM_ICP_API_TEST_DATABASE_TARGET_REJECTED");
  }
  return raw;
}

testTarget();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: process.env.V17_CRM_ICP_API_TEST_DATABASE_URL });
const results = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  results.push({ name, passed: true });
}
async function rejected(name, code, action) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(name, error?.code === code);
  return error;
}

const marker = randomUUID().replaceAll("-", "").slice(0, 12);
const tenantId = `icp_api_t_${marker}`;
const userId = `icp_api_u_${marker}`;
const membershipId = `icp_api_m_${marker}`;
const tenantCode = `ICPAPI${marker}`.toUpperCase();
const context = Object.freeze({ tenantId, userId, membershipId });
let fixturesCleaned = false;

function address(overrides = {}) {
  return {
    countryCode: "DO",
    provinceState: "Distrito Nacional",
    cityMunicipality: "Santo Domingo",
    sector: "Synthetic sector",
    streetAndNumber: "Synthetic street 1",
    buildingResidential: null,
    floorUnit: null,
    arrivalReference: null,
    locationContactName: null,
    locationContactPhone: null,
    ...overrides,
  };
}
function selection(overrides = {}) {
  return { kind: "NEW_ADDRESS", saveForClient: false, label: null, address: address(), ...overrides };
}
function unsigned(overrides = {}) {
  return {
    requestId: `icp-db-${randomUUID()}`,
    client: {
      kind: "INLINE",
      displayName: `Synthetic DB Client ${marker}`,
      taxId: `RNC-${marker}`,
      phone: `+1809${marker.replace(/[^0-9]/g, "").padEnd(7, "1").slice(0, 7)}`,
      email: `icp-${marker}@example.invalid`,
      duplicateConfirmation: null,
    },
    clientProfileType: "CORPORATE",
    caseContact: { displayName: "Synthetic DB Contact", phone: "+18095550102", email: null },
    mode: "LOCAL",
    serviceType: "LOCAL_MOVE",
    intakeChannel: "WEB",
    requiresSurvey: false,
    surveyMethod: "NO_APLICA",
    route: {
      destinationStatus: "CONFIRMED",
      origin: selection({ saveForClient: true, label: "Principal" }),
      destination: selection({ address: address({ streetAndNumber: "Synthetic destination 2" }) }),
      additionalStops: [],
    },
    ...overrides,
  };
}
function signed(values) {
  const normalized = normalizeCrmIcpV2UnsignedInput(values);
  return { ...values, payloadHash: hashCrmIcpV2Payload(normalized) };
}

async function cleanup() {
  for (const table of ["commercial_audit_logs", "pipeline_case_commands", "pipeline_case_route_snapshots"]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."${table}" DISABLE TRIGGER USER`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."pipeline_case_commands" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."pipeline_case_route_snapshots" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."osi_pipeline_cases" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."client_addresses" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."osi_clients" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."tenant_memberships" WHERE "tenant_id"=$1`, tenantId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."osi_users" WHERE "id"=$1`, userId);
      await tx.$executeRawUnsafe(`DELETE FROM "osi"."tenants" WHERE "id"=$1`, tenantId);
    });
    fixturesCleaned = true;
  } finally {
    for (const table of ["pipeline_case_route_snapshots", "pipeline_case_commands", "commercial_audit_logs"]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."${table}" ENABLE TRIGGER USER`);
    }
  }
}

try {
  const identity = await prisma.$queryRawUnsafe(`SELECT current_database() AS "database",inet_server_addr()::text AS "address",inet_server_port() AS "port",current_setting('neon.branch_id',true) AS "neon"`);
  check("destino es PostgreSQL local aislado", new Set(["osi_v17_icp_local", "osi_db01n_ci"]).has(identity[0].database)
    && [55445, 55432].includes(Number(identity[0].port)) && !identity[0].neon);
  await prisma.tenant.create({ data: { id: tenantId, code: tenantCode, name: "Synthetic ICP API tenant", countryCode: "DO" } });
  await prisma.user.create({ data: {
    id: userId,
    code: `U${marker}`.toUpperCase(),
    name: "Synthetic ICP API Seller",
    email: `user-${marker}@example.invalid`,
    phone: "0000000000",
    role: "V",
    status: "ACTIVE",
    joinDate: "2026-08-31",
    passwordHash: "synthetic-not-login-capable",
  } });
  await prisma.tenantMembership.create({ data: {
    id: membershipId,
    tenantId,
    userId,
    role: "V",
    status: "ACTIVE",
    isDefault: true,
    grantedPermissions: ["pipeline:create", "pipeline:create:pending-destination"],
  } });

  const values = unsigned();
  const command = signed(values);
  const created = await createCrmIcpV2Case(context, command, prisma);
  check("executor crea caso ICP v2 real", created.replayed === false && created.case.route.contractVersion === 2
    && created.case.route.revision === 1 && created.case.route.destinationStatus === "CONFIRMED"
    && created.case.volume.status === "PENDING_SOURCE" && created.case.volume.estimatedCbm === null);
  const [clients, addresses, snapshots, commands, audits] = await Promise.all([
    prisma.client.count({ where: { tenantId } }),
    prisma.clientAddress.count({ where: { tenantId } }),
    prisma.pipelineCaseRouteSnapshot.count({ where: { tenantId } }),
    prisma.pipelineCaseCommand.count({ where: { tenantId } }),
    prisma.commercialAuditLog.count({ where: { tenant_id: tenantId } }),
  ]);
  check("transacción persiste Client, address, dos snapshots, comando y auditoría", clients === 1 && addresses === 1
    && snapshots === 2 && commands === 1 && audits === 1);
  const replay = await createCrmIcpV2Case(context, command, prisma);
  check("requestId/hash reusa el mismo caso", replay.replayed === true && replay.case.caseRef === created.case.caseRef
    && await prisma.pipelineCase.count({ where: { tenantId } }) === 1);

  const detail = await findCrmIcpV2Case(context, created.case.caseRef, prisma);
  check("detalle lee sólo snapshot vigente", detail.route.revision === 1 && detail.route.origin.countryCode === "DO"
    && detail.route.destination.streetAndNumber === "Synthetic destination 2"
    && detail.volume.status === "PENDING_SOURCE" && detail.volume.estimatedCbm === null);
  const storedCase = await prisma.pipelineCase.findFirst({ where: { tenantId, publicRef: created.case.caseRef }, select: { estimatedCbm: true } });
  check("cero legacy es sólo marcador interno no autoritativo", storedCase?.estimatedCbm === 0);
  const search = await searchCrmIcpClients(context, { query: marker, page: 1, pageSize: 20 }, prisma);
  const searchJson = JSON.stringify(search);
  check("búsqueda real es tenant-first y enmascarada", search.total === 1 && search.data[0].clientRef === created.case.client.clientRef
    && !searchJson.includes(values.client.taxId) && !searchJson.includes(values.client.phone) && !searchJson.includes(values.client.email));

  await rejected("duplicado exacto se bloquea aun con request distinto", "CRM_ICP_CLIENT_DUPLICATE", () =>
    createCrmIcpV2Case(context, signed({ ...values, requestId: `icp-db-${randomUUID()}` }), prisma));

  const pendingValues = unsigned({
    requestId: `icp-db-${randomUUID()}`,
    client: {
      ...unsigned().client,
      displayName: `Synthetic Pending ${marker}`,
      taxId: `PENDING-${marker}`,
      phone: "+18095550991",
      email: `pending-${marker}@example.invalid`,
    },
    route: { ...unsigned().route, destinationStatus: "PENDING", destination: null, origin: selection() },
  });
  const pending = await createCrmIcpV2Case(context, signed(pendingValues), prisma);
  check("grant explícito permite PENDING sólo sin destino", pending.case.route.destinationStatus === "PENDING"
    && pending.case.route.destination === null && pending.case.route.origin != null);

  const auditRows = await prisma.commercialAuditLog.findMany({
    where: { tenant_id: tenantId },
    select: { before_json: true, after_json: true, metadata_json: true, source: true },
  });
  const auditJson = JSON.stringify(auditRows);
  check("auditoría real conserva fuente y no copia PII", auditRows.every((row) => row.source === "CRM_ICP_V2_API_05B1")
    && !auditJson.includes(values.client.phone) && !auditJson.includes(values.client.email)
    && !auditJson.includes("Synthetic street"));
} finally {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
}

check("fixtures PostgreSQL eliminados", fixturesCleaned === true);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
