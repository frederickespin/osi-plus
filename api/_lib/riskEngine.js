import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit, sanitizeCommercialAuditJson } from "./commercialAuditLog.js";

export const RISK_PERMISSIONS = Object.freeze({
  VIEW: "risk:view",
  MANAGE: "risk:manage",
  APPROVE: "risk:approve",
  ACTIVATE: "risk:activate",
  RETIRE: "risk:retire",
  EVALUATE: "risk:evaluate",
  CHANGE_MODE: "risk:mode:change",
});

export const RISK_RESULTS = Object.freeze(["PASS", "REVIEW_REQUIRED", "BLOCKED"]);
export const RISK_RULE_STATES = Object.freeze(["DRAFT", "SHADOW", "ACTIVE", "RETIRED"]);
export const RISK_CONDITION_TYPES = Object.freeze([
  "DISTANCE_OVER_KM",
  "REGION_IN_SET",
  "LOGISTIC_FLAG_PRESENT",
  "MARGIN_BELOW_PERCENT",
]);
export const RISK_OPERATION_MODES = Object.freeze(["LEGACY_ONLY", "SHADOW", "ENFORCED"]);

const ALLOWED_DISTANCE_FIELDS = new Set(["hubDistanceKm", "transportDistanceKm", "measuredDistanceKm"]);
const ALLOWED_REGION_FIELDS = new Set(["originRegionCode", "destinationRegionCode"]);
const ALLOWED_FLAGS = new Set([
  "HIGH_RISK_ZONE",
  "DISTANCE_REQUIRES_APPROVAL",
  "DISTANCE_OVER_AUTOMATIC_LIMIT",
  "DISTANCE_OVER_LIMIT",
  "NO_VEHICLE_AVAILABLE",
  "NO_VEHICLE_BLOCKING",
  "BELOW_MINIMUM_MARGIN",
]);

export class RiskEngineError extends Error {
  constructor(message, { code = "RISK_ENGINE_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "RiskEngineError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, maxLength = 191) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new RiskEngineError(`${field} es obligatorio y admite hasta ${maxLength} caracteres.`, {
      code: "RISK_INPUT_INVALID",
      status: 400,
    });
  }
  return text;
}

function optionalText(value, field, maxLength = 191) {
  if (value == null || String(value).trim() === "") return null;
  return requiredText(value, field, maxLength);
}

function normalizeCode(value, field, maxLength = 100) {
  const code = requiredText(value, field, maxLength).toUpperCase().replace(/[^A-Z0-9_:-]+/g, "_");
  if (!code) throw new RiskEngineError(`${field} no es válido.`, { code: "RISK_INPUT_INVALID", status: 400 });
  return code;
}

function asDate(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === "")) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RiskEngineError(`${field} no es una fecha válida.`, { code: "RISK_INPUT_INVALID", status: 400 });
  }
  return date;
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function jsonParameter(value) {
  return JSON.stringify(value ?? null);
}

function assertDatabase(db) {
  if (!db?.$queryRaw || !db?.$executeRaw) {
    throw new RiskEngineError("Se requiere un cliente o transacción Prisma.", { code: "RISK_DATABASE_INVALID" });
  }
}

