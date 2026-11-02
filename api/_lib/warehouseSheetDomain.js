import { Prisma } from "@prisma/client";
import { canonicalPayloadHash } from "./materialsInventoryContract.js";
import { permsForRole } from "./rbac.js";
import { normalizeWarehouseManagerQuery, normalizeWarehouseSheetSave, warehouseSheetFail } from "./warehouseSheetContract.js";
import { advanceWarehouseLocationPolicyEpoch, lockWarehouseConfiguration } from "./warehouseLocationPolicy.js";
import { allocateWarehouseAddressOrdinal, canPlaceWarehouseAddressKind, formatWarehouseAddress, warehouseAddressIdentifier, warehouseAddressOrdinal, warehouseAddressSegments, warehouseAddressSegmentsFromIdentifier, warehouseAddressToken } from "../../shared/warehouseSheetAddress.js";

const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
// Explicit legacy fields keep 20C operational during CHECK/APPLY while the 20D
// column does not yet exist. This also applies to INSERT's returned selection.
const legacyAddressSelect = Object.freeze({ id: true, tenantId: true, warehouseId: true, locationId: true, label: true, zoneNumber: true, aisleNumber: true, rackCode: true, levelNumber: true, positionNumber: true, createdAt: true });
function addressSelect(routesEnabled) { return routesEnabled ? { ...legacyAddressSelect, zoneCode: true } : legacyAddressSelect; }
function sheetInclude(routesEnabled) { return { sheetProfile: true, locations: { include: { configuration: { include: { areaUse: { select: { useRef: true } } } }, address: { select: addressSelect(routesEnabled) } }, orderBy: [{ depth: "asc" }, { code: "asc" }] } }; }
const addressFields = { ZONE: "zoneNumber", AISLE: "aisleNumber", RACK: "rackCode", LEVEL: "levelNumber", BIN: "positionNumber" };
function requirePermission(context, write = false) {
  if (permissions.slice(0, write ? 2 : 1).some((permission) => !context?.effectivePermissions?.includes(permission) || context?.deniedPermissions?.includes(permission))) warehouseSheetFail("WAREHOUSE_SHEET_FORBIDDEN", 403);
}
async function revalidateActor(tx, context, write) {
  requirePermission(context, write);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."role"::text AS "role", m."status"::text AS "status", m."granted_permissions", m."denied_permissions",
      u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${context.tenantId} AND m."id"=${context.membershipId} AND m."user_id"=${context.userId}
    FOR SHARE OF m, u, t
  `);
  const row = rows[0];
  if (rows.length !== 1 || row.status !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE" || row.tenant_status !== "ACTIVE") warehouseSheetFail("WAREHOUSE_SHEET_FORBIDDEN", 403);
  const effective = new Set([...permsForRole(row.role), ...row.granted_permissions].filter((permission) => !row.denied_permissions.includes(permission)));
  if (permissions.slice(0, write ? 2 : 1).some((permission) => !effective.has(permission))) warehouseSheetFail("WAREHOUSE_SHEET_FORBIDDEN", 403);
  return { ...context, role: row.role };
}

function managerSelect() {
  return Prisma.sql`m."id" AS "membership_id", m."public_ref"::text AS "membership_ref", m."user_id",
    COALESCE(NULLIF(BTRIM(i."full_name"), ''), u."name") AS "display_name",
    (m."status"='ACTIVE' AND UPPER(u."status")='ACTIVE' AND (p."id" IS NULL OR
      (p."employment_status"='ACTIVE' AND (p."hired_at" IS NULL OR p."hired_at"<=(CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date)
       AND (p."contract_starts_at" IS NULL OR p."contract_starts_at"<=(CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date)
       AND (p."contract_ends_at" IS NULL OR p."contract_ends_at">=(CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date)
       AND (p."terminated_at" IS NULL OR p."terminated_at">(CURRENT_TIMESTAMP AT TIME ZONE t."timezone")::date)))) AS "eligible"`;
}
function managerFrom() {
  return Prisma.sql`FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    LEFT JOIN "osi"."tenant_user_identities" i ON i."tenant_id"=m."tenant_id" AND i."membership_id"=m."id" AND i."user_id"=m."user_id"
    LEFT JOIN "osi"."employee_profiles" p ON p."tenant_id"=m."tenant_id" AND p."membership_id"=m."id" AND p."user_id"=m."user_id"`;
}
function publicManager(row) { return row ? { membershipRef: row.membership_ref, displayName: row.display_name, eligible: row.eligible === true } : null; }
async function managersById(tx, tenantId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await tx.$queryRaw(Prisma.sql`SELECT ${managerSelect()} ${managerFrom()} WHERE m."tenant_id"=${tenantId} AND m."id" IN (${Prisma.join(unique)})`);
  return new Map(rows.map((row) => [row.membership_id, row]));
}
async function managerFor(tx, tenantId, reference, previousId) {
  if (reference === null) return null;
  const rows = await tx.$queryRaw(Prisma.sql`SELECT ${managerSelect()} ${managerFrom()}
    WHERE m."tenant_id"=${tenantId} AND m."public_ref"=${reference}::uuid FOR SHARE OF m, u`);
  if (rows.length !== 1) warehouseSheetFail("WAREHOUSE_SHEET_MANAGER_NOT_FOUND", 404);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."employee_profiles" WHERE "tenant_id"=${tenantId} AND "membership_id"=${rows[0].membership_id} FOR SHARE`);
  if (!rows[0].eligible && rows[0].membership_id !== previousId) warehouseSheetFail("WAREHOUSE_SHEET_MANAGER_INELIGIBLE", 409);
  return rows[0];
}
function hasAlphanumericZone(row) { return !!row && /[A-Z]/u.test(row.label.split("-")[2] ?? ""); }
function publicAddress(row, warehouseNumber, routesEnabled = false) {
  if (!row || !routesEnabled && hasAlphanumericZone(row)) return null;
  return { label: row.label, warehouseNumber, zoneNumber: row.zoneNumber, ...(routesEnabled ? { zoneCode: row.zoneCode ?? null } : {}), aisleNumber: row.aisleNumber, rackCode: row.rackCode, levelNumber: row.levelNumber, positionNumber: row.positionNumber };
}
function publicSheet(row, people, routesEnabled = false) {
  const roots = row.locations.filter((location) => location.parentLocationId === null);
  const root = roots.length === 1 ? roots[0] : null;
  const refs = new Map(row.locations.map((location) => [location.id, location.locationRef]));
  const profile = row.sheetProfile;
  return {
    warehouseRef: row.warehouseRef, code: row.code, name: row.name, status: row.status, version: row.version,
    profileVersion: profile?.version ?? 0, warehouseNumber: profile?.warehouseNumber ?? null,
    warehouseLabel: profile ? `ALM-${warehouseAddressToken("WAREHOUSE_ROOT", profile.warehouseNumber)}` : null,
    manager: publicManager(people.get(profile?.managerMembershipId)),
    rootLocationRef: root?.locationRef ?? null, rootAreaUseRef: root?.configuration?.areaUse?.useRef ?? null,
    rootConfigurationVersion: root?.configuration?.version ?? 0,
    locations: row.locations.map((location) => ({
      locationRef: location.locationRef, parentLocationRef: location.parentLocationId ? refs.get(location.parentLocationId) ?? null : null,
      code: location.code, name: location.name, kind: location.kind, depth: location.depth, path: location.path, status: location.status, version: location.version,
      configurationVersion: location.configuration?.version ?? 0, areaUseRef: location.configuration?.areaUse?.useRef ?? null,
      address: publicAddress(location.address, profile?.warehouseNumber ?? null, routesEnabled),
    })),
  };
}
export async function listWarehouseSheets(prisma, context, { routesEnabled = false } = {}) {
  requirePermission(context);
  return prisma.$transaction(async (tx) => {
    await revalidateActor(tx, context, false);
    const rows = await tx.materialWarehouse.findMany({ where: { tenantId: context.tenantId }, include: sheetInclude(routesEnabled), orderBy: { code: "asc" } });
    const people = await managersById(tx, context.tenantId, rows.map((row) => row.sheetProfile?.managerMembershipId));
    return { warehouses: rows.map((row) => publicSheet(row, people, routesEnabled)) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });
}
export async function listWarehouseManagerOptions(prisma, context, raw = {}) {
  requirePermission(context, true); const input = normalizeWarehouseManagerQuery(raw);
  return prisma.$transaction(async (tx) => {
    await revalidateActor(tx, context, true);
    const search = input.q === null ? Prisma.empty : Prisma.sql`AND e."display_name" ILIKE ${`%${input.q.replace(/[\\%_]/gu, "\\$&")}%`} ESCAPE '\\'`;
    const eligible = Prisma.sql`WITH e AS (SELECT ${managerSelect()} ${managerFrom()} WHERE m."tenant_id"=${context.tenantId})`;
    const [count] = await tx.$queryRaw(Prisma.sql`${eligible} SELECT COUNT(*)::integer AS "total" FROM e WHERE e."eligible" ${search}`);
    const rows = await tx.$queryRaw(Prisma.sql`${eligible} SELECT * FROM e WHERE e."eligible" ${search} ORDER BY LOWER(e."display_name"),e."membership_ref" LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`);
    return { data: rows.map((row) => ({ membershipRef: row.membership_ref, displayName: row.display_name })), total: count.total, page: input.page, pageSize: input.pageSize };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });
}

async function replay(tx, context, input) {
  const row = await tx.materialInventoryCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!row) return null;
  if (row.payloadHash !== input.payloadHash || row.operation !== input.operation) warehouseSheetFail("WAREHOUSE_SHEET_IDEMPOTENCY_CONFLICT", 409);
  return row.resultJson;
}
async function confirmedReplay(prisma, context, input) {
  // A rolled-back Serializable waiter cannot return a receipt using a stale
  // actor. ReadCommitted obtains a fresh view after both command locks; shared
  // authority locks keep the revalidation and receipt read in one transaction.
  return prisma.$transaction(async (tx) => {
    await lockWarehouseConfiguration(tx, context.tenantId);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`warehouse-command:${context.tenantId}:${input.requestId}`}, 0))`);
    await revalidateActor(tx, context, true);
    return replay(tx, context, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
}
async function mutate(prisma, context, input, execute) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockWarehouseConfiguration(tx, context.tenantId);
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`warehouse-command:${context.tenantId}:${input.requestId}`}, 0))`);
        const actor = await revalidateActor(tx, context, true);
        const prior = await replay(tx, actor, input); if (prior) return prior;
        await advanceWarehouseLocationPolicyEpoch(tx, actor.tenantId);
        return execute(tx, actor);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
    } catch (error) {
      const conflict = ["P2034", "P2002"].includes(error?.code) || ["40001", "40P01"].includes(String(error?.meta?.code ?? error?.cause?.code ?? ""));
      if (!conflict) throw error;
      const prior = await confirmedReplay(prisma, context, input); if (prior) return prior;
      if (error.code === "P2002" && ["MaterialWarehouse", "MaterialLocation"].includes(error.meta?.modelName)) warehouseSheetFail("WAREHOUSE_SHEET_CODE_CONFLICT", 409);
      if (attempt === 4) warehouseSheetFail("WAREHOUSE_SHEET_WRITE_CONFLICT", 409);
    }
  }
}
function generatedCode(prefix, context, input, rowId = null) {
  return `${prefix}-${canonicalPayloadHash({ tenantId: context.tenantId, operation: input.operation, requestId: input.requestId, rowId }).slice(0, 16).toUpperCase()}`;
}
function assertVersion(actual, expected) { if (actual !== expected) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409); }
function addressFailure(error) {
  if (error?.code === "ADDRESS_CAPACITY_EXCEEDED") warehouseSheetFail("WAREHOUSE_SHEET_ADDRESS_CAPACITY_EXCEEDED", 409);
  warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
}
function ancestorsFor(location, byId) {
  const ancestors = []; const visited = new Set(); let current = location;
  while (current) {
    if (visited.has(current.id) || visited.size > 32) return null;
    visited.add(current.id); ancestors.unshift(current);
    if (current.parentLocationId === null) return ancestors;
    current = byId.get(current.parentLocationId);
  }
  return null;
}
async function setUse(tx, context, location, expectedVersion, useRef, uses) {
  const current = location.configuration;
  assertVersion(current?.version ?? 0, expectedVersion);
  const use = useRef === null ? null : uses.get(useRef);
  if (useRef !== null && !use) warehouseSheetFail("WAREHOUSE_SHEET_USE_NOT_FOUND", 404);
  if (use && use.status !== "ACTIVE" && current?.areaUseId !== use.id) warehouseSheetFail("WAREHOUSE_SHEET_USE_INACTIVE", 409);
  if ((current?.areaUseId ?? null) === (use?.id ?? null)) return;
  if (current) {
    const changed = await tx.warehouseLocationConfiguration.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: expectedVersion }, data: { areaUseId: use?.id ?? null, version: { increment: 1 } } });
    if (changed.count !== 1) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409);
  } else await tx.warehouseLocationConfiguration.create({ data: { tenantId: context.tenantId, locationId: location.id, areaUseId: use.id } });
}

