import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getLogisticsGeography,
  loadLogisticsGeography,
  saveLogisticsGeography,
} from "../api/_lib/logisticsGeography.js";
import { isTransportPolicy } from "../api/_lib/logisticsEngineContract.js";
import { listLogisticsRules } from "../api/_lib/logisticsEngineDomain.js";

const perms = ["logistics:rules:view", "logistics:rules:manage"];
const actor = (tenantId) => ({
  tenantId,
  role: "A",
  userId: `${tenantId}-user`,
  membershipId: `${tenantId}-membership`,
  effectivePermissions: perms,
  deniedPermissions: [],
});

function databaseFixture() {
  const rows = [];
  const commands = [];
  const audits = [];
  let currentActor = null;
  const matchesNamespace = (row, where) =>
    row.tenantId === where.tenantId &&
    (!where.family?.in || where.family.in.includes(row.family)) &&
    (!where.conditions || row.conditions.transportContract === where.conditions.equals);
  const database = {
    logisticsRule: {
      findMany: async ({ where }) => rows
        .filter((row) => matchesNamespace(row, where) && (!where.state?.in || where.state.in.includes(row.state)))
        .sort((left, right) => left.name.localeCompare(right.name)),
      findFirst: async ({ where }) => rows
        .filter((row) => matchesNamespace(row, where) && row.seriesRef === where.seriesRef)
        .sort((left, right) => right.version - left.version)[0],
      create: async ({ data }) => {
        const row = { ...data, id: randomUUID(), ruleRef: randomUUID(), validTo: null };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
    },
    logisticsMutationCommand: {
      findUnique: async ({ where: { tenantId_requestId: key } }) =>
        commands.find((command) => command.tenantId === key.tenantId && command.requestId === key.requestId),
      create: async ({ data }) => commands.push(data),
    },
    commercialAuditLog: { create: async ({ data }) => audits.push(data) },
    $queryRaw: async () => [{
      id: currentActor.membershipId,
      public_ref: randomUUID(),
      tenant_id: currentActor.tenantId,
      user_id: currentActor.userId,
      role: currentActor.role,
      status: "ACTIVE",
      user_status: "ACTIVE",
      tenant_status: "ACTIVE",
      granted_permissions: perms,
      denied_permissions: currentActor.deniedPermissions,
    }],
    $executeRaw: async () => 0,
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      return work(database);
    },
  };
  return {
    rows, commands, audits, database,
    save: async (context, request) => {
      currentActor = context;
      return saveLogisticsGeography(database, context, request);
    },
    get: async (context, query) => {
      currentActor = context;
      return getLogisticsGeography(database, context, query);
    },
  };
}

const tenant = actor("office");
const otherTenant = actor("affiliate");
const f = databaseFixture();
const baseRequest = {
  operation: "SAVE_BASE",
  requestId: randomUUID(),
  baseRef: null,
  expectedVersion: 0,
  name: "Sede principal",
  address: "Calle de prueba, Santo Domingo",
  kind: "OFFICE",
  point: [-69.93, 18.49],
  active: true,
};
assert.deepEqual(await f.get(tenant), { bases: [], metro: null });
const base = await f.save(tenant, baseRequest);
assert.match(base.code, /^BASE-[0-9A-F]{20}$/u);
assert.equal(base.version, 1);
assert.deepEqual(base.point, [-69.93, 18.49]);
assert.deepEqual(await f.save(tenant, baseRequest), base);
assert.equal(f.audits.length, 1);
assert.equal(f.commands.length, 1);
await assert.rejects(f.save(tenant, { ...baseRequest, address: "Dirección nueva" }), { code: "LOGISTICS_GEOGRAPHY_REQUEST_CONFLICT" });

