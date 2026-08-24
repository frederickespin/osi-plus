import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";

const PUBLIC_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const HASH = /^[0-9a-f]{64}$/;
const MODES = new Set(["LOCAL", "EXPORT", "IMPORT"]);
const CUSTOMER_TYPES = new Set(["L1_AGENT", "L2_INTL_DIRECT", "L3_CORPORATE", "L4_PERSONAL"]);
const SURVEY_METHODS = new Set(["PRESENCIAL", "VIRTUAL", "LISTADO_FOTOS", "NO_APLICA"]);
const CREATE_FIELDS = new Set([
  "requestId", "payloadHash", "clientRef", "mode", "serviceType", "customerType",
  "estimatedCbm", "requiresSurvey", "surveyMethod", "originLocation",
  "destinationLocation", "destinationContracted",
]);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS, "expectedVersion"]);

export class CrmCaseMutationError extends Error {
  constructor(code, status, message = code, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CrmCaseMutationError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) { throw new CrmCaseMutationError(code, status, message); }
function exactObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  if (Object.keys(value).some((key) => !fields.has(key))) fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
}
function requiredText(value, max) {
  if (typeof value !== "string" || !value || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) {
    fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  }
  return value;
}
function enumValue(value, values) {
  const result = requiredText(value, 80);
  if (!values.has(result)) fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  return result;
}
function requestId(value) {
  const result = requiredText(value, 191);
  if (!REQUEST_ID.test(result)) fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  return result;
}
function clientRef(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !PUBLIC_REF.test(value)) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  return value;
}
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  }
  return value;
}
function boolean(value) {
  if (typeof value !== "boolean") fail("CRM_PIPELINE_CASE_INPUT_INVALID", 400);
  return value;
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
export function hashCrmCaseMutation(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}
function normalizeShared(input) {
  return Object.freeze({
    requestId: requestId(input.requestId),
    clientRef: clientRef(input.clientRef),
    mode: enumValue(input.mode, MODES),
    serviceType: requiredText(input.serviceType, 80),
    customerType: enumValue(input.customerType, CUSTOMER_TYPES),
    estimatedCbm: number(input.estimatedCbm),
    requiresSurvey: boolean(input.requiresSurvey),
    surveyMethod: enumValue(input.surveyMethod, SURVEY_METHODS),
    originLocation: requiredText(input.originLocation, 500),
    destinationLocation: requiredText(input.destinationLocation, 500),
    destinationContracted: boolean(input.destinationContracted),
  });
}
function normalize(input, operation) {
  exactObject(input, operation === "CREATE" ? CREATE_FIELDS : UPDATE_FIELDS);
  const shared = normalizeShared(input);
  const payload = Object.freeze({ operation, ...shared, ...(operation === "UPDATE" ? { expectedVersion: version(input.expectedVersion) } : {}) });
  if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash) || input.payloadHash !== hashCrmCaseMutation(payload)) {
    fail("CRM_PIPELINE_PAYLOAD_HASH_INVALID", 400);
  }
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

