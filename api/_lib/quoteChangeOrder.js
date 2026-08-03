import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createApprovalRequestInTransaction,
  decideApprovalRequestInTransaction,
  unwrapApprovalRequestTransactionResult,
} from "./approvalRequest.js";
import { appendCommercialAudit, sanitizeCommercialAuditJson } from "./commercialAuditLog.js";
import { evaluateRisk } from "./riskEngine.js";
import { validateLogisticOverride } from "./logisticOverrideApproval.js";

export const CHANGE_ORDER_PERMISSIONS = Object.freeze({
  VIEW: "change_order:view",
  BIND_SUBJECT: "change_order:subject:bind",
  POLICY_MANAGE: "change_order:policy:manage",
  CREATE: "change_order:create",
  SUBMIT: "change_order:submit",
  DECIDE: "change_order:decide",
  SEND_CUSTOMER: "change_order:customer:send",
  CUSTOMER_DECISION: "change_order:customer:decision",
  CANCEL: "change_order:cancel",
  EXPIRE: "change_order:expire",
  EXECUTE: "change_order:execute",
  REVISE: "change_order:revise",
  AUTO_APPROVE: "change_order:auto_approve",
});

export const CHANGE_ORDER_STATUSES = Object.freeze([
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "PENDING_CUSTOMER", "ACCEPTED",
  "EXECUTED", "REJECTED", "CANCELLED", "EXPIRED", "SUPERSEDED",
]);
export const CHANGE_ORDER_TERMINAL = new Set(["EXECUTED", "REJECTED", "CANCELLED", "EXPIRED", "SUPERSEDED"]);
export const CHANGE_ORDER_RISK_FACTORS = new Set([
  "distance", "route", "service", "volume", "weight", "logistic_cost", "margin", "special_conditions",
]);

const MAX_PAGE_SIZE = 100;
const DEFAULT_POLICY_CODE = "ADDENDUM_CAP";