async function resolveActor(db, context, { permission, allowSystem = false } = {}) {
  assertDatabase(db);
  const tenantId = requiredText(context?.tenantId, "context.tenantId");
  const tenantRows = await db.$queryRaw(Prisma.sql`
    SELECT "id", "status"::text AS "status" FROM "osi"."tenants"
    WHERE "id" = ${tenantId} LIMIT 1
  `);
  if (!tenantRows[0] || String(tenantRows[0].status).toUpperCase() !== "ACTIVE") {
    throw new RiskEngineError("Empresa activa no disponible.", { code: "RISK_TENANT_NOT_FOUND", status: 403 });
  }
  if (String(context?.actorKind || "MEMBERSHIP").toUpperCase() === "SYSTEM") {
    if (!allowSystem) throw new RiskEngineError("Se requiere una membresía activa.", { code: "RISK_FORBIDDEN", status: 403 });
    return { tenantId, actorKind: "SYSTEM", userId: null, membershipId: null, role: "SYSTEM", hasPermission: true };
  }
  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId");
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT m."id", m."tenant_id", m."user_id", m."role"::text AS "role",
      m."status"::text AS "membership_status", m."granted_permissions", m."denied_permissions",
      u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId} AND m."id" = ${membershipId} LIMIT 1
  `);
  const membership = rows[0];
  if (!membership) throw new RiskEngineError("Recurso no encontrado.", { code: "RISK_NOT_FOUND", status: 404 });
  if (String(membership.membership_status).toUpperCase() !== "ACTIVE" || String(membership.user_status).toUpperCase() !== "ACTIVE") {
    throw new RiskEngineError("La identidad empresarial no está activa.", { code: "RISK_ACTOR_INACTIVE", status: 403 });
  }
  const granted = new Set([
    ...(Array.isArray(context?.permissions) ? context.permissions : []),
    ...(Array.isArray(membership.granted_permissions) ? membership.granted_permissions : []),
  ].map(String));
  const denied = new Set([
    ...(Array.isArray(context?.deniedPermissions) ? context.deniedPermissions : []),
    ...(Array.isArray(membership.denied_permissions) ? membership.denied_permissions : []),
  ].map(String));
  return {
    tenantId,
    actorKind: "MEMBERSHIP",
    userId: membership.user_id,
    membershipId: membership.id,
    role: String(membership.role),
    hasPermission: !permission || (granted.has(permission) && !denied.has(permission)),
  };
}

function requirePermission(actor, permission) {
  if (!actor.hasPermission) {
    throw new RiskEngineError(`Permiso requerido: ${permission}.`, { code: "RISK_FORBIDDEN", status: 403 });
  }
}

function auditContext(actor) {
  return actor.actorKind === "SYSTEM"
    ? { tenantId: actor.tenantId, actorKind: "SYSTEM" }
    : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

async function auditedAccessRejection(tx, actor, { action, entity, entityId, requestId, permission }) {
  await appendCommercialAudit(tx, auditContext(actor), {
    action, entity, entityId: entityId || "UNRESOLVED", source: "DB01F_RISK_ENGINE",
    requestId, critical: true, metadataJson: { permission, rejectionCode: "RISK_FORBIDDEN" },
  });
  return { rejected: new RiskEngineError("No tiene autorización para esta operación.", { code: "RISK_FORBIDDEN", status: 403 }) };
}

function unwrapRiskResult(result) {
  if (result?.rejected) throw result.rejected;
  return result;
}

function normalizeCondition(typeValue, rawConfig) {
  const type = normalizeCode(typeValue, "conditionType", 60);
  if (!RISK_CONDITION_TYPES.includes(type)) {
    throw new RiskEngineError("Tipo de condición no soportado.", { code: "RISK_CONDITION_UNSUPPORTED", status: 400 });
  }
  const config = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig) ? rawConfig : {};
  if (type === "DISTANCE_OVER_KM") {
    const field = requiredText(config.field, "conditionConfig.field", 40);
    const thresholdKm = Number(config.thresholdKm);
    if (!ALLOWED_DISTANCE_FIELDS.has(field) || !Number.isFinite(thresholdKm) || thresholdKm <= 0) {
      throw new RiskEngineError("La condición de distancia requiere campo permitido y thresholdKm > 0.", { code: "RISK_CONDITION_INVALID", status: 400 });
    }
    return { type, config: { field, operator: "GT", thresholdKm } };
  }
  if (type === "REGION_IN_SET") {
    const fields = [...new Set((Array.isArray(config.fields) ? config.fields : []).map(String))].sort();
    const regionCodes = [...new Set((Array.isArray(config.regionCodes) ? config.regionCodes : [])
      .map((item) => String(item).trim().toUpperCase()).filter(Boolean))].sort();
    if (!fields.length || fields.some((field) => !ALLOWED_REGION_FIELDS.has(field)) || !regionCodes.length) {
      throw new RiskEngineError("La condición regional requiere fields y regionCodes válidos.", { code: "RISK_CONDITION_INVALID", status: 400 });
    }
    return { type, config: { fields, regionCodes } };
  }
  if (type === "LOGISTIC_FLAG_PRESENT") {
    const flags = [...new Set((Array.isArray(config.flags) ? config.flags : [])
      .map((item) => String(item).trim().toUpperCase()).filter(Boolean))].sort();
    if (!flags.length || flags.some((flag) => !ALLOWED_FLAGS.has(flag))) {
      throw new RiskEngineError("La condición de flags contiene valores no reconocidos.", { code: "RISK_CONDITION_INVALID", status: 400 });
    }
    return { type, config: { flags, match: config.match === "ALL" ? "ALL" : "ANY" } };
  }
  const minimumPercent = Number(config.minimumPercent);
  if (!Number.isFinite(minimumPercent) || minimumPercent < -100 || minimumPercent > 100) {
    throw new RiskEngineError("minimumPercent debe estar entre -100 y 100.", { code: "RISK_CONDITION_INVALID", status: 400 });
  }
  return { type, config: { field: "marginPercent", operator: "LT", minimumPercent } };
}

function mapRule(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, code: row.code, version: row.version, name: row.name,
    description: row.description, priority: row.priority, conditionType: row.condition_type,
    conditionConfig: row.condition_config_json, conditionScopeHash: row.condition_scope_hash,
    result: row.result, state: row.state, validFrom: row.valid_from, validTo: row.valid_to,
    versionHash: row.version_hash, replacesRuleId: row.replaces_rule_id,
    createdByMembershipId: row.created_by_membership_id, approvedByMembershipId: row.approved_by_membership_id,
    approvedAt: row.approved_at, activatedAt: row.activated_at, retiredAt: row.retired_at,
    requestId: row.request_id, rowVersion: row.row_version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapEvaluation(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, entity: row.entity, entityId: row.entity_id,
    caseId: row.case_id, quoteId: row.quote_id, quoteVersion: row.quote_version,
    materialHash: row.material_hash, inputSnapshot: row.input_snapshot_json,
    rulesSnapshot: row.rules_snapshot_json, rulesetHash: row.ruleset_hash,
    matchedRules: row.matched_rules_json, factors: row.factors_json, reasons: row.reasons_json,
    result: row.result, mode: row.mode, evaluatedAt: row.evaluated_at, requestId: row.request_id,
    actorMembershipId: row.actor_membership_id, approvalRequestId: row.approval_request_id,
  };
}

function ruleSnapshot(row) {
  return { id: row.id, code: row.code, version: row.version, hash: row.version_hash, result: row.result, state: row.state };
}

export async function createRiskRule(prisma, context, input) {
  const result = normalizeCode(input?.result, "result", 40);
  if (!RISK_RESULTS.includes(result)) throw new RiskEngineError("Resultado de regla inválido.", { code: "RISK_INPUT_INVALID", status: 400 });
  const code = normalizeCode(input?.code, "code");
  const name = requiredText(input?.name, "name", 180);
  const description = optionalText(input?.description, "description", 10_000);
  const priority = Number(input?.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100000) throw new RiskEngineError("priority inválida.", { code: "RISK_INPUT_INVALID", status: 400 });
  const condition = normalizeCondition(input?.conditionType, input?.conditionConfig);
  const validFrom = asDate(input?.validFrom, "validFrom", { optional: true });
  const validTo = asDate(input?.validTo, "validTo", { optional: true });
  if (validFrom && validTo && validTo <= validFrom) throw new RiskEngineError("Rango de vigencia inválido.", { code: "RISK_INPUT_INVALID", status: 400 });
  const requestId = requiredText(input?.requestId, "requestId");

  const outcome = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission: RISK_PERMISSIONS.MANAGE });
    if (!actor.hasPermission) return auditedAccessRejection(tx, actor, {
      action: "RISK_RULE_CREATE_UNAUTHORIZED", entity: "RISK_ENGINE_RULE", requestId,
      permission: RISK_PERMISSIONS.MANAGE,
    });
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${code}`}, 0))`);
    const existingRequest = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."risk_engine_rules" WHERE "tenant_id" = ${actor.tenantId} AND "request_id" = ${requestId} LIMIT 1
    `);
    if (existingRequest[0]) {
      const priorRequest = existingRequest[0];
      const sameInput = priorRequest.code === code && priorRequest.name === name &&
        (priorRequest.description || null) === description && Number(priorRequest.priority) === priority &&
        priorRequest.condition_type === condition.type &&
        canonicalJson(priorRequest.condition_config_json) === canonicalJson(condition.config) &&
        priorRequest.result === result &&
        (priorRequest.valid_from ? new Date(priorRequest.valid_from).toISOString() : null) === (validFrom?.toISOString() || null) &&
        (priorRequest.valid_to ? new Date(priorRequest.valid_to).toISOString() : null) === (validTo?.toISOString() || null);
      if (!sameInput) {
        await appendCommercialAudit(tx, auditContext(actor), {
          action: "RISK_RULE_IDEMPOTENCY_CONFLICT", entity: "RISK_ENGINE_RULE", entityId: priorRequest.id,
          source: "DB01F_RISK_ENGINE", requestId, critical: true,
          metadataJson: { code, existingVersion: priorRequest.version },
        });
        return { rejected: new RiskEngineError("requestId reutilizado con otro contenido.", { code: "RISK_IDEMPOTENCY_CONFLICT", status: 409 }) };
      }
      return { rule: mapRule(priorRequest), idempotent: true };
    }
    const previous = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."risk_engine_rules" WHERE "tenant_id" = ${actor.tenantId} AND "code" = ${code}
      ORDER BY "version" DESC LIMIT 1
    `);
    const version = Number(previous[0]?.version || 0) + 1;
    const replacesRuleId = previous[0]?.id || null;
    const content = { code, version, name, description, priority, condition, result, validFrom: validFrom?.toISOString() || null, validTo: validTo?.toISOString() || null, replacesRuleId };
    const payloadHash = sha256(canonicalJson(content));
    const conditionScopeHash = sha256(canonicalJson(condition));
    const versionHash = sha256(canonicalJson({ tenantId: actor.tenantId, ...content }));
    const id = randomUUID();
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."risk_engine_rules" (
        "id", "tenant_id", "code", "version", "name", "description", "priority",
        "condition_type", "condition_config_json", "condition_scope_hash", "result",
        "valid_from", "valid_to", "version_hash", "replaces_rule_id",
        "created_by_user_id", "created_by_membership_id", "request_id", "payload_hash"
      ) VALUES (
        ${id}, ${actor.tenantId}, ${code}, ${version}, ${name}, ${description}, ${priority},
        CAST(${condition.type} AS "osi"."RiskRuleConditionType"), CAST(${jsonParameter(condition.config)} AS jsonb),
        ${conditionScopeHash}, CAST(${result} AS "osi"."RiskDecisionResult"), ${validFrom}, ${validTo},
        ${versionHash}, ${replacesRuleId}, ${actor.userId}, ${actor.membershipId}, ${requestId}, ${payloadHash}
      ) RETURNING *
    `);
    await appendCommercialAudit(tx, auditContext(actor), {
      action: version === 1 ? "RISK_RULE_CREATED" : "RISK_RULE_VERSION_CREATED",
      entity: "RISK_ENGINE_RULE", entityId: id, source: "DB01F_RISK_ENGINE", requestId,
      critical: true, afterJson: ruleSnapshot(rows[0]), metadataJson: { replacesRuleId, conditionType: condition.type },
    });
    return { rule: mapRule(rows[0]), idempotent: false };
  }, { isolationLevel: "Serializable" });
  return unwrapRiskResult(outcome);
}

