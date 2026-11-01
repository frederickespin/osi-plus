import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canonicalHash } from "../api/_lib/logisticsEngineContract.js";
import { automaticLogisticsConfigurationCode } from "../api/_lib/logisticsConfigurationCode.js";
import { TRANSPORT_CONTRACT } from "../api/_lib/logisticsTransportContract.js";
import {
  listTransportZones, loadTransportZones, revalidateTransportActor, TRANSPORT_ZONE_PERMISSIONS,
  versionTransportZone, withTransportTransaction,
} from "../api/_lib/logisticsTransportZones.js";

const results = [];
function check(name, value) { assert.ok(value, name); results.push(name); }
const permissions = [...TRANSPORT_ZONE_PERMISSIONS.VIEW, ...TRANSPORT_ZONE_PERMISSIONS.MANAGE];
const context = { tenantId: "synthetic-tenant", membershipId: "synthetic-member", userId: "synthetic-user", role: "B", effectivePermissions: permissions, deniedPermissions: [] };
const currentActor = { id: context.membershipId, public_ref: randomUUID(), tenant_id: context.tenantId, user_id: context.userId,
  role: "B", status: "ACTIVE", user_status: "active", tenant_status: "ACTIVE", granted_permissions: permissions, denied_permissions: [] };
const fuel = { code: "FUEL", label: "Combustible sintético", kind: "FUEL", basis: "GALLON", unitCost: "250", classification: "PR",
  minimumMarginBps: null, recommendedMarginBps: null, includedConcepts: [] };
const toll = { code: "TOLL", label: "Peaje sintético", kind: "TOLL", basis: "PASS", unitCost: "100", classification: "EX",
  minimumMarginBps: null, recommendedMarginBps: null, includedConcepts: [] };
const zone = { seriesRef: null, expectedVersion: null, code: "SYNTHETIC_ZONE", name: "Zona sintética de prueba", zoneType: "INTERIOR", priority: 10,
  vehicleType: "TRUCK", purposes: ["SERVICE"], geometry: { type: "Polygon", coordinates: [[[-70, 18], [-69.8, 18], [-69.8, 18.2], [-70, 18.2], [-70, 18]]] },
  mode: "ITEMIZED", factor: null, currency: "DOP", kmPerGallon: "10", gallonUnit: "US", fuelType: "DIESEL", includedConcepts: [], components: [fuel, toll], state: "ACTIVE" };
