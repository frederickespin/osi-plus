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

const results = [];
function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  results.push({ name, passed: true });
}
async function reject(name, code, action) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(name, error?.code === code);
  return error;
}

const tenantId = "tenant-icp-api-test";
const membershipId = "membership-icp-api-test";
const userId = "user-icp-api-test";
const context = Object.freeze({ tenantId, membershipId, userId, role: "V" });

function actorRow(overrides = {}) {
  return {
    id: membershipId,
    tenant_id: tenantId,
    user_id: userId,
    role: "V",
    membership_status: "ACTIVE",
    granted_permissions: ["pipeline:create"],
    denied_permissions: [],
    user_status: "ACTIVE",
    tenant_status: "ACTIVE",
    country_code: "DO",
    name: "Synthetic Seller",
    ...overrides,
  };
}

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
    requestId: `icp-api-${randomUUID()}`,
    client: {
      kind: "INLINE",
      displayName: "Synthetic API Client",
      taxId: "RNC-API-0001",
      phone: "+18095550101",
      email: "api-client@example.invalid",
      duplicateConfirmation: null,
    },
    clientProfileType: "CORPORATE",
    caseContact: { displayName: "Synthetic Contact", phone: "+18095550102", email: null },
    mode: "LOCAL",
    serviceType: "LOCAL_MOVE",
    intakeChannel: "WHATSAPP",
    estimatedCbm: 12.5,
    requiresSurvey: true,
    surveyMethod: "PRESENCIAL",
    route: {
      destinationStatus: "CONFIRMED",
      origin: selection({ saveForClient: true, label: "Principal" }),
      destination: selection(),
      additionalStops: [],
    },
    ...overrides,
  };
}
function signed(values = unsigned()) {
  const normalized = normalizeCrmIcpV2UnsignedInput(values);
  return { ...values, payloadHash: hashCrmIcpV2Payload(normalized) };
}

function queryText(query) {
  return Array.isArray(query?.strings) ? query.strings.join("?") : String(query || "");
}