export class QuoteChangeOrderError extends Error {
  constructor(message, { code = "QUOTE_CHANGE_ORDER_ERROR", status = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "QuoteChangeOrderError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, max = 191) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) {
    throw new QuoteChangeOrderError(`${field} es obligatorio y admite hasta ${max} caracteres.`, {
      code: "CHANGE_ORDER_INPUT_INVALID", status: 400,
    });
  }
  return text;
}

function optionalText(value, field, max = 191) {
  if (value == null || String(value).trim() === "") return null;
  return requiredText(value, field, max);
}

function code(value, field, max = 120) {
  return requiredText(value, field, max).toUpperCase().replace(/[^A-Z0-9_:-]+/g, "_");
}

function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Prisma.Decimal.isDecimal(value)) return JSON.stringify(value.toFixed());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function decimal(value, field, scale = 2) {
  let result;
  try {
    result = new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(scale);
  } catch {
    throw new QuoteChangeOrderError(`${field} no es un decimal válido.`, { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  }
  if (!result.isFinite()) throw new QuoteChangeOrderError(`${field} no es un decimal válido.`, { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  return result;
}

function asDate(value, field, optional = true) {
  if (optional && (value == null || value === "")) return null;
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new QuoteChangeOrderError(`${field} no es una fecha válida.`, { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  return result;
}

function assertDb(db) {
  if (!db?.$queryRaw || !db?.$executeRaw) throw new QuoteChangeOrderError("Se requiere Prisma.", { code: "CHANGE_ORDER_DATABASE_INVALID" });
}

async function resolveActor(db, context, permission, { allowSystem = false } = {}) {
  assertDb(db);
  const tenantId = requiredText(context?.tenantId, "context.tenantId");
  const tenant = (await db.$queryRaw(Prisma.sql`
    SELECT "id", "status"::text AS "status" FROM "osi"."tenants" WHERE "id"=${tenantId} LIMIT 1
  `))[0];
  if (!tenant || tenant.status !== "ACTIVE") throw new QuoteChangeOrderError("Empresa activa no disponible.", { code: "CHANGE_ORDER_TENANT_NOT_FOUND", status: 403 });
  if (String(context?.actorKind || "MEMBERSHIP").toUpperCase() === "SYSTEM") {
    if (!allowSystem) throw new QuoteChangeOrderError("Se requiere membresía activa.", { code: "CHANGE_ORDER_FORBIDDEN", status: 403 });
    return { tenantId, kind: "SYSTEM", userId: null, membershipId: null, role: "SYSTEM", permissions: new Set([permission]) };
  }
  const membershipId = requiredText(context?.actorMembershipId, "context.actorMembershipId");
  const member = (await db.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",m."status"::text AS "membership_status",
      m."granted_permissions",m."denied_permissions",u."status" AS "user_status"
    FROM "osi"."tenant_memberships" m JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} LIMIT 1
  `))[0];
  if (!member) throw new QuoteChangeOrderError("Recurso no encontrado.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
  if (member.membership_status !== "ACTIVE" || String(member.user_status).toUpperCase() !== "ACTIVE") {
    throw new QuoteChangeOrderError("Membresía inactiva.", { code: "CHANGE_ORDER_ACTOR_INACTIVE", status: 403 });
  }
  const denied = new Set((member.denied_permissions || []).map(String));
  const permissions = new Set((member.granted_permissions || []).map(String).filter((item) => !denied.has(item)));
  if (permission && !permissions.has(permission)) throw new QuoteChangeOrderError(`Permiso requerido: ${permission}.`, { code: "CHANGE_ORDER_FORBIDDEN", status: 403 });
  return { tenantId, kind: "MEMBERSHIP", userId: member.user_id, membershipId: member.id, role: member.role, permissions };
}

function auditContext(actor) {
  return actor.kind === "SYSTEM"
    ? { tenantId: actor.tenantId, actorKind: "SYSTEM" }
    : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

function mapOrder(row, items = []) {
  if (!row) return null;
  const moneyFields = ["previous_subtotal", "increment_amount", "reduction_amount", "tax_amount", "previous_total", "new_total", "variation_amount", "variation_percent", "cap_amount", "cumulative_increase"];
  const mapped = { ...row };
  for (const field of moneyFields) if (mapped[field] != null) mapped[field] = String(mapped[field]);
  if (mapped.sequence_number != null) mapped.sequence_number = String(mapped.sequence_number);
  mapped.items = items.map((item) => {
    const next = { ...item };
    for (const field of ["previous_quantity", "new_quantity", "previous_unit_price", "new_unit_price", "previous_line_total", "new_line_total"]) {
      if (next[field] != null) next[field] = String(next[field]);
    }
    return next;
  });
  return mapped;
}

async function findOrder(db, tenantId, id, { lock = false } = {}) {
  const rows = lock
    ? await db.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_orders" WHERE "tenant_id"=${tenantId} AND "id"=${id} LIMIT 1 FOR UPDATE`)
    : await db.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_orders" WHERE "tenant_id"=${tenantId} AND "id"=${id} LIMIT 1`);
  if (!rows[0]) return null;
  const items = await db.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_order_items" WHERE "tenant_id"=${tenantId} AND "change_order_id"=${id} ORDER BY "created_at","id"`);
  return mapOrder(rows[0], items);
}

async function commandReplay(db, tenantId, command, requestId, payloadHash) {
  const row = (await db.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."quote_change_order_commands" WHERE "tenant_id"=${tenantId} AND "request_id"=${requestId} LIMIT 1
  `))[0];
  if (!row) return null;
  if (row.command !== command || row.payload_hash !== payloadHash) {
    throw new QuoteChangeOrderError("requestId reutilizado con otro payload.", { code: "CHANGE_ORDER_IDEMPOTENCY_CONFLICT", status: 409 });
  }
  return { order: await findOrder(db, tenantId, row.change_order_id), idempotent: true };
}

async function recordCommand(tx, actor, order, command, requestId, payloadHash) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "osi"."quote_change_order_commands"(
      "id","tenant_id","change_order_id","change_order_version","command","request_id","payload_hash","result_json","actor_user_id","actor_membership_id"
    ) VALUES (
      ${randomUUID()},${actor.tenantId},${order.id},${Number(order.version)},${command},${requestId},${payloadHash},
      CAST(${json({ orderId: order.id, version: order.version, status: order.status })} AS jsonb),${actor.userId},${actor.membershipId}
    )
  `);
}

async function serializable(prisma, work, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code !== "P2034" || attempt >= attempts) throw error;
    }
  }
}

export async function bindQuoteChangeOrderSubject(prisma, context, input, options = {}) {
  const caseId = requiredText(input?.pipelineCaseId, "pipelineCaseId");
  const quoteId = requiredText(input?.baseQuoteId, "baseQuoteId");
  const requestId = requiredText(input?.requestId, "requestId");
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.BIND_SUBJECT);
    const quote = (await tx.$queryRaw(Prisma.sql`
      SELECT "id","caseId" FROM "osi"."osi_pipeline_case_quotes" WHERE "id"=${quoteId} AND "caseId"=${caseId} LIMIT 1
    `))[0];
    if (!quote) throw new QuoteChangeOrderError("Caso o cotización base no encontrados.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
    const byRequest = (await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."quote_change_order_subjects" WHERE "tenant_id"=${actor.tenantId} AND "binding_request_id"=${requestId} LIMIT 1
    `))[0];
    if (byRequest) {
      if (byRequest.pipeline_case_id !== caseId || byRequest.base_quote_id !== quoteId) throw new QuoteChangeOrderError("requestId de vinculación reutilizado.", { code: "CHANGE_ORDER_IDEMPOTENCY_CONFLICT", status: 409 });
      return { subject: byRequest, idempotent: true };
    }
    const existing = (await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."quote_change_order_subjects" WHERE "base_quote_id"=${quoteId} LIMIT 1
    `))[0];
    if (existing && existing.tenant_id !== actor.tenantId) throw new QuoteChangeOrderError("Recurso no encontrado.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
    if (existing) return { subject: existing, idempotent: true };
    const inserted = (await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_order_subjects"(
        "tenant_id","pipeline_case_id","base_quote_id","bound_by_user_id","bound_by_membership_id","binding_request_id"
      ) VALUES (${actor.tenantId},${caseId},${quoteId},${actor.userId},${actor.membershipId},${requestId}) RETURNING *
    `))[0];
    await auditWriter(tx, auditContext(actor), {
      action: "QUOTE_CHANGE_ORDER_SUBJECT_BOUND", entity: "QUOTE_CHANGE_ORDER_SUBJECT", entityId: quoteId,
      source: "DB01G_CHANGE_ORDER", requestId, critical: true, afterJson: inserted,
    });
    return { subject: inserted, idempotent: false };
  });
}

export async function createQuoteChangeOrderPolicy(prisma, context, input, options = {}) {
  const policyCode = code(input?.code || DEFAULT_POLICY_CODE, "code", 100);
  const name = requiredText(input?.name, "name", 180);
  const capPercent = decimal(input?.capPercent, "capPercent", 4);
  if (capPercent.lt(0) || capPercent.gt(100)) throw new QuoteChangeOrderError("capPercent debe estar entre 0 y 100.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const requestId = requiredText(input?.requestId, "requestId");
  const rules = sanitizeCommercialAuditJson(input?.approvalRules || {});
  const validFrom = asDate(input?.validFrom, "validFrom");
  const validTo = asDate(input?.validTo, "validTo");
  const activate = input?.activate === true;
  const payloadHash = sha256(canonicalJson({ policyCode, name, capPercent, rules, validFrom, validTo, activate }));
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.POLICY_MANAGE);
    const existing = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_order_policies" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`))[0];
    if (existing) {
      if (existing.policy_hash !== payloadHash) throw new QuoteChangeOrderError("requestId de política reutilizado.", { code: "CHANGE_ORDER_IDEMPOTENCY_CONFLICT", status: 409 });
      return { policy: existing, idempotent: true };
    }
    const max = (await tx.$queryRaw(Prisma.sql`SELECT COALESCE(MAX("version"),0)::int AS "version" FROM "osi"."quote_change_order_policies" WHERE "tenant_id"=${actor.tenantId} AND "code"=${policyCode}`))[0];
    const version = Number(max.version) + 1;
    if (activate) await tx.$executeRaw(Prisma.sql`UPDATE "osi"."quote_change_order_policies" SET "status"='RETIRED' WHERE "tenant_id"=${actor.tenantId} AND "code"=${policyCode} AND "status"='ACTIVE'`);
    const row = (await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_order_policies"(
        "id","tenant_id","code","version","name","status","cap_percent","approval_rules_json","valid_from","valid_to","policy_hash","created_by_user_id","created_by_membership_id","request_id"
      ) VALUES (
        ${randomUUID()},${actor.tenantId},${policyCode},${version},${name},CAST(${activate ? "ACTIVE" : "DRAFT"} AS "osi"."QuoteChangeOrderPolicyStatus"),
        ${capPercent},CAST(${json(rules)} AS jsonb),${validFrom},${validTo},${payloadHash},${actor.userId},${actor.membershipId},${requestId}
      ) RETURNING *
    `))[0];
    await auditWriter(tx, auditContext(actor), {
      action: "QUOTE_CHANGE_ORDER_POLICY_VERSION_CREATED", entity: "QUOTE_CHANGE_ORDER_POLICY", entityId: row.id,
      source: "DB01G_CHANGE_ORDER", requestId, critical: true, afterJson: row,
    });
    return { policy: row, idempotent: false };
  });
}

function normalizeItems(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) throw new QuoteChangeOrderError("Debe incluir al menos una partida.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const keys = new Set();
  return rows.map((raw, index) => {
    const kind = code(raw?.changeKind, `items[${index}].changeKind`, 20);
    if (!new Set(["ADDED", "MODIFIED", "REMOVED"]).has(kind)) throw new QuoteChangeOrderError("Tipo de cambio de partida no soportado.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
    const lineKey = requiredText(raw?.lineKey || `LINE-${index + 1}`, `items[${index}].lineKey`);
    if (keys.has(lineKey)) throw new QuoteChangeOrderError("lineKey duplicado.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
    keys.add(lineKey);
    const previousLineTotal = decimal(raw?.previousLineTotal, `items[${index}].previousLineTotal`);
    const newLineTotal = decimal(raw?.newLineTotal, `items[${index}].newLineTotal`);
    if (previousLineTotal.lt(0) || newLineTotal.lt(0) || (kind === "ADDED" && !previousLineTotal.isZero()) || (kind === "REMOVED" && !newLineTotal.isZero())) {
      throw new QuoteChangeOrderError("Los importes de la partida no corresponden con su tipo.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
    }
    return {
      id: randomUUID(), lineKey, kind,
      classification: code(raw?.classification || "SCOPE_ADDITION", `items[${index}].classification`),
      description: requiredText(raw?.description, `items[${index}].description`, 10_000),
      unit: optionalText(raw?.unit, `items[${index}].unit`, 40), sourceLineId: optionalText(raw?.sourceLineId, `items[${index}].sourceLineId`),
      previousQuantity: raw?.previousQuantity == null ? null : decimal(raw.previousQuantity, `items[${index}].previousQuantity`, 4),
      newQuantity: raw?.newQuantity == null ? null : decimal(raw.newQuantity, `items[${index}].newQuantity`, 4),
      previousUnitPrice: raw?.previousUnitPrice == null ? null : decimal(raw.previousUnitPrice, `items[${index}].previousUnitPrice`, 4),
      newUnitPrice: raw?.newUnitPrice == null ? null : decimal(raw.newUnitPrice, `items[${index}].newUnitPrice`, 4),
      previousLineTotal, newLineTotal,
      before: raw?.before == null ? null : sanitizeCommercialAuditJson(raw.before),
      after: raw?.after == null ? null : sanitizeCommercialAuditJson(raw.after),
    };
  });
}

function monetarySummary(items, input) {
  let increment = new Prisma.Decimal(0);
  let reduction = new Prisma.Decimal(0);
  for (const item of items) {
    const delta = item.newLineTotal.minus(item.previousLineTotal);
    if (delta.gt(0)) increment = increment.plus(delta);
    else reduction = reduction.plus(delta.abs());
  }
  const previousSubtotal = decimal(input?.previousSubtotal, "previousSubtotal");
  const previousTotal = decimal(input?.previousTotal, "previousTotal");
  const taxAmount = decimal(input?.taxAmount, "taxAmount");
  if ([previousSubtotal, previousTotal, taxAmount].some((item) => item.lt(0))) throw new QuoteChangeOrderError("Los importes no pueden ser negativos.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const newTotal = previousTotal.plus(increment).minus(reduction).plus(taxAmount).toDecimalPlaces(2);
  if (newTotal.lt(0)) throw new QuoteChangeOrderError("El nuevo total no puede ser negativo.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const variation = newTotal.minus(previousTotal).toDecimalPlaces(2);
  const variationPercent = previousTotal.isZero() ? new Prisma.Decimal(0) : variation.div(previousTotal).mul(100).toDecimalPlaces(4);
  return { previousSubtotal, previousTotal, increment, reduction, taxAmount, newTotal, variation, variationPercent };
}

async function activePolicy(tx, tenantId, policyCode) {
  const row = (await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."quote_change_order_policies"
    WHERE "tenant_id"=${tenantId} AND "code"=${policyCode} AND "status"='ACTIVE'
      AND ("valid_from" IS NULL OR "valid_from"<=CURRENT_TIMESTAMP)
      AND ("valid_to" IS NULL OR "valid_to">CURRENT_TIMESTAMP)
    ORDER BY "version" DESC LIMIT 1
  `))[0];
  if (!row) throw new QuoteChangeOrderError("No existe una política activa para órdenes de cambio.", { code: "CHANGE_ORDER_POLICY_MISSING", status: 409 });
  return row;
}