function routeTarget(parent, kind, identifier, state) {
  if (!parent) return null;
  const matches = [...state.byId.values()].filter((location) => location.parentLocationId === parent.id && location.kind === kind && location.address
    && warehouseAddressIdentifier(kind, publicAddress(location.address, state.profile.warehouseNumber, true)) === identifier);
  if (matches.length > 1) warehouseSheetFail("WAREHOUSE_ROUTES_IDENTIFIER_CONFLICT", 409);
  return matches[0] ?? null;
}

// Reserve explicit siblings even when their CREATE row follows an automatic row
// or references a not-yet-processed explicit parent that will reuse an existing node.
function reservedOrdinals(parent, kind, state) {
  if (!state.routesEnabled) return [];
  const resolveParent = (row, seen = new Set()) => {
    if (row.parentLocationRef) return state.byRef.get(row.parentLocationRef) ?? null;
    if (!row.parentRowId) return state.root;
    if (state.resultRows.has(row.parentRowId)) return state.resultRows.get(row.parentRowId);
    if (seen.has(row.parentRowId)) return null;
    seen.add(row.parentRowId);
    const pendingParent = state.createRows.get(row.parentRowId);
    if (!pendingParent?.identifier) return null;
    return routeTarget(resolveParent(pendingParent, seen), pendingParent.kind, pendingParent.identifier, state);
  };
  return [...state.createRows.values()].filter((row) => row.kind === kind && row.identifier && resolveParent(row)?.id === parent.id)
    .filter((row) => kind !== "ZONE" || !/[A-Z]/u.test(row.identifier))
    .map((row) => warehouseAddressOrdinal(kind, row.identifier));
}

