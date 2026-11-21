import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { transportRingError } from "../../shared/transportGeometry.js";
import { canonicalHash, logisticsFail } from "./logisticsEngineContract.js";
import { logisticsLocalityKey } from "./logisticsMetroClassification.js";
import {
  authorizeTransportContext,
  revalidateTransportActor,
  withTransportTransaction,
} from "./logisticsTransportZones.js";

const CONTRACT = "V17_LOGISTICS_GEOGRAPHY_V1";
const METRO_REF = "37bc6e2d-4aba-4fb7-b596-ef70a30cadef";
const METRO_CODE = "METRO";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE_KINDS = new Set(["OFFICE", "WAREHOUSE", "YARD"]);
const CLASSIFICATIONS = new Set(["METRO", "INTERIOR"]);
const COLLATOR = new Intl.Collator("es", { sensitivity: "base" });

export const LOGISTICS_GEOGRAPHY_PERMISSIONS = Object.freeze({
  VIEW: "logistics:rules:view",
  MANAGE: "logistics:rules:manage",
});

function fail(code, status = 400) {
  logisticsFail(`LOGISTICS_GEOGRAPHY_${code}`, status);
}

function exact(value, expected, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || expected.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !expected.includes(key) && !optional.includes(key))) fail("INPUT_INVALID");
}

function label(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /\p{Cc}/u.test(value)) fail("INPUT_INVALID");
  return value.trim();
}

function point(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)
    || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail("INPUT_INVALID");
  return [...value];
}

function geometry(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 201) fail("INPUT_INVALID");
  const ring = value.map(point);
  const first = ring[0];
  const last = ring.at(-1);
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  if (transportRingError(closed)) fail("INPUT_INVALID");
  return closed.slice(0, -1);
}

function mapLocalities(value) {
  if (!Array.isArray(value)) fail("INPUT_INVALID");
  const found = new Set();
  return value.map((item) => {
    exact(item, ["city", "sector"], ["classification"]);
    const city = label(item.city, 160);
    const sector = item.sector === null ? null : label(item.sector, 160);
    const classification = Object.hasOwn(item, "classification") ? item.classification : "METRO";
    if (!CLASSIFICATIONS.has(classification)) fail("INPUT_INVALID");
    const key = JSON.stringify([logisticsLocalityKey(city), logisticsLocalityKey(sector)]);
    if (found.has(key)) fail("LOCALITY_DUPLICATE");
    found.add(key);
    return { city, sector, classification };
  });
}

function normalize(raw) {
  const common = ["operation", "requestId", "expectedVersion", "name"];
  switch (raw?.operation) {
    case "SAVE_BASE":
      exact(raw, [...common, "baseRef", "address", "kind", "point", "active"]);
      break;
    case "SAVE_METRO":
      exact(raw, [...common, "geometry", "localities"]);
      break;
    default:
      fail("INPUT_INVALID");
  }

  const { operation, requestId, expectedVersion } = raw;
  if (typeof requestId !== "string" || !UUID.test(requestId)
    || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2_147_483_647) {
    fail("INPUT_INVALID");
  }
  const commonData = { operation, requestId, expectedVersion, name: label(raw.name, 160) };
  if (operation === "SAVE_METRO") {
    return { ...commonData, geometry: geometry(raw.geometry), localities: mapLocalities(raw.localities) };
  }
  const { baseRef, active, kind } = raw;
  if ((expectedVersion === 0 ? baseRef !== null : typeof baseRef !== "string" || !UUID.test(baseRef) || baseRef === METRO_REF)
    || !BASE_KINDS.has(kind) || typeof active !== "boolean") fail("INPUT_INVALID");
  return { ...commonData, baseRef, kind, active, address: label(raw.address, 240), point: point(raw.point) };
}

function namespace(tenantId) {
  return {
    tenantId,
    family: { in: ["TRANSPORT", "ZONE"] },
    conditions: { path: ["transportContract"], equals: CONTRACT },
  };
}

function projectRow(row) {
  const { code, name, version, seriesRef, result, conditions, state } = row;
  if (row.conditionHash !== canonicalHash(conditions) || conditions?.transportContract !== CONTRACT
    || conditions.geographyRef !== seriesRef || result?.contract !== CONTRACT
    || !Number.isSafeInteger(version) || version < 1) fail("INTEGRITY", 503);

  if (conditions?.kind === "METRO" && row.family === "ZONE" && seriesRef === METRO_REF
    && code === METRO_CODE && state === "ACTIVE") {
    return { code, ruleRef: row.ruleRef, name, version, geometry: result.geometry, localities: result.localities };
  }

  if (conditions?.kind === "BASE" && row.family === "TRANSPORT" && code === baseCode(seriesRef)
    && BASE_KINDS.has(result.kind) && (state === "ACTIVE" || state === "INACTIVE")) {
    return {
      baseRef: seriesRef,
      code,
      name,
      version,
      kind: result.kind,
      address: result.address,
      point: result.point,
      active: state === "ACTIVE",
    };
  }
  fail("INTEGRITY", 503);
}