async function transitionRule(prisma, context, input, { permission, fromStates, toState, action, requireApproval = false }) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission });
    const id = requiredText(input?.id, "id");
    const expectedVersion = Number(input?.expectedVersion);
    const requestId = requiredText(input?.requestId, "requestId");
    if (!actor.hasPermission) return auditedAccessRejection(tx, actor, {
      action: `${action}_UNAUTHORIZED`, entity: "RISK_ENGINE_RULE", entityId: id, requestId, permission,
    });
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new RiskEngineError("expectedVersion inválida.", { code: "RISK_INPUT_INVALID", status: 400 });
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${id}`}, 0))`);
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."risk_engine_rules" WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} LIMIT 1`);
    const row = rows[0];
    if (!row) throw new RiskEngineError("Regla no encontrada.", { code: "RISK_NOT_FOUND", status: 404 });
    if (!fromStates.includes(String(row.state))) throw new RiskEngineError("Transición de estado inválida.", { code: "RISK_STATE_CONFLICT", status: 409 });
    if (requireApproval && !row.approved_at) throw new RiskEngineError("La versión debe estar aprobada antes de activarse.", { code: "RISK_RULE_NOT_APPROVED", status: 409 });
    if (toState === "ACTIVE") {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:ACTIVE:${row.condition_scope_hash}`}, 0))`);
      const conflicts = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "code" FROM "osi"."risk_engine_rules"
        WHERE "tenant_id" = ${actor.tenantId} AND "state" = 'ACTIVE'
          AND ("code" = ${row.code} OR "condition_scope_hash" = ${row.condition_scope_hash})
          AND "id" <> ${id} LIMIT 1
      `);
      if (conflicts[0]) {
        await appendCommercialAudit(tx, auditContext(actor), {
          action: "RISK_RULE_ACTIVATION_CONFLICT", entity: "RISK_ENGINE_RULE", entityId: id,
          source: "DB01F_RISK_ENGINE", requestId, critical: true,
          metadataJson: { conflictingRuleId: conflicts[0].id, code: conflicts[0].code },
        });
        return { rejected: new RiskEngineError("Existe una versión activa incompatible.", { code: "RISK_ACTIVE_CONFLICT", status: 409 }) };
      }
    }
    const stateTimeColumn = toState === "ACTIVE" ? Prisma.sql`"activated_at" = CURRENT_TIMESTAMP,` : toState === "RETIRED" ? Prisma.sql`"retired_at" = CURRENT_TIMESTAMP,` : Prisma.empty;
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."risk_engine_rules" SET "state" = CAST(${toState} AS "osi"."RiskRuleState"),
        ${stateTimeColumn} "row_version" = "row_version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} AND "row_version" = ${expectedVersion}
      RETURNING *
    `);
    if (!updated[0]) throw new RiskEngineError("La regla cambió; vuelva a cargarla.", { code: "RISK_VERSION_CONFLICT", status: 409 });
    await appendCommercialAudit(tx, auditContext(actor), {
      action, entity: "RISK_ENGINE_RULE", entityId: id, source: "DB01F_RISK_ENGINE",
      requestId, critical: true, beforeJson: ruleSnapshot(row), afterJson: ruleSnapshot(updated[0]),
    });
    return { rule: mapRule(updated[0]) };
  }, { isolationLevel: "Serializable" }).then((result) => {
    return unwrapRiskResult(result);
  });
}

export function startRiskRuleShadow(prisma, context, input) {
  return transitionRule(prisma, context, input, {
    permission: RISK_PERMISSIONS.MANAGE, fromStates: ["DRAFT"], toState: "SHADOW", action: "RISK_RULE_SHADOW_STARTED",
  });
}

export async function approveRiskRule(prisma, context, input) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission: RISK_PERMISSIONS.APPROVE });
    requirePermission(actor, RISK_PERMISSIONS.APPROVE);
    const id = requiredText(input?.id, "id");
    const expectedVersion = Number(input?.expectedVersion);
    const requestId = requiredText(input?.requestId, "requestId");
    const current = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."risk_engine_rules" WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} LIMIT 1`))[0];
    if (!current) throw new RiskEngineError("Regla no encontrada.", { code: "RISK_NOT_FOUND", status: 404 });
    if (!new Set(["DRAFT", "SHADOW"]).has(String(current.state))) throw new RiskEngineError("Estado no aprobable.", { code: "RISK_STATE_CONFLICT", status: 409 });
    if (current.created_by_membership_id === actor.membershipId) throw new RiskEngineError("El creador no puede aprobar su propia regla.", { code: "RISK_SEPARATION_OF_DUTIES", status: 403 });
    const rows = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."risk_engine_rules" SET "approved_by_user_id" = ${actor.userId},
        "approved_by_membership_id" = ${actor.membershipId}, "approved_at" = CURRENT_TIMESTAMP,
        "row_version" = "row_version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${actor.tenantId} AND "id" = ${id} AND "row_version" = ${expectedVersion}
        AND "approved_at" IS NULL RETURNING *
    `);
    if (!rows[0]) throw new RiskEngineError("Conflicto al aprobar la regla.", { code: "RISK_VERSION_CONFLICT", status: 409 });
    await appendCommercialAudit(tx, auditContext(actor), {
      action: "RISK_RULE_APPROVED", entity: "RISK_ENGINE_RULE", entityId: id,
      source: "DB01F_RISK_ENGINE", requestId, critical: true,
      beforeJson: ruleSnapshot(current), afterJson: ruleSnapshot(rows[0]),
    });
    return { rule: mapRule(rows[0]) };
  }, { isolationLevel: "Serializable" });
}

export function activateRiskRule(prisma, context, input) {
  return transitionRule(prisma, context, input, {
    permission: RISK_PERMISSIONS.ACTIVATE, fromStates: ["SHADOW"], toState: "ACTIVE",
    action: "RISK_RULE_ACTIVATED", requireApproval: true,
  });
}

export function retireRiskRule(prisma, context, input) {
  return transitionRule(prisma, context, input, {
    permission: RISK_PERMISSIONS.RETIRE, fromStates: ["DRAFT", "SHADOW", "ACTIVE"], toState: "RETIRED",
    action: "RISK_RULE_RETIRED",
  });
}

export async function getRiskEngineMode(db, context) {
  const actor = await resolveActor(db, context, { permission: RISK_PERMISSIONS.VIEW, allowSystem: true });
  if (actor.actorKind !== "SYSTEM") requirePermission(actor, RISK_PERMISSIONS.VIEW);
  const rows = await db.$queryRaw(Prisma.sql`SELECT "mode"::text AS "mode", "version" FROM "osi"."risk_engine_settings" WHERE "tenant_id" = ${actor.tenantId} LIMIT 1`);
  return rows[0] || { mode: "LEGACY_ONLY", version: 0 };
}

export async function setRiskEngineMode(prisma, context, input) {
  const mode = normalizeCode(input?.mode, "mode", 30);
  if (!RISK_OPERATION_MODES.includes(mode)) throw new RiskEngineError("Modo inválido.", { code: "RISK_INPUT_INVALID", status: 400 });
  if (mode === "ENFORCED") throw new RiskEngineError("ENFORCED no está habilitado en DB-01F.", { code: "RISK_ENFORCEMENT_DISABLED", status: 409 });
  const requestId = requiredText(input?.requestId, "requestId");
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission: RISK_PERMISSIONS.CHANGE_MODE });
    requirePermission(actor, RISK_PERMISSIONS.CHANGE_MODE);
    const before = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."risk_engine_settings" WHERE "tenant_id" = ${actor.tenantId} LIMIT 1`))[0] || null;
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."risk_engine_settings" ("tenant_id", "mode", "updated_by_user_id", "updated_by_membership_id")
      VALUES (${actor.tenantId}, CAST(${mode} AS "osi"."RiskEngineOperationMode"), ${actor.userId}, ${actor.membershipId})
      ON CONFLICT ("tenant_id") DO UPDATE SET "mode" = EXCLUDED."mode", "version" = "risk_engine_settings"."version" + 1,
        "updated_by_user_id" = EXCLUDED."updated_by_user_id", "updated_by_membership_id" = EXCLUDED."updated_by_membership_id",
        "updated_at" = CURRENT_TIMESTAMP RETURNING *
    `);
    await appendCommercialAudit(tx, auditContext(actor), {
      action: "RISK_ENGINE_MODE_CHANGED", entity: "RISK_ENGINE_SETTINGS", entityId: actor.tenantId,
      source: "DB01F_RISK_ENGINE", requestId, critical: true,
      beforeJson: before && { mode: before.mode, version: before.version }, afterJson: { mode: rows[0].mode, version: rows[0].version },
    });
    return { mode: rows[0].mode, version: rows[0].version };
  });
}

function evaluateCondition(rule, snapshot) {
  const config = rule.condition_config_json || {};
  if (rule.condition_type === "DISTANCE_OVER_KM") {
    const actual = Number(snapshot?.[config.field]);
    const matched = Number.isFinite(actual) && actual > Number(config.thresholdKm);
    return { matched, factors: { field: config.field, actual, thresholdKm: Number(config.thresholdKm) }, reason: matched ? `${config.field} ${actual} km supera ${config.thresholdKm} km.` : null };
  }
  if (rule.condition_type === "REGION_IN_SET") {
    const values = config.fields.map((field) => String(snapshot?.[field] || "").trim().toUpperCase()).filter(Boolean);
    const matchedValues = values.filter((value) => config.regionCodes.includes(value));
    return { matched: matchedValues.length > 0, factors: { fields: config.fields, values, matchedValues }, reason: matchedValues.length ? `Región de riesgo: ${matchedValues.join(", ")}.` : null };
  }
  if (rule.condition_type === "LOGISTIC_FLAG_PRESENT") {
    const flags = new Set((Array.isArray(snapshot?.flags) ? snapshot.flags : []).map((item) => String(item).toUpperCase()));
    const found = config.flags.filter((flag) => flags.has(flag));
    const matched = config.match === "ALL" ? found.length === config.flags.length : found.length > 0;
    return { matched, factors: { requiredFlags: config.flags, found }, reason: matched ? `Señal logística: ${found.join(", ")}.` : null };
  }
  const actual = Number(snapshot?.marginPercent);
  const matched = Number.isFinite(actual) && actual < Number(config.minimumPercent);
  return { matched, factors: { field: "marginPercent", actual, minimumPercent: Number(config.minimumPercent) }, reason: matched ? `Margen ${actual}% inferior al mínimo ${config.minimumPercent}%.` : null };
}

function maxResult(items) {
  const severity = { PASS: 0, REVIEW_REQUIRED: 1, BLOCKED: 2 };
  return items.reduce((best, item) => severity[item.result] > severity[best] ? item.result : best, "PASS");
}

export async function evaluateRisk(prisma, context, input) {
  const entity = normalizeCode(input?.entity, "entity", 120);
  const entityId = requiredText(input?.entityId, "entityId");
  const caseId = optionalText(input?.caseId, "caseId");
  const quoteId = optionalText(input?.quoteId, "quoteId");
  const quoteVersion = input?.quoteVersion == null ? null : Number(input.quoteVersion);
  if (quoteVersion != null && (!Number.isInteger(quoteVersion) || quoteVersion < 1)) throw new RiskEngineError("quoteVersion inválida.", { code: "RISK_INPUT_INVALID", status: 400 });
  const requestId = requiredText(input?.requestId, "requestId");
  const snapshot = sanitizeCommercialAuditJson(input?.snapshot || {});
  const approvalRequestId = optionalText(input?.approvalRequestId, "approvalRequestId");

  const result = await prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, context, { permission: RISK_PERMISSIONS.EVALUATE, allowSystem: true });
    if (actor.actorKind !== "SYSTEM") requirePermission(actor, RISK_PERMISSIONS.EVALUATE);
    const setting = (await tx.$queryRaw(Prisma.sql`SELECT "mode"::text AS "mode" FROM "osi"."risk_engine_settings" WHERE "tenant_id" = ${actor.tenantId} LIMIT 1`))[0];
    const operationMode = String(setting?.mode || "LEGACY_ONLY");
    if (operationMode === "LEGACY_ONLY") return { persisted: false, operationMode, result: "PASS", blocking: false };
    if (operationMode === "ENFORCED") throw new RiskEngineError("ENFORCED no está habilitado en DB-01F.", { code: "RISK_ENFORCEMENT_DISABLED", status: 409 });
    const materialHash = sha256(canonicalJson({ entity, entityId, caseId, quoteId, quoteVersion, snapshot }));
    const payloadHash = sha256(canonicalJson({ entity, entityId, caseId, quoteId, quoteVersion, materialHash, approvalRequestId, mode: "SHADOW" }));
    const prior = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."risk_evaluations" WHERE "tenant_id" = ${actor.tenantId} AND "request_id" = ${requestId} LIMIT 1`))[0];
    if (prior) {
      if (prior.payload_hash !== payloadHash) {
        await appendCommercialAudit(tx, auditContext(actor), {
          action: "RISK_EVALUATION_IDEMPOTENCY_CONFLICT", entity, entityId,
          source: "DB01F_RISK_ENGINE", requestId, critical: true,
          metadataJson: { existingEvaluationId: prior.id },
        });
        return { rejected: new RiskEngineError("requestId reutilizado con otra evaluación.", { code: "RISK_IDEMPOTENCY_CONFLICT", status: 409 }) };
      }
      return { evaluation: mapEvaluation(prior), idempotent: true, persisted: true, blocking: false };
    }
    const rules = await tx.$queryRaw(Prisma.sql`
      SELECT DISTINCT ON ("code") * FROM "osi"."risk_engine_rules"
      WHERE "tenant_id" = ${actor.tenantId} AND "state" IN ('SHADOW', 'ACTIVE')
        AND ("valid_from" IS NULL OR "valid_from" <= CURRENT_TIMESTAMP)
        AND ("valid_to" IS NULL OR "valid_to" > CURRENT_TIMESTAMP)
      ORDER BY "code", CASE "state" WHEN 'SHADOW' THEN 0 ELSE 1 END, "version" DESC
    `);
    rules.sort((a, b) => Number(a.priority) - Number(b.priority) || String(a.code).localeCompare(String(b.code)));
    const evaluated = rules.map((rule) => ({ rule, ...evaluateCondition(rule, snapshot) }));
    const matched = evaluated.filter((item) => item.matched);
    const finalResult = maxResult(matched.map((item) => ({ result: String(item.rule.result) })));
    const rulesSnapshot = rules.map(ruleSnapshot);
    const rulesetHash = sha256(canonicalJson(rulesSnapshot));
    const matchedRules = matched.map((item) => ({ ...ruleSnapshot(item.rule), factors: item.factors, reason: item.reason }));
    const factors = matched.map((item) => ({ ruleCode: item.rule.code, ...item.factors }));
    const reasons = matched.map((item) => item.reason).filter(Boolean);
    const id = randomUUID();
    const inserted = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."risk_evaluations" (
        "id", "tenant_id", "entity", "entity_id", "case_id", "quote_id", "quote_version", "material_hash",
        "input_snapshot_json", "rules_snapshot_json", "ruleset_hash", "matched_rules_json", "factors_json", "reasons_json",
        "result", "mode", "request_id", "payload_hash", "actor_user_id", "actor_membership_id", "approval_request_id"
      ) VALUES (
        ${id}, ${actor.tenantId}, ${entity}, ${entityId}, ${caseId}, ${quoteId}, ${quoteVersion}, ${materialHash},
        CAST(${jsonParameter(snapshot)} AS jsonb), CAST(${jsonParameter(rulesSnapshot)} AS jsonb), ${rulesetHash},
        CAST(${jsonParameter(matchedRules)} AS jsonb), CAST(${jsonParameter(factors)} AS jsonb), CAST(${jsonParameter(reasons)} AS jsonb),
        CAST(${finalResult} AS "osi"."RiskDecisionResult"), 'SHADOW', ${requestId}, ${payloadHash},
        ${actor.userId}, ${actor.membershipId}, ${approvalRequestId}
      ) RETURNING *
    `);
    for (const item of evaluated) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."risk_evaluation_rules" (
          "tenant_id", "evaluation_id", "rule_id", "rule_code", "rule_version", "rule_hash", "matched", "result", "reasons_json"
        ) VALUES (
          ${actor.tenantId}, ${id}, ${item.rule.id}, ${item.rule.code}, ${item.rule.version}, ${item.rule.version_hash},
          ${item.matched}, CAST(${String(item.rule.result)} AS "osi"."RiskDecisionResult"),
          CAST(${jsonParameter(item.reason ? [item.reason] : [])} AS jsonb)
        )
      `);
    }
    await appendCommercialAudit(tx, auditContext(actor), {
      action: "RISK_EVALUATION_EXECUTED", entity, entityId, source: "DB01F_RISK_ENGINE",
      requestId, critical: true,
      afterJson: { evaluationId: id, result: finalResult, mode: "SHADOW", rulesetHash },
      metadataJson: { matchedRuleCount: matched.length, wouldBlock: finalResult === "BLOCKED" },
    });
    return { evaluation: mapEvaluation(inserted[0]), idempotent: false, persisted: true, blocking: false, wouldBlock: finalResult === "BLOCKED" };
  }, { isolationLevel: "RepeatableRead" });
  return unwrapRiskResult(result);
}

export const __riskEngineInternals = Object.freeze({
  canonicalJson,
  sha256,
  normalizeCondition,
  evaluateCondition,
  maxResult,
  allowedFlags: [...ALLOWED_FLAGS],
});