// Addresses are assigned only by an explicit save to the root, touched existing
// rows/their ancestors, and explicitly created rows. Historical unsupported
// branches retain their old codes; no synthetic zero-placeholder nodes exist.
async function ensureAddress(tx, context, location, state, { required = false, identifier } = {}) {
  if (location.address) {
    if (!state.routesEnabled && hasAlphanumericZone(location.address)) warehouseSheetFail("WAREHOUSE_ROUTES_DISABLED", 409);
    const address = publicAddress(location.address, state.profile.warehouseNumber, state.routesEnabled);
    if (identifier && warehouseAddressIdentifier(location.kind, address) !== identifier) warehouseSheetFail("WAREHOUSE_ROUTES_IDENTIFIER_CONFLICT", 409);
    return address;
  }
  const ancestors = ancestorsFor(location, state.byId);
  if (!ancestors || !canPlaceWarehouseAddressKind(location.kind, ancestors.slice(0, -1).map((row) => row.kind))) {
    if (required) warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
    return null;
  }
  let segments;
  try {
    if (location.parentLocationId === null) segments = warehouseAddressSegments(null, "WAREHOUSE_ROOT", state.profile.warehouseNumber);
    else {
      const parent = state.byId.get(location.parentLocationId);
      const parentAddress = await ensureAddress(tx, context, parent, state, { required });
      if (!parentAddress) return null;
      if (identifier) segments = warehouseAddressSegmentsFromIdentifier(parentAddress, location.kind, identifier);
      else {
        const used = [...state.byId.values()].filter((row) => row.parentLocationId === parent.id && row.kind === location.kind && row.address)
          .map((row) => location.kind === "RACK" ? warehouseAddressOrdinal("RACK", row.address.rackCode) : row.address[addressFields[location.kind]])
          .filter((ordinal) => ordinal !== 0);
        segments = warehouseAddressSegments(parentAddress, location.kind, allocateWarehouseAddressOrdinal(location.kind, [...used, ...reservedOrdinals(parent, location.kind, state)]));
      }
    }
  } catch (error) {
    if (error?.name !== "WarehouseAddressError") throw error;
    if (required) addressFailure(error);
    return null;
  }
  const { warehouseNumber: _warehouseNumber, ...fields } = segments;
  const label = formatWarehouseAddress(segments);
  if (identifier && [...state.byId.values()].some((row) => row.id !== location.id && row.address?.label === label)) warehouseSheetFail("WAREHOUSE_ROUTES_IDENTIFIER_CONFLICT", 409);
  location.address = await tx.warehouseLocationAddress.create({ data: { tenantId: context.tenantId, warehouseId: state.warehouse.id, locationId: location.id, label, ...fields }, select: addressSelect(state.routesEnabled) });
  return publicAddress(location.address, state.profile.warehouseNumber, state.routesEnabled);
}