function policySnapshot(policy) {
  return sanitizeCommercialAuditJson({
    id: policy.id, code: policy.code, version: policy.version, capPercent: String(policy.cap_percent),
    policyHash: policy.policy_hash, approvalRules: policy.approval_rules_json,
  });
}

function approvalReasons(actor, policy, money, cumulativeIncrease, input, riskResult) {
  const rules = policy.approval_rules_json || {};
  const reasons = [];
  const capAmount = decimal(input.baseApprovedTotal, "baseApprovedTotal").mul(policy.cap_percent).div(100).toDecimalPlaces(2);
  if (cumulativeIncrease.gt(capAmount)) reasons.push("CAP_EXCEEDED");
  const marginAfter = input.marginAfter == null ? null : decimal(input.marginAfter, "marginAfter", 4);
  if (marginAfter && rules.minimumMarginPercent != null && marginAfter.lt(decimal(rules.minimumMarginPercent, "minimumMarginPercent", 4))) reasons.push("MARGIN_BELOW_AUTHORIZED");
  if (money.reduction.gt(0) && rules.requireApprovalForReduction !== false) reasons.push("EXCEPTIONAL_DISCOUNT");
  if (input.contractuallySensitive === true) reasons.push("SENSITIVE_CONTRACT_CHANGE");
  if (riskResult === "REVIEW_REQUIRED" || riskResult === "BLOCKED") reasons.push("RISK_REVIEW_REQUIRED");
  if (!actor.permissions.has(CHANGE_ORDER_PERMISSIONS.AUTO_APPROVE)) reasons.push("ROLE_REQUIRES_APPROVAL");
  return { reasons: [...new Set(reasons)], capAmount };
}