function command(changes = {}, requestId = randomUUID()) {
  const input = { ...structuredClone(zone), ...structuredClone(changes) };
  return { ...input, requestId, payloadHash: canonicalHash({ operation: "TRANSPORT_ZONE_VERSION", requestId, ...input }) };
}
function same(a, b) { return a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b; }
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((item) => matches(row, item));
    if (key === "OR") return value.some((item) => matches(row, item));
    if (key === "tenantId_id" || key === "tenantId_requestId") return matches(row, value);
    const actual = row[key];
    if (!value || typeof value !== "object" || value instanceof Date) return same(actual, value);
    if (value.path) return same(value.path.reduce((current, part) => current?.[part], actual), value.equals);
    if (Object.hasOwn(value, "equals")) return value.mode === "insensitive" ? String(actual).toLowerCase() === value.equals.toLowerCase() : same(actual, value.equals);
    if (Object.hasOwn(value, "not")) return !same(actual, value.not);
    if (value.in) return value.in.includes(actual);
    return Object.entries(value).every(([operator, expected]) => ({ lte: actual <= expected, lt: actual < expected, gte: actual >= expected, gt: actual > expected })[operator]);
  });
}
function selected(rows, args = {}) {
  let next = rows.filter((row) => matches(row, args.where));
  const order = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
  next.sort((a, b) => {
    for (const item of order) for (const [key, direction] of Object.entries(item)) {
      if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (direction === "asc" ? 1 : -1);
    }
    return 0;
  });
  if (args.distinct) { const seen = new Set(); next = next.filter((row) => { const key = args.distinct.map((field) => row[field]).join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); }
  return structuredClone(args.take ? next.slice(0, args.take) : next);
}
function fixture({ actor = currentActor, failAudit = false, initial = null } = {}) {
  let state = initial ? structuredClone(initial) : { zones: [], tariffs: [], commands: [], audits: [] };
  const calls = []; let serial = 0; let transactions = 0;
  let liveActor = actor;
  const prisma = { async $transaction(work, options) {
    transactions += 1;
    assert.equal(options.isolationLevel, "Serializable");
    const pending = structuredClone(state);
    function table(name) {
      return {
        async findMany(args) { calls.push({ table: name, method: "findMany", args }); return selected(pending[name], args); },
        async findFirst(args) { calls.push({ table: name, method: "findFirst", args }); return selected(pending[name], args)[0] ?? null; },
        async findUnique(args) { calls.push({ table: name, method: "findUnique", args }); return selected(pending[name], args)[0] ?? null; },
        async create({ data }) {
          calls.push({ table: name, method: "create", data });
          if (name === "audits" && failAudit) throw Object.assign(new Error("synthetic audit failure"), { code: "SYNTHETIC_AUDIT_FAILURE" });
          assert.equal(data.tenantId ?? data.tenant_id, context.tenantId);
          assert.equal(data.actorMembershipId ?? data.actor_membership_id, context.membershipId);
          assert.equal(data.actorUserId ?? data.actor_user_id, context.userId);
          if (name === "zones" || name === "tariffs") {
            for (const existing of pending[name].filter((row) => row.tenantId === data.tenantId)) {
              const duplicate = existing.requestId === data.requestId || existing.ruleRef === data.ruleRef
                || (existing.seriesRef === data.seriesRef && existing.version === data.version)
                || (data.replacesRuleId && existing.replacesRuleId === data.replacesRuleId);
              if (duplicate) throw { code: "P2002" };
              const overlap = (!existing.validTo || !data.validFrom || existing.validTo > data.validFrom)
                && (!data.validTo || !existing.validFrom || data.validTo > existing.validFrom);
              if (existing.state === "ACTIVE" && data.state === "ACTIVE" && existing.family === data.family
                && existing.priority === data.priority && existing.specificity === data.specificity && existing.conditionHash === data.conditionHash && overlap) throw { meta: { code: "23P01" } };
            }
          }
          const row = { id: `synthetic-${++serial}`, ...structuredClone(data) };
          pending[name].push(row); return structuredClone(row);
        },
        async update({ where, data }) {
          calls.push({ table: name, method: "update", where, data });
          assert.ok(Object.keys(data).every((key) => ["state", "validTo"].includes(key)), "immutable source fields are never updated");
          const row = pending[name].find((item) => matches(item, where)); assert.ok(row);
          if (data.validTo && row.validFrom) assert.ok(data.validTo > row.validFrom, "strict period check");
          Object.assign(row, structuredClone(data)); return structuredClone(row);
        },
      };
    }
    const tx = { logisticsRule: table("zones"), costingRule: table("tariffs"), logisticsMutationCommand: table("commands"), commercialAuditLog: table("audits"),
      async $queryRaw(query) { calls.push({ method: "actor", sql: query.sql, values: query.values }); return liveActor ? [structuredClone(liveActor)] : []; },
      async $executeRaw(query) { calls.push({ method: "lock", sql: query.sql, values: query.values }); return 1; } };
    const value = await work(tx); state = pending; return value;
  } };
  return { prisma, calls, state: () => structuredClone(state), transactions: () => transactions, setActor: (next) => { liveActor = next; } };
}
const rejects = (work, code) => assert.rejects(work, (error) => error.code === `LOGISTICS_TRANSPORT_${code}`);

{
  const automatic = fixture();
  const request = command({ code: null, components: [{ ...fuel, code: null }, { ...toll, code: null }], state: "DRAFT" });
  const created = await versionTransportZone(automatic.prisma, context, request);
  check("new zone and all new rows receive independent automatic codes", /^ZON_[A-F0-9]{24}$/.test(created.code)
    && created.components.every((row) => /^REN_[A-F0-9]{24}$/.test(row.code)) && new Set(created.components.map((row) => row.code)).size === 2);
  check("automatic code identity is tenant scoped and stable for the same command", created.code === automaticLogisticsConfigurationCode(context.tenantId, { ...request, operation: "TRANSPORT_ZONE_VERSION" }, "ZONE")
    && created.code !== automaticLogisticsConfigurationCode("other-tenant", { ...request, operation: "TRANSPORT_ZONE_VERSION" }, "ZONE"));
  const beforeReplay = automatic.state();
  check("automatic code retry returns the same full saved version", JSON.stringify(await versionTransportZone(automatic.prisma, context, request)) === JSON.stringify(created)
    && JSON.stringify(automatic.state()) === JSON.stringify(beforeReplay));
  await rejects(() => versionTransportZone(automatic.prisma, context, command({ code: null, name: "Changed after save", components: request.components, state: "DRAFT" }, request.requestId)), "IDEMPOTENCY_CONFLICT");
  const revised = await versionTransportZone(automatic.prisma, context, command({ seriesRef: created.seriesRef, expectedVersion: 1, code: null,
    components: [{ ...fuel, code: created.components[0].code, unitCost: "260" }, { ...toll, code: created.components[1].code },
      { ...toll, code: null, label: "Nuevo renglón sintético", kind: "OTHER", basis: "FIXED" }], state: "DRAFT" }));
  check("versioning preserves saved identities while assigning only new row codes", revised.code === created.code
    && revised.components[0].code === created.components[0].code && revised.components[0].costRuleVersion === 2
    && revised.components[1].code === created.components[1].code && revised.components[2].costRuleVersion === 1
    && !created.components.some((row) => row.code === revised.components[2].code));
  await rejects(() => versionTransportZone(automatic.prisma, context, command({ seriesRef: created.seriesRef, expectedVersion: 2, code: "RENAME_NOT_ALLOWED" })), "ZONE_CODE_IMMUTABLE");
  check("automatic codes remain stored after a rejected rename", automatic.state().zones.every((row) => row.code === created.code));
  const collisionRequest = command({ code: null, state: "DRAFT" });
  const generated = automaticLogisticsConfigurationCode(context.tenantId, { ...collisionRequest, operation: "TRANSPORT_ZONE_VERSION" }, "COMPONENT", 0);
  await rejects(() => versionTransportZone(automatic.prisma, context, command({ code: null, state: "DRAFT", components: [{ ...fuel, code: null }, { ...toll, code: generated }] }, collisionRequest.requestId)), "COMPONENT_CODE_CONFLICT");
}

for (const permissionsToUse of [[], [permissions[0]], [permissions[2]], [permissions[2], permissions[3]]]) {
  if (permissionsToUse.length === 2) continue;
  const f = fixture();
  await rejects(() => versionTransportZone(f.prisma, { ...context, effectivePermissions: permissionsToUse }, command()), "FORBIDDEN");
  check("both write authorities are required before transaction", f.transactions() === 0);
}
for (const stale of [null, { ...currentActor, granted_permissions: [] }, { ...currentActor, denied_permissions: [permissions[3]] },
  { ...currentActor, tenant_id: "other-tenant" }, { ...currentActor, id: "other-member" }, { ...currentActor, user_id: "other-user" },
  { ...currentActor, status: "SUSPENDED" }, { ...currentActor, tenant_status: "SUSPENDED" }, { ...currentActor, user_status: "inactive" }]) {
  const f = fixture({ actor: stale });
  await rejects(() => versionTransportZone(f.prisma, context, command()), "FORBIDDEN");
  check("fresh actor refusal occurs before any zone or tariff access", f.calls.length === 1 && f.calls[0].method === "actor" && f.state().zones.length === 0);
}
{
  const f = fixture({ actor: { ...currentActor, denied_permissions: [permissions[1]] } });
  await rejects(() => listTransportZones(f.prisma, context), "FORBIDDEN");
  check("read also requires current costing permission", f.calls.length === 1);
}
{
  const f = fixture();
  const fresh = await f.prisma.$transaction((tx) => revalidateTransportActor(tx, { ...context, role: "A", effectivePermissions: [...permissions, "invented"] }, permissions), { isolationLevel: "Serializable" });
  check("fresh context uses persisted role and permissions", fresh.role === "B" && !fresh.effectivePermissions.includes("invented"));
  check("actor query binds all tenant membership user IDs with share locks", f.calls[0].sql.includes("FOR SHARE OF m, u, t") && [context.tenantId, context.membershipId, context.userId].every((value) => f.calls[0].values.includes(value)));
}

const f = fixture();
const create = command();
const first = await versionTransportZone(f.prisma, context, create);
let state = f.state();
check("zone and monetary tariffs are created atomically with independent authority", state.zones.length === 1 && state.tariffs.length === 2 && state.commands.length === 1 && state.audits.length === 3);
check("operational policy stores references and units without amounts or margins", !/unitCost|classification|MarginBps/.test(JSON.stringify(state.zones[0].result)) && state.zones[0].result.currency === "DOP");
check("all tariff conditions and result have the named tenant-scoped contract", state.tariffs.every((row) => row.source === "MOTOR" && row.conditions.transportContract === TRANSPORT_CONTRACT && row.conditions.zoneSeriesRef === first.seriesRef && canonicalHash(row.result) === canonicalHash(row.conditions)));
check("explicit monetary classes and null margins are preserved", first.components[0].classification === "PR" && first.components[1].classification === "EX" && state.tariffs.every((row) => row.minimumMarginBps === null && row.recommendedMarginBps === null));
const replay = await versionTransportZone(f.prisma, context, create);
check("same request replays exact prior result without new writes", JSON.stringify(replay) === JSON.stringify(first) && f.state().audits.length === 3);
await rejects(() => versionTransportZone(f.prisma, context, command({ code: "CHANGED" }, create.requestId)), "IDEMPOTENCY_CONFLICT");
await rejects(() => versionTransportZone(f.prisma, context, command({ seriesRef: first.seriesRef, expectedVersion: 2 })), "VERSION_CONFLICT");
await rejects(() => versionTransportZone(f.prisma, context, command()), "ZONE_CODE_CONFLICT");
check("stale version and reused request/code do not change committed state", f.state().zones.length === 1 && f.state().tariffs.length === 2);
f.setActor({ ...currentActor, denied_permissions: [permissions[3]] });
await rejects(() => versionTransportZone(f.prisma, context, create), "FORBIDDEN");
f.setActor(currentActor);
check("idempotent replay does not bypass revoked permission", f.state().commands.length === 1);

const second = await versionTransportZone(f.prisma, context, command({ seriesRef: first.seriesRef, expectedVersion: 1, components: [{ ...fuel, unitCost: "275" }], state: "DRAFT" }));
state = f.state();
check("draft retains active zone and all active tariffs", state.zones.find((row) => row.version === 1).state === "ACTIVE" && state.zones.find((row) => row.version === 2).state === "DRAFT" && state.tariffs.filter((row) => row.state === "ACTIVE").length === 2);
const activeDraft = await f.prisma.$transaction((tx) => loadTransportZones(tx, context.tenantId, new Date(Date.now() + 1000)), { isolationLevel: "Serializable" });
check("calculator sees active policy while administration sees latest draft", activeDraft[0].version === 1 && activeDraft[0].components[0].unitCost === "250" && (await listTransportZones(f.prisma, context))[0].version === 2);
const third = await versionTransportZone(f.prisma, context, command({ seriesRef: first.seriesRef, expectedVersion: second.version, components: [{ ...fuel, unitCost: "280" }], state: "ACTIVE" }));
state = f.state();
check("activation closes previous active and draft versions including removed tariffs", state.zones.filter((row) => row.state === "ACTIVE").length === 1 && state.zones.find((row) => row.version === 3).state === "ACTIVE" && state.tariffs.filter((row) => row.state === "ACTIVE").length === 1 && state.tariffs.filter((row) => row.conditions.componentCode === "TOLL").every((row) => row.state === "SUPERSEDED"));
check("component tariff replacement chain preserves price history", state.tariffs.filter((row) => row.conditions.componentCode === "FUEL").map((row) => row.unitCost).join(",") === "250,275,280" && third.components[0].costRuleVersion === 3);
const fourth = await versionTransportZone(f.prisma, context, command({ seriesRef: first.seriesRef, expectedVersion: third.version, state: "INACTIVE" }));
check("inactivation produces a version and removes all active applicability", fourth.version === 4 && f.state().zones.every((row) => row.state !== "ACTIVE") && f.state().tariffs.every((row) => row.state !== "ACTIVE"));
const inactive = await f.prisma.$transaction((tx) => loadTransportZones(tx, context.tenantId, new Date(Date.now() + 1000)), { isolationLevel: "Serializable" });
check("inactive zones are absent from calculation", inactive.length === 0);

{
  const clean = fixture(); const original = await versionTransportZone(clean.prisma, context, command());
  const failing = fixture({ failAudit: true, initial: clean.state() });
  const before = failing.state();
  await assert.rejects(() => versionTransportZone(failing.prisma, context, command({ seriesRef: original.seriesRef, expectedVersion: 1, components: [{ ...fuel, unitCost: "300" }] })), { code: "SYNTHETIC_AUDIT_FAILURE" });
  check("audit failure rolls back prior states, new tariffs, zone, and command", JSON.stringify(failing.state()) === JSON.stringify(before));
  const foreign = clean.state(); foreign.zones[0].tenantId = "other-tenant";
  const foreignDb = fixture({ initial: foreign });
  await rejects(() => versionTransportZone(foreignDb.prisma, context, command({ seriesRef: original.seriesRef, expectedVersion: 1 })), "ZONE_NOT_FOUND");
  check("foreign series reference does not disclose or version another tenant", foreignDb.state().zones.length === 1);
  const broken = clean.state(); broken.tariffs[0].tenantId = "other-tenant";
  await rejects(() => listTransportZones(fixture({ initial: broken }).prisma, context), "TARIFF_INTEGRITY");
  check("missing or foreign tariff fails closed instead of inventing a price", true);
  const generic = clean.state(); generic.zones[0].conditions = { vehicleType: "TRUCK" };
  await rejects(() => versionTransportZone(fixture({ initial: generic }).prisma, context, command({ seriesRef: original.seriesRef, expectedVersion: 1 })), "ZONE_INTEGRITY");
  check("new endpoint cannot version an unrelated generic rule series", true);
}
for (const query of [{ tenantId: "other" }, { state: ["ACTIVE"] }, { seriesRef: [first.seriesRef] }, { state: "SUPERSEDED" }]) {
  const db = fixture(); await rejects(() => listTransportZones(db.prisma, context, query), "QUERY_INVALID");
  check("ambiguous and unknown query fields are rejected before data access", db.transactions() === 0);
}
for (const error of [{ code: "P2034" }, { meta: { code: "40001" } }, { cause: { code: "40P01" } }, { code: "P2002" }]) {
  let attempts = 0;
  const value = await withTransportTransaction({ async $transaction(work) { attempts += 1; if (attempts === 1) throw error; return work({}); } }, async () => "ok", { retryUnique: true });
  check("confirmed serialization or unique rollback can retry safely", value === "ok" && attempts === 2);
}
for (const code of ["P1001", "P1017", "P2028", "AUDIT_IDEMPOTENCY_CONFLICT"]) {
  let attempts = 0; const error = { code };
  await assert.rejects(() => withTransportTransaction({ async $transaction() { attempts += 1; throw error; } }, async () => {}), (actual) => actual === error);
  check(`uncertain outcome ${code} is not replayed`, attempts === 1);
}
let attempts = 0;
await rejects(() => withTransportTransaction({ async $transaction() { attempts += 1; throw { code: "P2034" }; } }, async () => {}), "VERSION_CONFLICT");
check("retry count is bounded", attempts === 3);
process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, simulatedTransactions: true, remoteDatabaseAccess: false, results }, null, 2) + "\n");