export async function saveWarehouseSheet(prisma, context, raw, { routesEnabled = false } = {}) {
  requirePermission(context, true); const input = normalizeWarehouseSheetSave(raw);
  if (!routesEnabled && input.rows.some((row) => Object.hasOwn(row, "identifier"))) warehouseSheetFail("WAREHOUSE_ROUTES_DISABLED", 409);
  const include = sheetInclude(routesEnabled);
  return mutate(prisma, context, input, async (tx, actor) => {
    let warehouse;
    if (input.warehouseRef) {
      warehouse = await tx.materialWarehouse.findFirst({ where: { tenantId: actor.tenantId, warehouseRef: input.warehouseRef }, include });
      if (!warehouse) warehouseSheetFail("WAREHOUSE_SHEET_NOT_FOUND", 404);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`warehouse:${actor.tenantId}:${warehouse.id}`}, 0))`);
      assertVersion(warehouse.version, input.expectedWarehouseVersion);
      assertVersion(warehouse.sheetProfile?.version ?? 0, input.expectedProfileVersion);
    } else {
      warehouse = await tx.materialWarehouse.create({ data: { tenantId: actor.tenantId, code: generatedCode("ALM", actor, input), name: input.name }, include });
      const root = await tx.materialLocation.create({ data: { tenantId: actor.tenantId, warehouseId: warehouse.id, code: warehouse.code, name: input.name, kind: "WAREHOUSE_ROOT", depth: 0, path: warehouse.code } });
      warehouse.locations.push({ ...root, configuration: null, address: null });
    }
    const roots = warehouse.locations.filter((location) => location.parentLocationId === null);
    if (roots.length !== 1) warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
    const root = roots[0];
    assertVersion(root.configuration?.version ?? 0, input.expectedRootConfigurationVersion);
    const byId = new Map(warehouse.locations.map((row) => [row.id, row]));
    const byRef = new Map(warehouse.locations.map((row) => [row.locationRef, row]));
    const beforePeople = await managersById(tx, actor.tenantId, [warehouse.sheetProfile?.managerMembershipId]);
    const before = input.warehouseRef ? publicSheet(warehouse, beforePeople, routesEnabled) : null;
    const manager = await managerFor(tx, actor.tenantId, input.managerMembershipRef, warehouse.sheetProfile?.managerMembershipId);
    const useRefs = [...new Set([input.rootAreaUseRef, ...input.rows.map((row) => row.areaUseRef)].filter(Boolean))];
    const uses = new Map((useRefs.length ? await tx.warehouseAreaUse.findMany({ where: { tenantId: actor.tenantId, useRef: { in: useRefs } } }) : []).map((row) => [row.useRef, row]));
    let profile = warehouse.sheetProfile;
    if (profile) {
      const changed = await tx.warehouseSheetProfile.updateMany({ where: { tenantId: actor.tenantId, id: profile.id, version: input.expectedProfileVersion }, data: { managerMembershipId: manager?.membership_id ?? null, managerUserId: manager?.user_id ?? null, version: { increment: 1 } } });
      if (changed.count !== 1) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409);
    } else {
      const allocated = await tx.warehouseSheetProfile.findMany({ where: { tenantId: actor.tenantId }, select: { warehouseNumber: true } });
      let warehouseNumber; try { warehouseNumber = allocateWarehouseAddressOrdinal("WAREHOUSE_ROOT", allocated.map((row) => row.warehouseNumber)); } catch (error) { addressFailure(error); }
      profile = await tx.warehouseSheetProfile.create({ data: { tenantId: actor.tenantId, warehouseId: warehouse.id, warehouseNumber, managerMembershipId: manager?.membership_id ?? null, managerUserId: manager?.user_id ?? null } });
    }
    if (input.warehouseRef) {
      const changed = await tx.materialWarehouse.updateMany({ where: { tenantId: actor.tenantId, id: warehouse.id, version: input.expectedWarehouseVersion }, data: { name: input.name, version: { increment: 1 } } });
      if (changed.count !== 1) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409);
      if (root.name !== input.name) {
        const renamed = await tx.materialLocation.updateMany({ where: { tenantId: actor.tenantId, id: root.id, version: root.version }, data: { name: input.name, version: { increment: 1 } } });
        if (renamed.count !== 1) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409);
      }
    }
    await setUse(tx, actor, root, input.expectedRootConfigurationVersion, input.rootAreaUseRef, uses);
    const resultRows = new Map();
    const createRows = new Map(input.rows.filter((row) => row.action === "CREATE").map((row) => [row.rowId, row]));
    const state = { warehouse, profile, root, byId, byRef, createRows, resultRows, routesEnabled };
    const claimedTargets = new Set();
    const recordResult = (row, location) => {
      if (claimedTargets.has(location.id)) warehouseSheetFail("WAREHOUSE_ROUTES_DUPLICATE_TARGET", 409);
      claimedTargets.add(location.id); resultRows.set(row.rowId, location);
    };
    await ensureAddress(tx, actor, root, state);
    for (const row of input.rows.filter((entry) => entry.action === "UPDATE")) {
      const location = byRef.get(row.locationRef);
      if (!location) warehouseSheetFail("WAREHOUSE_SHEET_LOCATION_NOT_FOUND", 404);
      if (location.id === root.id) warehouseSheetFail("WAREHOUSE_SHEET_ROOT_ROW_INVALID", 409);
      assertVersion(location.version, row.expectedVersion);
      await setUse(tx, actor, location, row.expectedConfigurationVersion, row.areaUseRef, uses);
      if (location.name !== row.name) {
        const changed = await tx.materialLocation.updateMany({ where: { tenantId: actor.tenantId, id: location.id, version: row.expectedVersion }, data: { name: row.name, version: { increment: 1 } } });
        if (changed.count !== 1) warehouseSheetFail("WAREHOUSE_SHEET_VERSION_CONFLICT", 409);
      }
      await ensureAddress(tx, actor, location, state);
      recordResult(row, location);
    }
    const pending = input.rows.filter((entry) => entry.action === "CREATE");
    while (pending.length) {
      const index = pending.findIndex((row) => row.parentRowId === null || resultRows.has(row.parentRowId));
      if (index < 0) warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
      const [row] = pending.splice(index, 1);
      const parent = row.parentRowId ? resultRows.get(row.parentRowId) : row.parentLocationRef ? byRef.get(row.parentLocationRef) : root;
      if (!parent) warehouseSheetFail("WAREHOUSE_SHEET_LOCATION_NOT_FOUND", 404);
      const ancestors = ancestorsFor(parent, byId);
      if (!ancestors || !canPlaceWarehouseAddressKind(row.kind, ancestors.map((node) => node.kind))) warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
      if (warehouse.status !== "ACTIVE" || ancestors.some((node) => node.status !== "ACTIVE")) warehouseSheetFail("WAREHOUSE_SHEET_RESOURCE_INACTIVE", 409);
      await ensureAddress(tx, actor, parent, state, { required: true });
      const existing = row.identifier ? routeTarget(parent, row.kind, row.identifier, state) : null;
      if (existing) {
        if (claimedTargets.has(existing.id)) warehouseSheetFail("WAREHOUSE_ROUTES_DUPLICATE_TARGET", 409);
        if (existing.status !== "ACTIVE") warehouseSheetFail("WAREHOUSE_SHEET_RESOURCE_INACTIVE", 409);
        if (existing.name !== row.name || (existing.configuration?.areaUse?.useRef ?? null) !== row.areaUseRef) warehouseSheetFail("WAREHOUSE_ROUTES_REUSE_CONFLICT", 409);
        recordResult(row, existing);
        continue;
      }
      const code = generatedCode("UBI", actor, input, row.rowId);
      const path = `${parent.path}/${code}`; const depth = parent.depth + 1;
      if (depth > 32 || path.length > 600) warehouseSheetFail("WAREHOUSE_SHEET_HIERARCHY_INVALID", 409);
      const location = { ...await tx.materialLocation.create({ data: { tenantId: actor.tenantId, warehouseId: warehouse.id, parentLocationId: parent.id, code, name: row.name, kind: row.kind, depth, path } }), configuration: null, address: null };
      byId.set(location.id, location); byRef.set(location.locationRef, location);
      await setUse(tx, actor, location, 0, row.areaUseRef, uses);
      await ensureAddress(tx, actor, location, state, { required: true, identifier: row.identifier });
      recordResult(row, location);
    }
    const saved = await tx.materialWarehouse.findFirst({ where: { tenantId: actor.tenantId, id: warehouse.id }, include });
    const people = await managersById(tx, actor.tenantId, [saved.sheetProfile.managerMembershipId]);
    const result = { warehouse: publicSheet(saved, people, routesEnabled), rowResults: input.rows.map((row) => ({ rowId: row.rowId, locationRef: resultRows.get(row.rowId).locationRef })) };
    await tx.materialInventoryCommand.create({ data: { tenantId: actor.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: warehouse.warehouseRef, resultJson: result, actorMembershipId: actor.membershipId, actorUserId: actor.userId } });
    await tx.commercialAuditLog.create({ data: { tenant_id: actor.tenantId, actor_user_id: actor.userId, actor_membership_id: actor.membershipId, role_snapshot: actor.role, action: input.operation, entity: "WarehouseSheet", entityId: warehouse.warehouseRef, ...(before ? { before_json: before } : {}), after_json: result, source: "V17_WAREHOUSE_SHEET", request_id: input.requestId, correlation_id: input.requestId, critical: true } });
    return result;
  });
}