async function evaluateChangeRisk(prisma, context, id, input, requestId) {
  const factors = [...new Set((input?.riskFactorChanges || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
  if (factors.some((factor) => !CHANGE_ORDER_RISK_FACTORS.has(factor))) throw new QuoteChangeOrderError("Factor de riesgo no soportado.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  if (!factors.length) return { required: false, factors, materialHash: null, evaluation: null };
  const snapshot = sanitizeCommercialAuditJson(input?.riskSnapshot || {});
  const materialHash = sha256(canonicalJson({ factors, snapshot }));
  const evaluation = await evaluateRisk(prisma, context, {
    entity: "QUOTE_CHANGE_ORDER", entityId: id, caseId: input.pipelineCaseId, quoteId: input.baseQuoteId,
    quoteVersion: Number(input.baseQuoteVersion), snapshot, requestId: `${requestId}:risk`.slice(0, 191),
  });
  return { required: true, factors, materialHash, evaluation };
}

async function allocateSequence(tx, tenantId) {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "osi"."quote_change_order_sequences"("tenant_id") VALUES (${tenantId}) ON CONFLICT ("tenant_id") DO NOTHING`);
  const row = (await tx.$queryRaw(Prisma.sql`
    UPDATE "osi"."quote_change_order_sequences" SET "next_value"="next_value"+1,"updated_at"=CURRENT_TIMESTAMP
    WHERE "tenant_id"=${tenantId} RETURNING "next_value"-1 AS "value"
  `))[0];
  return BigInt(row.value);
}

export async function createQuoteChangeOrder(prisma, context, input, options = {}) {
  const id = randomUUID();
  const requestId = requiredText(input?.requestId, "requestId");
  const pipelineCaseId = requiredText(input?.pipelineCaseId, "pipelineCaseId");
  const baseQuoteId = requiredText(input?.baseQuoteId, "baseQuoteId");
  const baseQuoteVersion = Number(input?.baseQuoteVersion);
  if (!Number.isInteger(baseQuoteVersion) || baseQuoteVersion < 1) throw new QuoteChangeOrderError("baseQuoteVersion inválida.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const baseSnapshot = sanitizeCommercialAuditJson(input?.baseQuoteSnapshot || {});
  const baseQuoteHash = sha256(canonicalJson(baseSnapshot));
  const baseApprovedTotal = decimal(input?.baseApprovedTotal ?? baseSnapshot?.total, "baseApprovedTotal");
  if (baseApprovedTotal.lte(0)) throw new QuoteChangeOrderError("El total base aprobado debe ser mayor que cero.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const items = normalizeItems(input?.items);
  const money = monetarySummary(items, input);
  const normalized = {
    pipelineCaseId, baseQuoteId, baseQuoteVersion, baseQuoteHash,
    changeType: code(input?.changeType || "ADDENDUM", "changeType", 80),
    classification: code(input?.classification || "SCOPE_ADDITION", "classification"),
    contractStage: code(input?.contractStage || "ACCEPTED", "contractStage", 80),
    reason: requiredText(input?.reason, "reason", 10_000), description: requiredText(input?.description, "description", 10_000),
    currency: code(input?.currency || "DOP", "currency", 3), customerAcceptanceRequired: input?.customerAcceptanceRequired !== false,
    expiresAt: asDate(input?.expiresAt, "expiresAt"), evidenceRefs: sanitizeCommercialAuditJson(input?.evidenceRefs || []),
    policyCode: code(input?.policyCode || DEFAULT_POLICY_CODE, "policyCode", 100), baseApprovedTotal,
    marginAfter: input?.marginAfter, contractuallySensitive: input?.contractuallySensitive === true,
  };
  if (!/^[A-Z]{3}$/.test(normalized.currency) || !Array.isArray(normalized.evidenceRefs)) throw new QuoteChangeOrderError("Moneda o evidencias inválidas.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const risk = await evaluateChangeRisk(prisma, context, id, { ...input, pipelineCaseId, baseQuoteId, baseQuoteVersion }, requestId);
  if (input?.logisticOverrideId) {
    const validation = await validateLogisticOverride(prisma, context, {
      id: input.logisticOverrideId, entity: "QUOTE_CHANGE_ORDER", entityId: id, caseId: pipelineCaseId,
      quoteId: baseQuoteId, quoteVersion: baseQuoteVersion, materialHash: risk.materialHash, requestId: `${requestId}:override`,
    });
    if (!validation.valid) throw new QuoteChangeOrderError("La excepción logística no corresponde a esta evaluación.", { code: "CHANGE_ORDER_OVERRIDE_MISMATCH", status: 409 });
  }
  const hashItems = items.map(({ id: _generatedId, ...item }) => item);
  const payloadHash = sha256(canonicalJson({ normalized, baseSnapshot, items: hashItems, money, risk: { factors: risk.factors, materialHash: risk.materialHash } }));
  const auditWriter = options.auditWriter || appendCommercialAudit;

  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.CREATE);
    const prior = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_orders" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`))[0];
    if (prior) {
      if (prior.payload_hash !== payloadHash) throw new QuoteChangeOrderError("requestId reutilizado con otro payload.", { code: "CHANGE_ORDER_IDEMPOTENCY_CONFLICT", status: 409 });
      return { order: await findOrder(tx, actor.tenantId, prior.id), idempotent: true };
    }
    const subject = (await tx.$queryRaw(Prisma.sql`
      SELECT q."version",q."status" FROM "osi"."quote_change_order_subjects" s
      JOIN "osi"."osi_pipeline_case_quotes" q ON q."id"=s."base_quote_id" AND q."caseId"=s."pipeline_case_id"
      WHERE s."tenant_id"=${actor.tenantId} AND s."pipeline_case_id"=${pipelineCaseId} AND s."base_quote_id"=${baseQuoteId} LIMIT 1
    `))[0];
    if (!subject) throw new QuoteChangeOrderError("Recurso no encontrado.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
    if (Number(subject.version) !== baseQuoteVersion) throw new QuoteChangeOrderError("La versión base cambió.", { code: "CHANGE_ORDER_BASE_CHANGED", status: 409 });
    if (!new Set(["SENT", "APPROVED"]).has(String(subject.status).toUpperCase())) throw new QuoteChangeOrderError("Una edición de borrador o versión previa no debe crear una adenda.", { code: "CHANGE_ORDER_NOT_POST_QUOTE", status: 409 });
    const policy = await activePolicy(tx, actor.tenantId, normalized.policyCode);
    const reserved = (await tx.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST("variation_amount",0)),0) AS "amount"
      FROM "osi"."quote_change_orders" WHERE "tenant_id"=${actor.tenantId} AND "base_quote_id"=${baseQuoteId}
        AND "is_current" AND "status" NOT IN ('REJECTED','CANCELLED','EXPIRED','SUPERSEDED')
    `))[0];
    const cumulativeIncrease = decimal(reserved.amount, "cumulativeIncrease").plus(Prisma.Decimal.max(money.variation, 0));
    const riskResult = risk.evaluation?.evaluation?.result || risk.evaluation?.result || "PASS";
    const approval = approvalReasons(actor, policy, money, cumulativeIncrease, normalized, riskResult);
    const sequence = await allocateSequence(tx, actor.tenantId);
    const orderCode = `CO-${sequence.toString().padStart(6, "0")}`;
    const policyJson = policySnapshot(policy);
    const riskSnapshot = sanitizeCommercialAuditJson({ operationMode: risk.evaluation?.operationMode || "LEGACY_ONLY", result: riskResult, persisted: risk.evaluation?.persisted === true, materialHash: risk.materialHash });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_orders"(
        "id","tenant_id","pipeline_case_id","base_quote_id","base_quote_version","base_quote_hash","base_quote_snapshot_json",
        "series_id","code","sequence_number","version","change_type","classification","contract_stage","reason","description","currency",
        "previous_subtotal","increment_amount","reduction_amount","tax_amount","previous_total","new_total","variation_amount","variation_percent",
        "policy_id","policy_snapshot_json","cap_amount","cumulative_increase","requires_approval","approval_reasons_json",
        "risk_recheck_required","risk_factor_changes_json","risk_evaluation_id","risk_material_hash","risk_snapshot_json","logistic_override_id",
        "customer_acceptance_required","evidence_refs_json","status","requested_by_user_id","requested_by_membership_id","expires_at","request_id","payload_hash"
      ) VALUES (
        ${id},${actor.tenantId},${pipelineCaseId},${baseQuoteId},${baseQuoteVersion},${baseQuoteHash},CAST(${json(baseSnapshot)} AS jsonb),
        ${id},${orderCode},${sequence},1,${normalized.changeType},${normalized.classification},${normalized.contractStage},${normalized.reason},${normalized.description},${normalized.currency},
        ${money.previousSubtotal},${money.increment},${money.reduction},${money.taxAmount},${money.previousTotal},${money.newTotal},${money.variation},${money.variationPercent},
        ${policy.id},CAST(${json(policyJson)} AS jsonb),${approval.capAmount},${cumulativeIncrease},${approval.reasons.length > 0},CAST(${json(approval.reasons)} AS jsonb),
        ${risk.required},CAST(${json(risk.factors)} AS jsonb),${risk.evaluation?.evaluation?.id || null},${risk.materialHash},CAST(${json(riskSnapshot)} AS jsonb),${input?.logisticOverrideId || null},
        ${normalized.customerAcceptanceRequired},CAST(${json(normalized.evidenceRefs)} AS jsonb),'DRAFT',${actor.userId},${actor.membershipId},${normalized.expiresAt},${requestId},${payloadHash}
      )
    `);
    for (const item of items) await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_order_items"(
        "id","tenant_id","change_order_id","line_key","change_kind","classification","description","unit","source_line_id",
        "previous_quantity","new_quantity","previous_unit_price","new_unit_price","previous_line_total","new_line_total","before_json","after_json"
      ) VALUES (
        ${item.id},${actor.tenantId},${id},${item.lineKey},CAST(${item.kind} AS "osi"."QuoteChangeOrderItemChange"),${item.classification},${item.description},${item.unit},${item.sourceLineId},
        ${item.previousQuantity},${item.newQuantity},${item.previousUnitPrice},${item.newUnitPrice},${item.previousLineTotal},${item.newLineTotal},
        CAST(${json(item.before)} AS jsonb),CAST(${json(item.after)} AS jsonb)
      )
    `);
    const order = await findOrder(tx, actor.tenantId, id);
    if (typeof options.legacyProjectionWriter === "function") {
      await options.legacyProjectionWriter(tx, order);
    }
    await auditWriter(tx, auditContext(actor), {
      action: "QUOTE_CHANGE_ORDER_CREATED", entity: "QUOTE_CHANGE_ORDER", entityId: id,
      source: "DB01G_CHANGE_ORDER", requestId, critical: true, afterJson: order,
      metadataJson: { dualWrite: typeof options.legacyProjectionWriter === "function" },
    });
    await recordCommand(tx, actor, order, "CREATE", requestId, payloadHash);
    return { order, idempotent: false };
  });
}

export async function listQuoteChangeOrders(prisma, context, input = {}) {
  const actor = await resolveActor(prisma, context, CHANGE_ORDER_PERMISSIONS.VIEW, { allowSystem: true });
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(input.limit || 50)));
  const cursorCreatedAt = input.cursorCreatedAt ? asDate(input.cursorCreatedAt, "cursorCreatedAt", false) : null;
  const cursorId = optionalText(input.cursorId, "cursorId");
  const status = input.status ? code(input.status, "status", 40) : null;
  const quoteId = optionalText(input.baseQuoteId, "baseQuoteId");
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."quote_change_orders" WHERE "tenant_id"=${actor.tenantId}
      AND (${status}::text IS NULL OR "status"::text=${status})
      AND (${quoteId}::text IS NULL OR "base_quote_id"=${quoteId})
      AND (${cursorCreatedAt}::timestamp IS NULL OR ("created_at","id")<(${cursorCreatedAt},${cursorId || "~"}))
    ORDER BY "created_at" DESC,"id" DESC LIMIT ${limit + 1}
  `);
  const page = rows.slice(0, limit).map((row) => mapOrder(row));
  const last = page.at(-1);
  return { items: page, nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

async function loadOrderCommand(tx, actor, input, command, permission, options = {}) {
  if (actor.kind !== "SYSTEM" && permission && !actor.permissions.has(permission)) throw new QuoteChangeOrderError(`Permiso requerido: ${permission}.`, { code: "CHANGE_ORDER_FORBIDDEN", status: 403 });
  const id = requiredText(input?.id, "id");
  const requestId = requiredText(input?.requestId, "requestId");
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new QuoteChangeOrderError("expectedVersion es obligatorio.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
  const payloadHash = sha256(canonicalJson({ command, id, expectedVersion, payload: options.payload || {} }));
  const replay = await commandReplay(tx, actor.tenantId, command, requestId, payloadHash);
  if (replay) return { replay };
  const order = await findOrder(tx, actor.tenantId, id, { lock: true });
  if (!order) throw new QuoteChangeOrderError("Orden de cambio no encontrada.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
  if (Number(order.row_version) !== expectedVersion) throw new QuoteChangeOrderError("La orden cambió; vuelva a cargarla.", { code: "CHANGE_ORDER_VERSION_CONFLICT", status: 409 });
  return { order, requestId, payloadHash };
}

async function updateStatus(tx, actor, order, status, fields = {}) {
  const updated = await tx.$queryRaw(Prisma.sql`
    UPDATE "osi"."quote_change_orders" SET
      "status"=CAST(${status} AS "osi"."QuoteChangeOrderStatus"),
      "approval_request_id"=${fields.approvalRequestId ?? order.approval_request_id},
      "submitted_at"=${fields.submittedAt ?? order.submitted_at},
      "approved_at"=${fields.approvedAt ?? order.approved_at},
      "sent_to_customer_at"=${fields.sentToCustomerAt ?? order.sent_to_customer_at},
      "customer_decision"=${fields.customerDecision ?? order.customer_decision},
      "customer_decided_at"=${fields.customerDecidedAt ?? order.customer_decided_at},
      "customer_actor_snapshot"=${fields.customerActorSnapshot ?? order.customer_actor_snapshot},
      "customer_acceptance_method"=${fields.customerAcceptanceMethod ?? order.customer_acceptance_method},
      "customer_acceptance_hash"=${fields.customerAcceptanceHash ?? order.customer_acceptance_hash},
      "evidence_refs_json"=CAST(${json(fields.evidenceRefs ?? order.evidence_refs_json)} AS jsonb),
      "executed_by_user_id"=${fields.executedByUserId ?? order.executed_by_user_id},
      "executed_by_membership_id"=${fields.executedByMembershipId ?? order.executed_by_membership_id},
      "executed_at"=${fields.executedAt ?? order.executed_at},
      "is_current"=${fields.isCurrent ?? order.is_current},
      "row_version"="row_version"+1
    WHERE "tenant_id"=${actor.tenantId} AND "id"=${order.id} AND "row_version"=${Number(order.row_version)}
    RETURNING *
  `);
  if (!updated[0]) throw new QuoteChangeOrderError("Conflicto de concurrencia.", { code: "CHANGE_ORDER_VERSION_CONFLICT", status: 409 });
  return findOrder(tx, actor.tenantId, order.id);
}

async function auditedCommand(tx, auditWriter, actor, before, after, action, requestId, command, payloadHash, metadataJson) {
  await auditWriter(tx, auditContext(actor), {
    action, entity: "QUOTE_CHANGE_ORDER", entityId: after?.id || before?.id,
    source: "DB01G_CHANGE_ORDER", requestId, critical: true, beforeJson: before, afterJson: after, metadataJson,
  });
  await recordCommand(tx, actor, after || before, command, requestId, payloadHash);
  return { order: after, idempotent: false };
}

export async function submitQuoteChangeOrder(prisma, context, input, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  const result = await serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.SUBMIT);
    const cmd = await loadOrderCommand(tx, actor, input, "SUBMIT", CHANGE_ORDER_PERMISSIONS.SUBMIT, {
      payload: { assignedApproverMembershipId: input?.assignedApproverMembershipId || null },
    });
    if (cmd.replay) return cmd.replay;
    if (cmd.order.status !== "DRAFT") throw new QuoteChangeOrderError("Sólo un borrador puede enviarse.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    if (cmd.order.expires_at && new Date(cmd.order.expires_at) <= new Date()) throw new QuoteChangeOrderError("La orden está vencida.", { code: "CHANGE_ORDER_EXPIRED", status: 409 });
    let approvalRequestId = null;
    let target = "APPROVED";
    if (cmd.order.requires_approval) {
      const risk = cmd.order.risk_snapshot_json || {};
      const approvalResult = await createApprovalRequestInTransaction(tx, context, {
        approvalType: "QUOTE_CHANGE_ORDER_EXCEPTION", entity: "QUOTE_CHANGE_ORDER", entityId: cmd.order.id,
        requestReason: `Revisión de ${cmd.order.code} v${cmd.order.version}: ${(cmd.order.approval_reasons_json || []).join(", ")}`,
        evaluationSnapshot: {
          changeOrderId: cmd.order.id, changeOrderVersion: cmd.order.version, changeOrderHash: cmd.order.payload_hash,
          baseQuoteHash: cmd.order.base_quote_hash, previousTotal: cmd.order.previous_total, newTotal: cmd.order.new_total,
          currency: cmd.order.currency, approvalReasons: cmd.order.approval_reasons_json,
        },
        riskEvaluation: {
          result: risk.result || "PASS", reference: cmd.order.risk_evaluation_id,
          rulesVersion: risk.rulesVersion, rulesHash: risk.rulesetHash, factors: cmd.order.risk_factor_changes_json,
          reasons: risk.reasons || [], requiresLogisticOverrideApproval: risk.result === "BLOCKED",
        },
        dueAt: cmd.order.expires_at,
        requestId: `${cmd.requestId}:approval`.slice(0, 191),
      }, {
        separationOfDutiesRequired: true,
        assignedApproverMembershipId: input?.assignedApproverMembershipId,
        policySnapshot: cmd.order.policy_snapshot_json,
      });
      if (approvalResult?.rejected) return approvalResult;
      approvalRequestId = approvalResult.approval.id;
      target = "PENDING_APPROVAL";
    }
    const after = await updateStatus(tx, actor, cmd.order, target, {
      approvalRequestId, submittedAt: new Date(), approvedAt: target === "APPROVED" ? new Date() : null,
    });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after,
      target === "PENDING_APPROVAL" ? "QUOTE_CHANGE_ORDER_SUBMITTED_FOR_APPROVAL" : "QUOTE_CHANGE_ORDER_APPROVED_BY_POLICY",
      cmd.requestId, "SUBMIT", cmd.payloadHash, { approvalRequestId });
  });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function decideQuoteChangeOrderApproval(prisma, context, input, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  const result = await serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.DECIDE);
    const decision = code(input?.decision, "decision", 20);
    if (!new Set(["APPROVED", "REJECTED"]).has(decision)) throw new QuoteChangeOrderError("Decisión inválida.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
    const cmd = await loadOrderCommand(tx, actor, input, "DECIDE", CHANGE_ORDER_PERMISSIONS.DECIDE, { payload: { decision, reason: input?.reason } });
    if (cmd.replay) return cmd.replay;
    if (cmd.order.status !== "PENDING_APPROVAL" || !cmd.order.approval_request_id) throw new QuoteChangeOrderError("La orden no espera aprobación.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    const approvalRow = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."approval_requests" WHERE "tenant_id"=${actor.tenantId} AND "id"=${cmd.order.approval_request_id} LIMIT 1`))[0];
    if (approvalRow?.evaluation_snapshot_json?.changeOrderHash !== cmd.order.payload_hash || Number(approvalRow?.evaluation_snapshot_json?.changeOrderVersion) !== Number(cmd.order.version)) {
      throw new QuoteChangeOrderError("La aprobación no corresponde a esta versión y hash.", { code: "CHANGE_ORDER_APPROVAL_SCOPE_MISMATCH", status: 409 });
    }
    const approvalResult = await decideApprovalRequestInTransaction(tx, context, {
      id: cmd.order.approval_request_id, decision, reason: requiredText(input?.reason, "reason", 10_000),
      expectedVersion: Number(input?.approvalExpectedVersion), requestId: `${cmd.requestId}:approval`.slice(0, 191),
    });
    if (approvalResult?.rejected) return approvalResult;
    const after = await updateStatus(tx, actor, cmd.order, decision, { approvedAt: decision === "APPROVED" ? new Date() : null });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after,
      decision === "APPROVED" ? "QUOTE_CHANGE_ORDER_APPROVED" : "QUOTE_CHANGE_ORDER_REJECTED",
      cmd.requestId, "DECIDE", cmd.payloadHash, { approvalRequestId: cmd.order.approval_request_id });
  });
  return unwrapApprovalRequestTransactionResult(result);
}