async function limits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '250ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3s'");
}
async function lock(tx, tenantId, namespace, value) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`CRM-04A:${namespace}:${tenantId}:${value}`},0)) AS "ok"`);
  if (rows[0]?.ok !== true) fail("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409);
}
async function actor(tx, context, operation) {
  const tenantId = requiredText(context?.tenantId, 191);
  const membershipId = requiredText(context?.membershipId, 191);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",m."status"::text AS "membership_status",
      m."granted_permissions",m."denied_permissions",u."status" AS "user_status",u."name",t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId}
    LIMIT 1 FOR UPDATE OF m
  `);
  const row = rows[0];
  if (!row) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  if (String(row.user_status).toUpperCase() !== "ACTIVE" || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE") {
    fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  }
  const role = String(row.role).toUpperCase();
  if (!new Set(["A", "V"]).has(role)) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((item) => !denied.has(item)));
  const permission = operation === "CREATE"
    ? PERMS.PIPELINE_CREATE
    : role === "A" ? PERMS.PIPELINE_UPDATE_ANY : PERMS.PIPELINE_UPDATE_OWN;
  if (denied.has(permission) || !effective.has(permission)) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  return Object.freeze({ tenantId, membershipId: row.id, userId: row.user_id, role, name: String(row.name || "Usuario") });
}
async function resolveClient(tx, tenantId, ref) {
  if (!ref) return null;
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "id","public_ref","name","type","status"
    FROM "osi"."osi_clients"
    WHERE "tenant_id"=${tenantId} AND "public_ref"=CAST(${ref} AS uuid)
    LIMIT 1 FOR KEY SHARE
  `);
  if (!rows[0]) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return rows[0];
}
async function prior(tx, tenantId, id) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."pipeline_case_commands" WHERE "tenant_id"=${tenantId} AND "request_id"=${id} LIMIT 1`);
  return rows[0] || null;
}
async function safeCase(tx, tenantId, id) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT c."public_ref",c."caseCode",c."status"::text AS "status",c."version",c."mode"::text AS "mode",
      c."serviceType",c."customerType"::text AS "customerType",c."estimatedCbm",c."requiresSurvey",
      c."surveyMethod"::text AS "surveyMethod",c."originLocation",c."destinationLocation",
      c."destinationContracted",c."createdAt",c."updatedAt",cl."name" AS "client_name",cl."type" AS "client_type",cl."status" AS "client_status"
    FROM "osi"."osi_pipeline_cases" c
    LEFT JOIN "osi"."osi_clients" cl ON cl."tenant_id"=c."tenant_id" AND cl."id"=c."client_id"
    WHERE c."tenant_id"=${tenantId} AND c."id"=${id} LIMIT 1
  `);
  const row = rows[0];
  if (!row) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return Object.freeze({
    caseRef: row.public_ref, caseCode: row.caseCode, status: row.status, version: Number(row.version), mode: row.mode,
    serviceType: row.serviceType, customerType: row.customerType, estimatedCbm: row.estimatedCbm,
    requiresSurvey: row.requiresSurvey, surveyMethod: row.surveyMethod, originLocation: row.originLocation,
    destinationLocation: row.destinationLocation, destinationContracted: row.destinationContracted,
    client: row.client_name ? Object.freeze({ displayName: row.client_name, type: row.client_type, status: row.client_status }) : null,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function samePrior(row, operation, command, who) {
  return row.command_type === operation && row.payload_hash === command.payloadHash
    && row.actor_membership_id === who.membershipId && row.actor_user_id === who.userId
    && (operation === "CREATE" ? Number(row.expected_version) === 0 : Number(row.expected_version) === command.expectedVersion);
}
async function replay(tx, who, command, operation, expectedRef = null) {
  const row = await prior(tx, who.tenantId, command.requestId);
  if (!row) return null;
  if (!samePrior(row, operation, command, who)) fail("CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409);
  const result = await safeCase(tx, who.tenantId, row.pipeline_case_id);
  if (expectedRef && result.caseRef !== expectedRef) fail("CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409);
  return Object.freeze({ case: result, replayed: true });
}
function code() {
  const year = new Date().getUTCFullYear();
  return `CS-${year}-${randomUUID().replaceAll("-", "").toUpperCase()}`;
}
async function journal(tx, who, pipelineCase, command, operation, previousVersion, resultingVersion, owner, status) {
  const id = randomUUID();
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."pipeline_case_commands" (
      "id","tenant_id","pipeline_case_id","request_id","command_type","payload_hash","expected_version","resulting_version",
      "previous_status","resulting_status","previous_owner_membership_id","previous_owner_user_id",
      "resulting_owner_membership_id","resulting_owner_user_id","actor_membership_id","actor_user_id","actor_role"
    ) VALUES (
      ${id},${who.tenantId},${pipelineCase.id},${command.requestId},CAST(${operation} AS "osi"."PipelineCaseCommandType"),${command.payloadHash},
      ${previousVersion},${resultingVersion},CAST(${status} AS "osi"."PipelineCaseStatus"),CAST(${status} AS "osi"."PipelineCaseStatus"),
      ${operation === "CREATE" ? null : owner.membershipId},${operation === "CREATE" ? null : owner.userId},
      ${owner.membershipId},${owner.userId},${who.membershipId},${who.userId},${who.role}
    )
  `);
  await appendCommercialAudit(tx, { tenantId: who.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: who.membershipId }, {
    source: "CRM_CASE_MUTATION_04A", action: operation === "CREATE" ? "CRM_PIPELINE_CASE_CREATED" : "CRM_PIPELINE_CASE_UPDATED",
    entity: "PIPELINE_CASE", entityId: pipelineCase.id, requestId: command.requestId, correlationId: command.requestId,
    beforeJson: operation === "CREATE" ? null : { version: previousVersion },
    afterJson: { version: resultingVersion, status, clientLinked: Boolean(pipelineCase.clientId) },
    metadataJson: { commandType: operation },
  });
}
function data(command, client) {
  return {
    clientId: client?.id || null, mode: command.mode, serviceType: command.serviceType,
    customerType: command.customerType, estimatedCbm: command.estimatedCbm,
    requiresSurvey: command.requiresSurvey, surveyMethod: command.surveyMethod,
    originLocation: command.originLocation, destinationLocation: command.destinationLocation,
    destinationContracted: command.destinationContracted,
  };
}
function databaseError(error) {
  const pg = [error?.meta?.code, error?.cause?.code, error?.code].find((item) => typeof item === "string");
  if (["23503", "23505", "23514"].includes(pg)) return new CrmCaseMutationError("CRM_PIPELINE_STATE_INVALID", 409);
  if (["55P03", "57014"].includes(pg)) return new CrmCaseMutationError("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409);
  return new CrmCaseMutationError("CRM_PIPELINE_DATABASE_UNAVAILABLE", 503, undefined, { cause: error });
}

export async function createCrmPipelineCase(context, input, database = prisma) {
  const command = normalize(input, "CREATE");
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx);
      const tenantId = requiredText(context?.tenantId, 191);
      await lock(tx, tenantId, "REQUEST", command.requestId);
      const who = await actor(tx, context, "CREATE");
      const old = await replay(tx, who, command, "CREATE");
      if (old) return old;
      const client = await resolveClient(tx, who.tenantId, command.clientRef);
      const own = who.role === "V" ? { membershipId: who.membershipId, userId: who.userId } : { membershipId: null, userId: null };
      const created = await tx.pipelineCase.create({ data: {
        tenantId: who.tenantId, caseCode: code(), clientName: null, status: "NEW_INBOX", version: 1,
        ownerId: own.userId, ownerMembershipId: own.membershipId, ownerUserId: own.userId,
        ownerName: who.role === "V" ? who.name : "Sin asignar", ...data(command, client),
      }, select: { id: true, clientId: true } });
      await journal(tx, who, created, command, "CREATE", 0, 1, own, "NEW_INBOX");
      return Object.freeze({ case: await safeCase(tx, who.tenantId, created.id), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof CrmCaseMutationError) throw error;
    throw databaseError(error);
  }
}