const updateRequest = {
  ...baseRequest, requestId: randomUUID(), baseRef: base.baseRef, expectedVersion: 1,
  name: "Patio de prueba", address: "Segunda calle de prueba", kind: "YARD", active: false,
};
const updated = await f.save(tenant, updateRequest);
assert.equal(updated.baseRef, base.baseRef);
assert.equal(updated.code, base.code);
assert.equal(updated.version, 2);
assert.equal(updated.active, false);
assert.equal(updated.address, "Segunda calle de prueba");
assert.equal(f.rows[0].state, "SUPERSEDED");
assert.deepEqual((await loadLogisticsGeography(f.database, tenant.tenantId)).bases, [updated]);
assert.deepEqual((await f.get(otherTenant)).bases, []);
await assert.rejects(f.save(tenant, { ...updateRequest, requestId: randomUUID() }), { code: "LOGISTICS_GEOGRAPHY_VERSION_CONFLICT" });
await assert.rejects(f.save(otherTenant, { ...updateRequest, requestId: randomUUID() }), { code: "LOGISTICS_GEOGRAPHY_NOT_FOUND" });
await assert.rejects(
  f.save(tenant, { ...baseRequest, requestId: randomUUID(), name: "patio de prueba" }),
  { code: "LOGISTICS_GEOGRAPHY_BASE_DUPLICATE" },
);

const geometry = [[-69.97, 18.47], [-69.91, 18.47], [-69.91, 18.53], [-69.97, 18.53]];
const metroRequest = {
  operation: "SAVE_METRO", requestId: randomUUID(), expectedVersion: 0,
  name: "Área metropolitana", geometry: [...geometry, geometry[0]],
  localities: [
    { city: "Santo Domingo Este", sector: null },
    { city: "Boca Chica", sector: null, classification: "INTERIOR" },
  ],
};
const metro = await f.save(tenant, metroRequest);
assert.equal(metro.code, "METRO");
assert.equal(metro.version, 1);
assert.deepEqual(metro.geometry, geometry);
assert.deepEqual(metro.localities, [
  { city: "Santo Domingo Este", sector: null, classification: "METRO" },
  { city: "Boca Chica", sector: null, classification: "INTERIOR" },
]);
assert.deepEqual((await f.get(tenant)).metro, metro);
assert.equal((await f.get(otherTenant)).metro, null);
assert.equal((await f.save(otherTenant, metroRequest)).version, 1);
const replacedMetro = await f.save(tenant, {
  ...metroRequest, requestId: randomUUID(), expectedVersion: 1, name: "Metro ampliada",
});
assert.equal(replacedMetro.version, 2);
assert.notEqual(replacedMetro.ruleRef, metro.ruleRef);
assert.equal((await f.get(tenant)).metro.name, "Metro ampliada");
assert.equal((await f.get(otherTenant)).metro.name, metro.name);

await assert.rejects(f.save(tenant, {
  ...metroRequest,
  requestId: randomUUID(),
  expectedVersion: 2,
  localities: [...metroRequest.localities, { city: "BOCA CHICA", sector: null }],
}), { code: "LOGISTICS_GEOGRAPHY_LOCALITY_DUPLICATE" });
await assert.rejects(f.save(tenant, {
  ...metroRequest, requestId: randomUUID(), expectedVersion: 2,
  geometry: [geometry[0], geometry[2], geometry[1], geometry[3]],
}), { code: "LOGISTICS_GEOGRAPHY_INPUT_INVALID" });
await assert.rejects(
  f.save(tenant, { ...baseRequest, requestId: randomUUID(), tariff: 50 }),
  { code: "LOGISTICS_GEOGRAPHY_INPUT_INVALID" },
);
await assert.rejects(
  f.save({ ...tenant, deniedPermissions: ["logistics:rules:manage"] }, baseRequest),
  { code: "LOGISTICS_TRANSPORT_FORBIDDEN", status: 403 },
);
assert.ok(f.rows.every(isTransportPolicy));
assert.deepEqual(await listLogisticsRules(f.database, tenant), []);
assert.equal(f.commands.length, 5);
assert.equal(f.audits.length, 5);
assert.ok(f.audits.every((audit) => audit.critical && !Object.hasOwn(audit.after_json, "address")));
console.log("Logistics geography: versioning, replay, validation, tenant isolation and rule boundaries passed.");