export async function sendQuoteChangeOrderToCustomer(prisma, context, input, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.SEND_CUSTOMER);
    const cmd = await loadOrderCommand(tx, actor, input, "SEND_CUSTOMER", CHANGE_ORDER_PERMISSIONS.SEND_CUSTOMER);
    if (cmd.replay) return cmd.replay;
    if (cmd.order.status !== "APPROVED" || !cmd.order.customer_acceptance_required) throw new QuoteChangeOrderError("La orden no está lista para el cliente.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    const after = await updateStatus(tx, actor, cmd.order, "PENDING_CUSTOMER", { sentToCustomerAt: new Date() });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after, "QUOTE_CHANGE_ORDER_SENT_TO_CUSTOMER", cmd.requestId, "SEND_CUSTOMER", cmd.payloadHash);
  });
}

export async function recordQuoteChangeOrderCustomerDecision(prisma, context, input, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.CUSTOMER_DECISION);
    const decision = code(input?.decision, "decision", 20);
    const evidenceRefs = sanitizeCommercialAuditJson(input?.evidenceRefs || []);
    const customerActor = requiredText(input?.customerActor, "customerActor", 240);
    const method = code(input?.method, "method", 80);
    if (!new Set(["ACCEPTED", "REJECTED"]).has(decision) || !Array.isArray(evidenceRefs) || !evidenceRefs.length) throw new QuoteChangeOrderError("La decisión requiere comprobante y método.", { code: "CHANGE_ORDER_INPUT_INVALID", status: 400 });
    const cmd = await loadOrderCommand(tx, actor, input, "CUSTOMER_DECISION", CHANGE_ORDER_PERMISSIONS.CUSTOMER_DECISION, { payload: { decision, evidenceRefs, customerActor, method } });
    if (cmd.replay) return cmd.replay;
    if (cmd.order.status !== "PENDING_CUSTOMER") throw new QuoteChangeOrderError("La orden no espera decisión del cliente.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    const acceptanceHash = sha256(canonicalJson({ orderId: cmd.order.id, version: cmd.order.version, decision, evidenceRefs, customerActor, method }));
    const after = await updateStatus(tx, actor, cmd.order, decision, {
      customerDecision: decision, customerDecidedAt: new Date(), customerActorSnapshot: customerActor,
      customerAcceptanceMethod: method, customerAcceptanceHash: acceptanceHash, evidenceRefs,
    });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after,
      decision === "ACCEPTED" ? "QUOTE_CHANGE_ORDER_CUSTOMER_ACCEPTED" : "QUOTE_CHANGE_ORDER_CUSTOMER_REJECTED",
      cmd.requestId, "CUSTOMER_DECISION", cmd.payloadHash);
  });
}