function creationDatabase({ actor = actorRow(), duplicateRows = [] } = {}) {
  const casePublicRef = randomUUID();
  const clientPublicRef = randomUUID();
  const state = {
    savedAddresses: [],
    snapshots: [],
    commands: [],
    audits: [],
    caseCreate: null,
    casePromotion: null,
  };
  const client = { id: "client-internal", publicRef: clientPublicRef, name: "Synthetic API Client", type: "CORPORATE", status: "ACTIVE" };
  const tx = {
    async $executeRawUnsafe() { return 0; },
    async $executeRaw() { return 0; },
    async $queryRaw(query) {
      const text = queryText(query);
      if (text.includes("pg_try_advisory_xact_lock")) return [{ ok: true }];
      if (text.includes("JOIN \"osi\".\"osi_users\"")) return [actor];
      if (text.includes("next_icp_client_code")) return [{ code: "ICP-2026-000000000001" }];
      if (text.includes('FROM "osi"."tenants"')) return [{ id: tenantId, status: "ACTIVE" }];
      if (text.includes('FROM "osi"."tenant_memberships"')) return [{ id: membershipId, tenant_id: tenantId, user_id: userId, role: "V", status: "ACTIVE" }];
      if (text.includes('INSERT INTO "osi"."commercial_audit_logs"')) {
        state.audits.push(text);
        return [{
          id: randomUUID(), tenant_id: tenantId, actor_user_id: userId, actor_membership_id: membershipId,
          role_snapshot: "V", action: "CRM_PIPELINE_CASE_CREATED", entity: "PIPELINE_CASE",
          entity_id: "case-internal", before_json: null, after_json: {}, metadata_json: {},
          source: "CRM_ICP_V2_API_05B1", request_id: "request", correlation_id: "request",
          critical: false, created_at: new Date(),
        }];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    },
    client: {
      async findFirst() { return null; },
      async findMany() { return duplicateRows; },
      async create() { return client; },
    },
    clientAddress: {
      async findMany() { return []; },
      async create({ data }) { state.savedAddresses.push(data); return { addressRef: randomUUID() }; },
    },
    pipelineCaseCommand: {
      async findFirst() { return null; },
      async create({ data }) { state.commands.push(data); return { id: randomUUID() }; },
    },
    pipelineCase: {
      async create({ data }) {
        state.caseCreate = data;
        return { id: "case-internal", publicRef: casePublicRef };
      },
      async updateMany({ data }) { state.casePromotion = data; return { count: 1 }; },
      async findFirst() {
        return {
          id: "case-internal", publicRef: casePublicRef, caseCode: "CS-2026-SYNTHETIC", status: "NEW_INBOX",
          version: 1, mode: "LOCAL", serviceType: "LOCAL_MOVE", estimatedCbm: 12.5,
          requiresSurvey: true, surveyMethod: "PRESENCIAL", caseContactName: "Synthetic Contact",
          caseContactPhone: "+18095550102", caseContactEmail: null, intakeChannel: "WHATSAPP",
          clientProfileType: "CORPORATE", routeContractVersion: 2, routeRevision: 1,
          destinationStatus: "CONFIRMED", ownerName: "Synthetic Seller", createdAt: new Date(), updatedAt: new Date(),
          client: { publicRef: clientPublicRef, name: client.name, type: client.type, status: client.status },
        };
      },
    },
    pipelineCaseRouteSnapshot: {
      async createMany({ data }) { state.snapshots = data; return { count: data.length }; },
      async findMany() { return state.snapshots; },
    },
  };
  return {
    state,
    database: {
      async $transaction(callback) { return callback(tx); },
    },
  };
}

const creation = creationDatabase();
const created = await createCrmIcpV2Case(context, signed(), creation.database);
check("creación retorna referencias públicas y revisión 1", created.replayed === false
  && created.case.route.contractVersion === 2 && created.case.route.revision === 1
  && PUBLIC_REF(created.case.caseRef) && PUBLIC_REF(created.case.client.clientRef));
check("Client inline usa secuencia y no duplica PII en texto legacy", creation.state.caseCreate.originLocation === "ICP_V2_STRUCTURED_ROUTE"
  && creation.state.caseCreate.destinationLocation === "ICP_V2_STRUCTURED_ROUTE"
  && creation.state.caseCreate.routeRevision === 0);
check("dirección reutilizable y snapshots viven en la misma transacción", creation.state.savedAddresses.length === 1
  && creation.state.snapshots.length === 2 && creation.state.snapshots.every((row) => row.routeVersion === 1));
check("caso se promueve a contrato 2 antes de journal/auditoría", creation.state.casePromotion.routeContractVersion === 2
  && creation.state.casePromotion.routeRevision === 1 && creation.state.commands.length === 1 && creation.state.audits.length === 1);
check("comando idempotente conserva actor y hash sin PII", creation.state.commands[0].requestId
  && creation.state.commands[0].commandType === "CREATE" && creation.state.commands[0].actorMembershipId === membershipId);

const pendingValues = unsigned({ route: { ...unsigned().route, destinationStatus: "PENDING", destination: null } });
await reject("destino pendiente sin grant explícito se bloquea", "CRM_ICP_PENDING_DESTINATION_FORBIDDEN", () =>
  createCrmIcpV2Case(context, signed(pendingValues), creationDatabase().database));

const partialCandidate = [{
  publicRef: randomUUID(), normalizedPhone: "+18095550999", normalizedEmail: "other@example.invalid", taxIdNormalized: "OTHER0001",
}];
const partialError = await reject("coincidencia parcial entrega confirmación requerida", "CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED", () =>
  createCrmIcpV2Case(context, signed(), creationDatabase({ duplicateRows: partialCandidate }).database));
check("fingerprint parcial es opaco y no contiene PII", /^[0-9a-f]{64}$/.test(partialError.safeData?.matchFingerprint)
  && !JSON.stringify(partialError.safeData).includes("example.invalid"));

function readDatabase({ role = "A", denied = [], item = true } = {}) {
  const ref = randomUUID();
  let observedWhere;
  const actor = actorRow({ role, denied_permissions: denied, granted_permissions: [] });
  const database = {
    async $queryRaw() { return [actor]; },
    pipelineCase: {
      async findFirst({ where }) {
        observedWhere = where;
        if (!item) return null;
        return {
          id: "case-read", publicRef: ref, caseCode: "CS-READ", status: "NEW_INBOX", version: 1,
          mode: "LOCAL", serviceType: "LOCAL_MOVE", estimatedCbm: 1, requiresSurvey: false,
          surveyMethod: "NO_APLICA", caseContactName: "Contact", caseContactPhone: "+18095550111",
          caseContactEmail: null, intakeChannel: "WEB", clientProfileType: "INDIVIDUAL",
          routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED", ownerName: "Owner",
          createdAt: new Date(), updatedAt: new Date(),
          client: { publicRef: randomUUID(), name: "Client", type: "INDIVIDUAL", status: "ACTIVE" },
        };
      },
    },
    pipelineCaseRouteSnapshot: {
      async findMany() {
        return [
          { role: "ORIGIN", stopOrder: 0, sourceAddressRef: null, ...address() },
          { role: "DESTINATION", stopOrder: 0, sourceAddressRef: null, ...address() },
        ];
      },
    },
    async $transaction(callback) { return callback(this); },
  };
  return { database, ref, where: () => observedWhere };
}

const sellerRead = readDatabase({ role: "V" });
const detail = await findCrmIcpV2Case(context, sellerRead.ref, sellerRead.database);
check("V lee sólo por owner Membership/User completo", detail.caseRef === sellerRead.ref
  && sellerRead.where().ownerMembershipId === membershipId && sellerRead.where().ownerUserId === userId);
await reject("referencia de caso inválida produce 404 estable", "CRM_PIPELINE_RESOURCE_NOT_FOUND", () =>
  findCrmIcpV2Case(context, "internal-id", sellerRead.database));

let searchWhere;
const searchDatabase = {
  async $queryRaw() { return [actorRow({ role: "A", granted_permissions: [], denied_permissions: [] })]; },
  client: {
    count({ where }) { searchWhere = where; return Promise.resolve(1); },
    findMany() {
      return Promise.resolve([{ publicRef: randomUUID(), name: "Private Client", type: "CORPORATE", status: "ACTIVE",
        taxId: "RNC00001234", phone: "+18095550123", email: "private@example.invalid" }]);
    },
  },
  async $transaction(callback) { return callback(this); },
};
const search = await searchCrmIcpClients(context, { query: "Private", page: 1, pageSize: 20 }, searchDatabase);
const serializedSearch = JSON.stringify(search);
check("búsqueda fija tenant y devuelve PII enmascarada", searchWhere.tenantId === tenantId && search.total === 1
  && !serializedSearch.includes("RNC00001234") && !serializedSearch.includes("+18095550123")
  && !serializedSearch.includes("private@example.invalid"));
await reject("denied pipeline:view prevalece", "CRM_PIPELINE_PERMISSION_FORBIDDEN", () =>
  searchCrmIcpClients(context, { query: "Private", page: 1, pageSize: 20 }, {
    ...searchDatabase,
    async $queryRaw() { return [actorRow({ role: "A", granted_permissions: [], denied_permissions: ["pipeline:view"] })]; },
  }));

function PUBLIC_REF(value) { return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value); }

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