export async function updateCrmPipelineCase(context, ref, input, database = prisma) {
  if (typeof ref !== "string" || !PUBLIC_REF.test(ref)) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const command = normalize(input, "UPDATE");
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx);
      const tenantId = requiredText(context?.tenantId, 191);
      await lock(tx, tenantId, "REQUEST", command.requestId);
      await lock(tx, tenantId, "CASE", ref);
      const who = await actor(tx, context, "UPDATE");
      const old = await replay(tx, who, command, "UPDATE", ref);
      if (old) return old;
      const rows = await tx.$queryRaw(Prisma.sql`
        SELECT * FROM "osi"."osi_pipeline_cases"
        WHERE "tenant_id"=${who.tenantId} AND "public_ref"=CAST(${ref} AS uuid)
        LIMIT 1 FOR UPDATE
      `);
      const current = rows[0];
      if (!current) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
      if (["APPROVED", "OPS_HANDOFF"].includes(current.status)) fail("CRM_PIPELINE_STATE_INVALID", 409);
      if (who.role === "V" && (current.owner_membership_id !== who.membershipId || current.owner_user_id !== who.userId)) {
        fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
      }
      if (Number(current.version) !== command.expectedVersion) fail("CRM_PIPELINE_VERSION_CONFLICT", 409);
      const client = await resolveClient(tx, who.tenantId, command.clientRef);
      const next = command.expectedVersion + 1;
      const changed = await tx.pipelineCase.updateMany({
        where: { id: current.id, tenantId: who.tenantId, version: command.expectedVersion },
        data: { ...data(command, client), version: next },
      });
      if (changed.count !== 1) fail("CRM_PIPELINE_VERSION_CONFLICT", 409);
      const owner = { membershipId: current.owner_membership_id, userId: current.owner_user_id };
      await journal(tx, who, { id: current.id, clientId: client?.id || null }, command, "UPDATE", command.expectedVersion, next, owner, current.status);
      return Object.freeze({ case: await safeCase(tx, who.tenantId, current.id), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof CrmCaseMutationError) throw error;
    throw databaseError(error);
  }
}