export async function executeQuoteChangeOrder(prisma, context, input, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.EXECUTE);
    const currentBaseSnapshot = sanitizeCommercialAuditJson(input?.currentBaseQuoteSnapshot || {});
    const cmd = await loadOrderCommand(tx, actor, input, "EXECUTE", CHANGE_ORDER_PERMISSIONS.EXECUTE, { payload: { currentBaseQuoteHash: sha256(canonicalJson(currentBaseSnapshot)) } });
    if (cmd.replay) return cmd.replay;
    const allowed = cmd.order.customer_acceptance_required ? cmd.order.status === "ACCEPTED" : cmd.order.status === "APPROVED";
    if (!allowed) throw new QuoteChangeOrderError("La orden no está aceptada para ejecución.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    if (sha256(canonicalJson(currentBaseSnapshot)) !== cmd.order.base_quote_hash) throw new QuoteChangeOrderError("La cotización base cambió después del snapshot.", { code: "CHANGE_ORDER_BASE_CHANGED", status: 409 });
    const quote = (await tx.$queryRaw(Prisma.sql`SELECT "version" FROM "osi"."osi_pipeline_case_quotes" WHERE "id"=${cmd.order.base_quote_id} AND "caseId"=${cmd.order.pipeline_case_id} LIMIT 1`))[0];
    if (!quote || Number(quote.version) !== Number(cmd.order.base_quote_version)) throw new QuoteChangeOrderError("La versión base cambió.", { code: "CHANGE_ORDER_BASE_CHANGED", status: 409 });
    if (cmd.order.approval_request_id) {
      const approval = (await tx.$queryRaw(Prisma.sql`SELECT "status"::text AS "status","evaluation_snapshot_json" FROM "osi"."approval_requests" WHERE "tenant_id"=${actor.tenantId} AND "id"=${cmd.order.approval_request_id} LIMIT 1`))[0];
      if (approval?.status !== "APPROVED" || approval.evaluation_snapshot_json?.changeOrderHash !== cmd.order.payload_hash) throw new QuoteChangeOrderError("Aprobación ausente o correspondiente a otro hash.", { code: "CHANGE_ORDER_APPROVAL_SCOPE_MISMATCH", status: 409 });
    }
    if (cmd.order.logistic_override_id) {
      const override = (await tx.$queryRaw(Prisma.sql`
        SELECT o."material_hash",a."status"::text AS "status",o."valid_from",o."valid_to",o."decision_hash"
        FROM "osi"."logistic_override_approvals" o JOIN "osi"."approval_requests" a ON a."tenant_id"=o."tenant_id" AND a."id"=o."approval_request_id"
        WHERE o."tenant_id"=${actor.tenantId} AND o."id"=${cmd.order.logistic_override_id} LIMIT 1
      `))[0];
      if (!override || override.status !== "APPROVED" || override.material_hash !== cmd.order.risk_material_hash || !override.decision_hash || new Date(override.valid_to) <= new Date()) throw new QuoteChangeOrderError("La excepción logística no es válida para esta evaluación.", { code: "CHANGE_ORDER_OVERRIDE_MISMATCH", status: 409 });
    }
    const after = await updateStatus(tx, actor, cmd.order, "EXECUTED", {
      executedByUserId: actor.userId, executedByMembershipId: actor.membershipId, executedAt: new Date(),
    });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after, "QUOTE_CHANGE_ORDER_EXECUTED", cmd.requestId, "EXECUTE", cmd.payloadHash);
  });
}