export async function loadLogisticsGeography(database, tenantId) {
  const rows = await database.logisticsRule.findMany({
    where: { ...namespace(tenantId), state: { in: ["ACTIVE", "INACTIVE"] } },
    orderBy: [{ name: "asc" }, { seriesRef: "asc" }],
  });
  const bases = [];
  let metro = null;
  for (const row of rows) {
    const entry = projectRow(row);
    if (row.tenantId !== tenantId) fail("INTEGRITY", 503);
    if (entry.code === METRO_CODE) {
      if (metro) fail("INTEGRITY", 503);
      metro = entry;
    } else {
      bases.push(entry);
    }
  }
  return { bases, metro };
}

export async function getLogisticsGeography(prisma, context, query = {}) {
  authorizeTransportContext(context, LOGISTICS_GEOGRAPHY_PERMISSIONS.VIEW);
  exact(query, []);
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, LOGISTICS_GEOGRAPHY_PERMISSIONS.VIEW);
    return loadLogisticsGeography(tx, actor.tenantId);
  });
}

function baseCode(seriesRef) {
  return `BASE-${seriesRef.replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

export async function saveLogisticsGeography(prisma, context, raw) {
  authorizeTransportContext(context, LOGISTICS_GEOGRAPHY_PERMISSIONS.MANAGE);
  const input = normalize(raw);
  const payloadHash = canonicalHash(input);
  const { requestId, operation, expectedVersion, name } = input;
  const metro = operation === "SAVE_METRO";
  const seriesRef = metro ? METRO_REF : input.baseRef ?? randomUUID();
  const code = metro ? METRO_CODE : baseCode(seriesRef);
  const state = metro || input.active ? "ACTIVE" : "INACTIVE";
  const conditions = { transportContract: CONTRACT, geographyRef: seriesRef, kind: metro ? "METRO" : "BASE" };
  const result = metro
    ? { contract: CONTRACT, geometry: input.geometry, localities: input.localities }
    : { contract: CONTRACT, kind: input.kind, address: input.address, point: input.point };

  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, LOGISTICS_GEOGRAPHY_PERMISSIONS.MANAGE);
    const { tenantId, membershipId: actorMembershipId, userId: actorUserId } = actor;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:logistics-geography`}, 0))`);
    const prior = await tx.logisticsMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
    if (prior) {
      if (prior.operation !== operation || prior.payloadHash !== payloadHash) fail("REQUEST_CONFLICT", 409);
      return prior.resultJson;
    }

    const current = await tx.logisticsRule.findFirst({
      where: { ...namespace(tenantId), seriesRef },
      orderBy: { version: "desc" },
    });
    if (!current && !metro && input.baseRef) fail("NOT_FOUND", 404);
    if (expectedVersion !== (current?.version ?? 0)) fail("VERSION_CONFLICT", 409);
    if (current) projectRow(current);

    if (!metro) {
      const { bases } = await loadLogisticsGeography(tx, tenantId);
      if (bases.some((base) => base.baseRef !== seriesRef && COLLATOR.compare(base.name, name) === 0)) fail("BASE_DUPLICATE", 409);
    }

    const at = new Date();
    if (current) {
      await tx.logisticsRule.update({
        where: { id: current.id },
        data: { state: "SUPERSEDED", ...(current.validFrom == null || current.validFrom < at ? { validTo: at } : {}) },
      });
    }
    const row = await tx.logisticsRule.create({
      data: {
        tenantId,
        actorMembershipId,
        actorUserId,
        family: metro ? "ZONE" : "TRANSPORT",
        seriesRef,
        code,
        name,
        conditions,
        conditionHash: canonicalHash(conditions),
        result,
        state,
        version: expectedVersion + 1,
        validFrom: at,
        replacesRuleId: current?.id ?? null,
        requestId,
        payloadHash,
      },
    });
    const entry = projectRow(row);
    await tx.logisticsMutationCommand.create({
      data: { tenantId, actorMembershipId, actorUserId, requestId, operation, payloadHash, targetRef: row.ruleRef, resultJson: entry },
    });
    await tx.commercialAuditLog.create({
      data: {
        tenant_id: tenantId,
        actor_membership_id: actorMembershipId,
        actor_user_id: actorUserId,
        role_snapshot: actor.role,
        action: metro ? "LOGISTICS_GEOGRAPHY_METRO_SAVE" : "LOGISTICS_GEOGRAPHY_BASE_SAVE",
        entity: "LogisticsRule",
        entityId: row.ruleRef,
        after_json: { seriesRef, code, version: entry.version, state },
        source: "V17_LOGISTICS_GEOGRAPHY",
        request_id: requestId,
        correlation_id: requestId,
        critical: true,
      },
    });
    return entry;
  }, { retryUnique: true });
}