async function terminalTransition(prisma, context, input, target, permission, options = {}) {
  const auditWriter = options.auditWriter || appendCommercialAudit;
  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, permission, { allowSystem: target === "EXPIRED" });
    const cmd = await loadOrderCommand(tx, actor, input, target, permission, { payload: { reason: input?.reason } });
    if (cmd.replay) return cmd.replay;
    if (CHANGE_ORDER_TERMINAL.has(cmd.order.status)) throw new QuoteChangeOrderError("El estado final es inmutable.", { code: "CHANGE_ORDER_FINAL_IMMUTABLE", status: 409 });
    if (target === "EXPIRED" && cmd.order.expires_at && new Date(cmd.order.expires_at) > new Date()) throw new QuoteChangeOrderError("La orden aún no ha vencido.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    requiredText(input?.reason || (target === "EXPIRED" ? "Vencimiento programado" : null), "reason", 10_000);
    const after = await updateStatus(tx, actor, cmd.order, target, { isCurrent: target === "CANCELLED" ? false : cmd.order.is_current });
    return auditedCommand(tx, auditWriter, actor, cmd.order, after, `QUOTE_CHANGE_ORDER_${target}`, cmd.requestId, target, cmd.payloadHash);
  });
}

export function cancelQuoteChangeOrder(prisma, context, input, options) {
  return terminalTransition(prisma, context, input, "CANCELLED", CHANGE_ORDER_PERMISSIONS.CANCEL, options);
}

export function expireQuoteChangeOrder(prisma, context, input, options) {
  return terminalTransition(prisma, context, input, "EXPIRED", CHANGE_ORDER_PERMISSIONS.EXPIRE, options);
}

export async function reviseQuoteChangeOrder(prisma, context, input, options = {}) {
  const newId = randomUUID();
  const requestId = requiredText(input?.requestId, "requestId");
  const sourceId = requiredText(input?.id, "id");
  const expectedVersion = Number(input?.expectedVersion);
  const items = normalizeItems(input?.items);
  const money = monetarySummary(items, input);
  const auditWriter = options.auditWriter || appendCommercialAudit;
  const risk = await evaluateChangeRisk(prisma, context, newId, {
    ...input, pipelineCaseId: input?.pipelineCaseId, baseQuoteId: input?.baseQuoteId,
    baseQuoteVersion: input?.baseQuoteVersion,
  }, requestId);

  return serializable(prisma, async (tx) => {
    const actor = await resolveActor(tx, context, CHANGE_ORDER_PERMISSIONS.REVISE);
    const payloadHash = sha256(canonicalJson({ sourceId, expectedVersion, items, money, reason: input?.reason, description: input?.description, risk: risk.materialHash }));
    const replay = await commandReplay(tx, actor.tenantId, "REVISE", requestId, payloadHash);
    if (replay) return replay;
    const old = await findOrder(tx, actor.tenantId, sourceId, { lock: true });
    if (!old) throw new QuoteChangeOrderError("Orden de cambio no encontrada.", { code: "CHANGE_ORDER_NOT_FOUND", status: 404 });
    if (Number(old.row_version) !== expectedVersion) throw new QuoteChangeOrderError("La orden cambió; vuelva a cargarla.", { code: "CHANGE_ORDER_VERSION_CONFLICT", status: 409 });
    if (!old.is_current || !new Set(["DRAFT", "APPROVED", "PENDING_CUSTOMER"]).has(old.status)) throw new QuoteChangeOrderError("Esta orden no admite una nueva versión.", { code: "CHANGE_ORDER_STATE_INVALID", status: 409 });
    const baseSnapshot = input?.baseQuoteSnapshot == null ? old.base_quote_snapshot_json : sanitizeCommercialAuditJson(input.baseQuoteSnapshot);
    if (sha256(canonicalJson(baseSnapshot)) !== old.base_quote_hash) throw new QuoteChangeOrderError("No se puede cambiar retroactivamente la cotización base.", { code: "CHANGE_ORDER_BASE_CHANGED", status: 409 });
    const reserved = (await tx.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST("variation_amount",0)),0) AS "amount" FROM "osi"."quote_change_orders"
      WHERE "tenant_id"=${actor.tenantId} AND "base_quote_id"=${old.base_quote_id} AND "id"<>${old.id}
        AND "is_current" AND "status" NOT IN ('REJECTED','CANCELLED','EXPIRED','SUPERSEDED')
    `))[0];
    const cumulativeIncrease = decimal(reserved.amount, "cumulativeIncrease").plus(Prisma.Decimal.max(money.variation, 0));
    const policy = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."quote_change_order_policies" WHERE "tenant_id"=${actor.tenantId} AND "id"=${old.policy_id} LIMIT 1`))[0];
    const riskResult = risk.evaluation?.evaluation?.result || risk.evaluation?.result || "PASS";
    const normalized = {
      baseApprovedTotal: decimal(old.cap_amount, "capAmount").mul(100).div(decimal(policy.cap_percent, "capPercent", 4)),
      marginAfter: input?.marginAfter, contractuallySensitive: input?.contractuallySensitive === true,
    };
    const approval = approvalReasons(actor, policy, money, cumulativeIncrease, normalized, riskResult);
    const superseded = await updateStatus(tx, actor, old, "SUPERSEDED", { isCurrent: false });
    const version = Number(old.version) + 1;
    const riskSnapshot = sanitizeCommercialAuditJson({ operationMode: risk.evaluation?.operationMode || "LEGACY_ONLY", result: riskResult, persisted: risk.evaluation?.persisted === true, materialHash: risk.materialHash });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_orders"(
        "id","tenant_id","pipeline_case_id","base_quote_id","base_quote_version","base_quote_hash","base_quote_snapshot_json",
        "series_id","code","sequence_number","version","previous_version_id","is_current","change_type","classification","contract_stage","reason","description","currency",
        "previous_subtotal","increment_amount","reduction_amount","tax_amount","previous_total","new_total","variation_amount","variation_percent",
        "policy_id","policy_snapshot_json","cap_amount","cumulative_increase","requires_approval","approval_reasons_json",
        "risk_recheck_required","risk_factor_changes_json","risk_evaluation_id","risk_material_hash","risk_snapshot_json","customer_acceptance_required",
        "evidence_refs_json","status","requested_by_user_id","requested_by_membership_id","expires_at","request_id","payload_hash"
      ) VALUES (
        ${newId},${actor.tenantId},${old.pipeline_case_id},${old.base_quote_id},${Number(old.base_quote_version)},${old.base_quote_hash},CAST(${json(baseSnapshot)} AS jsonb),
        ${old.series_id},${old.code},${BigInt(old.sequence_number)},${version},${old.id},true,${code(input?.changeType || old.change_type, "changeType", 80)},
        ${code(input?.classification || old.classification, "classification")},${old.contract_stage},${requiredText(input?.reason, "reason", 10_000)},${requiredText(input?.description, "description", 10_000)},${old.currency},
        ${money.previousSubtotal},${money.increment},${money.reduction},${money.taxAmount},${money.previousTotal},${money.newTotal},${money.variation},${money.variationPercent},
        ${old.policy_id},CAST(${json(old.policy_snapshot_json)} AS jsonb),${approval.capAmount},${cumulativeIncrease},${approval.reasons.length > 0},CAST(${json(approval.reasons)} AS jsonb),
        ${risk.required},CAST(${json(risk.factors)} AS jsonb),${risk.evaluation?.evaluation?.id || null},${risk.materialHash},CAST(${json(riskSnapshot)} AS jsonb),${old.customer_acceptance_required},
        CAST(${json(sanitizeCommercialAuditJson(input?.evidenceRefs || []))} AS jsonb),'DRAFT',${actor.userId},${actor.membershipId},${asDate(input?.expiresAt, "expiresAt") || old.expires_at},${requestId},${payloadHash}
      )
    `);
    for (const item of items) await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."quote_change_order_items"(
        "id","tenant_id","change_order_id","line_key","change_kind","classification","description","unit","source_line_id",
        "previous_quantity","new_quantity","previous_unit_price","new_unit_price","previous_line_total","new_line_total","before_json","after_json"
      ) VALUES (${item.id},${actor.tenantId},${newId},${item.lineKey},CAST(${item.kind} AS "osi"."QuoteChangeOrderItemChange"),${item.classification},${item.description},${item.unit},${item.sourceLineId},
        ${item.previousQuantity},${item.newQuantity},${item.previousUnitPrice},${item.newUnitPrice},${item.previousLineTotal},${item.newLineTotal},CAST(${json(item.before)} AS jsonb),CAST(${json(item.after)} AS jsonb))
    `);
    const next = await findOrder(tx, actor.tenantId, newId);
    await auditWriter(tx, auditContext(actor), {
      action: "QUOTE_CHANGE_ORDER_VERSION_SUPERSEDED", entity: "QUOTE_CHANGE_ORDER", entityId: old.id,
      source: "DB01G_CHANGE_ORDER", requestId, critical: true, beforeJson: old, afterJson: superseded,
      metadataJson: { replacementId: newId, replacementVersion: version },
    });
    await auditWriter(tx, auditContext(actor), {
      action: "QUOTE_CHANGE_ORDER_VERSION_CREATED", entity: "QUOTE_CHANGE_ORDER", entityId: newId,
      source: "DB01G_CHANGE_ORDER", requestId, critical: true, beforeJson: old, afterJson: next,
    });
    await recordCommand(tx, actor, next, "REVISE", requestId, payloadHash);
    return { order: next, superseded, idempotent: false };
  });
}

export const __quoteChangeOrderInternals = Object.freeze({ canonicalJson, sha256, normalizeItems, monetarySummary });
