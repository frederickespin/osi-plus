/* eslint-disable no-console */
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { APPROVAL_PERMISSIONS } from "../api/_lib/approvalRequest.js";
import { quoteChangeOrderPersistenceMode } from "../api/_lib/quoteChangeOrderAdapter.js";
import {
  CHANGE_ORDER_PERMISSIONS,
  bindQuoteChangeOrderSubject,
  cancelQuoteChangeOrder,
  createQuoteChangeOrder,
  createQuoteChangeOrderPolicy,
  decideQuoteChangeOrderApproval,
  executeQuoteChangeOrder,
  expireQuoteChangeOrder,
  listQuoteChangeOrders,
  recordQuoteChangeOrderCustomerDecision,
  reviseQuoteChangeOrder,
  sendQuoteChangeOrderToCustomer,
  submitQuoteChangeOrder,
} from "../api/_lib/quoteChangeOrder.js";
import { analyzeHistoricalChangeOrders } from "./db01g-dry-run.mjs";
import { createDb01gPrisma } from "./db01g-lib.mjs";

const prisma = createDb01gPrisma();
const results = [];
const run = Date.now().toString(36);
const t1 = `db01g-t1-${run}`;
const t2 = `db01g-t2-${run}`;
const actor = { userId: `db01g-u1-${run}`, membershipId: `db01g-m1-${run}` };
const approver = { userId: `db01g-u2-${run}`, membershipId: `db01g-m2-${run}` };
const actorT2 = { userId: actor.userId, membershipId: `db01g-m3-${run}` };
const caseId = `db01g-case-${run}`;
const quoteId = `db01g-quote-${run}`;
const baseSnapshot = { id: quoteId, version: 1, total: "100000.00", currency: "DOP", lines: [{ id: "base", total: "100000.00" }] };

function check(name, condition, details) {
  if (!condition) throw new Error(`Falló: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true, ...(details ? { details } : {}) });
}

async function expectError(name, work, code) {
  try {
    await work();
    throw new Error(`${name}: operación inválida aceptada`);
  } catch (error) {
    if (String(error?.message || "").includes("operación inválida aceptada")) throw error;
    check(name, !code || error?.code === code, `code=${error?.code || error?.meta?.code || "DATABASE"}`);
    return error;
  }
}

const permissions = [...new Set([
  ...Object.values(CHANGE_ORDER_PERMISSIONS),
  ...Object.values(APPROVAL_PERMISSIONS),
  "risk:evaluate", "risk:override:view", "commercial:audit:view",
])];

function context(tenantId, membershipId) {
  return { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId };
}
const requesterContext = context(t1, actor.membershipId);
const approverContext = context(t1, approver.membershipId);
const otherTenantContext = context(t2, actorT2.membershipId);

async function seed() {
  const permissionSql = permissions.map((permission) => `'${permission}'`).join(",");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_users"("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt") VALUES
      ('${actor.userId}','DB01G-U1-${run}','Synthetic Requester','${run}.requester@example.invalid','+10000000001','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approver.userId}','DB01G-U2-${run}','Synthetic Approver','${run}.approver@example.invalid','+10000000002','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants"("id","code","name","legal_name","status","provisioning_source","updated_at") VALUES
      ('${t1}','DB01G-T1-${run.toUpperCase()}','DB-01G Tenant One','Synthetic One','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${t2}','DB01G-T2-${run.toUpperCase()}','DB-01G Tenant Two','Synthetic Two','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at") VALUES
      ('${actor.membershipId}','${t1}','${actor.userId}','V','ACTIVE',ARRAY[${permissionSql}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approver.membershipId}','${t1}','${approver.userId}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${actorT2.membershipId}','${t2}','${actorT2.userId}','V','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_cases"(
      "id","caseCode","mode","serviceType","customerType","status","ownerName","originLocation","destinationLocation"
    ) VALUES ('${caseId}','DB01G-${run}','LOCAL','LOCAL_MOVE','L4_PERSONAL','APPROVED','Synthetic','Origin','Destination')
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_pipeline_case_quotes"("id","caseId","level","version","status")
    VALUES ('${quoteId}','${caseId}','STANDARD',1,'APPROVED')
  `);
}

function item(amount, key = "line-1", extra = {}) {
  return {
    lineKey: key, changeKind: "ADDED", classification: "SCOPE_ADDITION", description: `Synthetic ${key}`,
    newQuantity: "1", newUnitPrice: String(amount), previousLineTotal: "0.00", newLineTotal: String(amount),
    after: { description: `Synthetic ${key}`, token: "should-redact" }, ...extra,
  };
}

function createInput(sequence, amount, extra = {}) {
  return {
    pipelineCaseId: caseId, baseQuoteId: quoteId, baseQuoteVersion: 1, baseQuoteSnapshot: baseSnapshot,
    baseApprovedTotal: "100000.00", previousSubtotal: "100000.00", previousTotal: "100000.00",
    taxAmount: "0.00", currency: "DOP", changeType: "ADDENDUM", classification: "SCOPE_ADDITION",
    contractStage: "ACCEPTED", reason: `Reason ${sequence}`, description: `Change ${sequence}`,
    customerAcceptanceRequired: true, items: [item(amount, `line-${sequence}`)], requestId: `create-${sequence}-${run}`,
    ...extra,
  };
}

async function main() {
  await seed();
  check("integración desactivada por defecto", quoteChangeOrderPersistenceMode({}) === "LEGACY_ONLY");
  const mode = await prisma.$queryRawUnsafe(`SELECT COALESCE((SELECT "mode"::text FROM "osi"."risk_engine_settings" WHERE "tenant_id"=$1),'LEGACY_ONLY') AS mode`, t1);
  check("RiskEngine permanece LEGACY_ONLY", mode[0].mode === "LEGACY_ONLY");

  const policy = await createQuoteChangeOrderPolicy(prisma, requesterContext, {
    code: "ADDENDUM_CAP", name: "Adendas contractuales 15%", capPercent: "15.0000", activate: true,
    approvalRules: { minimumMarginPercent: "5.0000", requireApprovalForReduction: true }, requestId: `policy-${run}`,
  });
  check("política 15% versionada y activa", policy.policy.status === "ACTIVE" && String(policy.policy.cap_percent) === "15");
  const policyRetry = await createQuoteChangeOrderPolicy(prisma, requesterContext, {
    code: "ADDENDUM_CAP", name: "Adendas contractuales 15%", capPercent: "15.0000", activate: true,
    approvalRules: { minimumMarginPercent: "5.0000", requireApprovalForReduction: true }, requestId: `policy-${run}`,
  });
  check("política idempotente", policyRetry.idempotent && policyRetry.policy.id === policy.policy.id);

  const binding = await bindQuoteChangeOrderSubject(prisma, requesterContext, { pipelineCaseId: caseId, baseQuoteId: quoteId, requestId: `bind-${run}` });
  check("vinculación tenant-caso-cotización creada", binding.subject.tenant_id === t1);
  const bindingRetry = await bindQuoteChangeOrderSubject(prisma, requesterContext, { pipelineCaseId: caseId, baseQuoteId: quoteId, requestId: `bind-${run}` });
  check("vinculación idempotente", bindingRetry.idempotent);
  await expectError("otra empresa no puede vincular la cotización", () => bindQuoteChangeOrderSubject(prisma, otherTenantContext, { pipelineCaseId: caseId, baseQuoteId: quoteId, requestId: `cross-bind-${run}` }), "CHANGE_ORDER_NOT_FOUND");

  const beforeQuote = await prisma.$queryRawUnsafe(`SELECT * FROM "osi"."osi_pipeline_case_quotes" WHERE "id"=$1`, quoteId);
  const created = await createQuoteChangeOrder(prisma, requesterContext, createInput("main", "10000.10"));
  check("cálculo Decimal exacto", created.order.increment_amount === "10000.1" && created.order.new_total === "110000.1");
  check("cap 15% expresado en monto", created.order.cap_amount === "15000");
  check("snapshot y partidas persistidos", created.order.base_quote_hash.length === 64 && created.order.items.length === 1);
  check("snapshot sensible sanitizado", created.order.items[0].after_json.token === "[REDACTED]");
  const repeated = await createQuoteChangeOrder(prisma, requesterContext, createInput("main", "10000.10"));
  check("creación idempotente", repeated.idempotent && repeated.order.id === created.order.id);
  await expectError("requestId reutilizado con otro payload", () => createQuoteChangeOrder(prisma, requesterContext, createInput("main", "10001.10")), "CHANGE_ORDER_IDEMPOTENCY_CONFLICT");
  await expectError("acceso cruzado devuelve 404", () => createQuoteChangeOrder(prisma, otherTenantContext, createInput("cross", "100.00")), "CHANGE_ORDER_NOT_FOUND");
  const submitted = await submitQuoteChangeOrder(prisma, requesterContext, { id: created.order.id, expectedVersion: 1, requestId: `submit-main-${run}` });
  check("cambio dentro del límite y rol autorizado aprueba por política", submitted.order.status === "APPROVED");
  const sent = await sendQuoteChangeOrderToCustomer(prisma, requesterContext, { id: created.order.id, expectedVersion: 2, requestId: `send-main-${run}` });
  check("envío al cliente avanza el estado", sent.order.status === "PENDING_CUSTOMER");
  const accepted = await recordQuoteChangeOrderCustomerDecision(prisma, requesterContext, {
    id: created.order.id, expectedVersion: 3, requestId: `accept-main-${run}`, decision: "ACCEPTED",
    customerActor: "Cliente sintético", method: "DOCUMENT", evidenceRefs: [{ assetId: "synthetic-proof", token: "secret" }],
  });
  check("aceptación exige evidencia y guarda hash", accepted.order.status === "ACCEPTED" && accepted.order.customer_acceptance_hash.length === 64 && accepted.order.evidence_refs_json[0].token === "[REDACTED]");
  const executed = await executeQuoteChangeOrder(prisma, requesterContext, {
    id: created.order.id, expectedVersion: 4, requestId: `execute-main-${run}`, currentBaseQuoteSnapshot: baseSnapshot,
  });
  check("ejecución idempotente llega a terminal", executed.order.status === "EXECUTED");
  const executedRetry = await executeQuoteChangeOrder(prisma, requesterContext, {
    id: created.order.id, expectedVersion: 4, requestId: `execute-main-${run}`, currentBaseQuoteSnapshot: baseSnapshot,
  });
  check("segunda ejecución devuelve resultado existente", executedRetry.idempotent && executedRetry.order.status === "EXECUTED");

  const changedBase = await createQuoteChangeOrder(prisma, requesterContext, createInput("base-change", "100.00"));
  const changedSubmit = await submitQuoteChangeOrder(prisma, requesterContext, { id: changedBase.order.id, expectedVersion: 1, requestId: `submit-base-change-${run}` });
  const changedSent = await sendQuoteChangeOrderToCustomer(prisma, requesterContext, { id: changedBase.order.id, expectedVersion: changedSubmit.order.row_version, requestId: `send-base-change-${run}` });
  await recordQuoteChangeOrderCustomerDecision(prisma, requesterContext, { id: changedBase.order.id, expectedVersion: changedSent.order.row_version, requestId: `accept-base-change-${run}`, decision: "ACCEPTED", customerActor: "Cliente", method: "DOCUMENT", evidenceRefs: [{ assetId: "proof" }] });
  await expectError("snapshot base modificado impide ejecutar", () => executeQuoteChangeOrder(prisma, requesterContext, { id: changedBase.order.id, expectedVersion: 4, requestId: `exec-base-change-${run}`, currentBaseQuoteSnapshot: { ...baseSnapshot, total: "100001.00" } }), "CHANGE_ORDER_BASE_CHANGED");

  const riskChanged = await createQuoteChangeOrder(prisma, requesterContext, createInput("risk-change", "25.00", {
    riskFactorChanges: ["distance", "route"], riskSnapshot: { hubDistanceKm: 90, transportDistanceKm: 85, marginPercent: 20, flags: [] },
  }));
  check("cambio material de riesgo fuerza reevaluación LEGACY_ONLY", riskChanged.order.risk_recheck_required && riskChanged.order.risk_snapshot_json.operationMode === "LEGACY_ONLY" && riskChanged.order.risk_snapshot_json.persisted === false);
  await expectError("excepción de otra evaluación no se reutiliza", () => createQuoteChangeOrder(prisma, requesterContext, createInput("override-mismatch", "25.00", {
    riskFactorChanges: ["distance"], riskSnapshot: { hubDistanceKm: 91 }, logisticOverrideId: `missing-override-${run}`,
  })), "LOGISTIC_OVERRIDE_NOT_FOUND");

  const reduced = await createQuoteChangeOrder(prisma, requesterContext, createInput("reduction-tax", "0", {
    items: [{ lineKey: "discounted-line", changeKind: "MODIFIED", classification: "DISCOUNT", description: "Corrección de precio", previousLineTotal: "1000.00", newLineTotal: "900.00" }],
    taxAmount: "18.00",
  }));
  check("reducciones e impuestos reconcilian en Decimal", reduced.order.reduction_amount === "100" && reduced.order.tax_amount === "18" && reduced.order.new_total === "99918");
  check("reducción excepcional exige aprobación", reduced.order.approval_reasons_json.includes("EXCEPTIONAL_DISCOUNT"));

  const concurrentExecutionSource = await createQuoteChangeOrder(prisma, requesterContext, createInput("execute-concurrent", "25.00", { customerAcceptanceRequired: false }));
  const concurrentExecutionSubmitted = await submitQuoteChangeOrder(prisma, requesterContext, { id: concurrentExecutionSource.order.id, expectedVersion: 1, requestId: `submit-exec-concurrent-${run}` });
  const concurrentExecutions = await Promise.allSettled([
    executeQuoteChangeOrder(prisma, requesterContext, { id: concurrentExecutionSource.order.id, expectedVersion: concurrentExecutionSubmitted.order.row_version, requestId: `exec-concurrent-${run}`, currentBaseQuoteSnapshot: baseSnapshot }),
    executeQuoteChangeOrder(prisma, requesterContext, { id: concurrentExecutionSource.order.id, expectedVersion: concurrentExecutionSubmitted.order.row_version, requestId: `exec-concurrent-${run}`, currentBaseQuoteSnapshot: baseSnapshot }),
  ]);
  const fulfilledExecution = concurrentExecutions.find((entry) => entry.status === "fulfilled");
  const executionCommands = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."quote_change_order_commands" WHERE "tenant_id"=$1 AND "change_order_id"=$2 AND "command"='EXECUTE'`, t1, concurrentExecutionSource.order.id);
  check("dos ejecuciones simultáneas producen una ejecución", Boolean(fulfilledExecution) && fulfilledExecution.value.order.status === "EXECUTED" && executionCommands[0].count === 1);

  const overCap = await createQuoteChangeOrder(prisma, requesterContext, createInput("over-cap", "6000.00"));
  check("acumulado superior a 15% exige aprobación", overCap.order.requires_approval && overCap.order.approval_reasons_json.includes("CAP_EXCEEDED"));
  const pending = await submitQuoteChangeOrder(prisma, requesterContext, { id: overCap.order.id, expectedVersion: 1, requestId: `submit-over-${run}`, assignedApproverMembershipId: approver.membershipId });
  check("ApprovalRequest creada en la misma transición", pending.order.status === "PENDING_APPROVAL" && pending.order.approval_request_id);
  await expectError("separación de funciones", () => decideQuoteChangeOrderApproval(prisma, requesterContext, {
    id: overCap.order.id, expectedVersion: 2, approvalExpectedVersion: 1, decision: "APPROVED", reason: "Self", requestId: `self-decide-${run}`,
  }), "APPROVAL_NOT_ASSIGNED");
  const decisions = await Promise.allSettled([
    decideQuoteChangeOrderApproval(prisma, approverContext, { id: overCap.order.id, expectedVersion: 2, approvalExpectedVersion: 1, decision: "APPROVED", reason: "Autorizado", requestId: `decide-over-${run}` }),
    decideQuoteChangeOrderApproval(prisma, approverContext, { id: overCap.order.id, expectedVersion: 2, approvalExpectedVersion: 1, decision: "APPROVED", reason: "Autorizado", requestId: `decide-over-${run}` }),
  ]);
  const fulfilledDecision = decisions.find((entry) => entry.status === "fulfilled");
  const finalDecisionRows = await prisma.$queryRawUnsafe(`SELECT "status"::text AS status,COUNT(*) OVER()::int AS count FROM "osi"."quote_change_orders" WHERE "tenant_id"=$1 AND "id"=$2`, t1, overCap.order.id);
  check("dos decisores concurrentes producen una decisión", Boolean(fulfilledDecision) && finalDecisionRows[0].status === "APPROVED" && finalDecisionRows[0].count === 1);
  check("la aprobación queda ligada a versión y hash", fulfilledDecision.value.order.status === "APPROVED");

  const wrongHash = await createQuoteChangeOrder(prisma, requesterContext, createInput("wrong-approval-hash", "100.00", { contractuallySensitive: true }));
  const wrongHashPending = await submitQuoteChangeOrder(prisma, requesterContext, { id: wrongHash.order.id, expectedVersion: 1, requestId: `submit-wrong-hash-${run}`, assignedApproverMembershipId: approver.membershipId });
  await prisma.$executeRawUnsafe(`UPDATE "osi"."approval_requests" SET "evaluation_snapshot_json"=jsonb_set("evaluation_snapshot_json",'{changeOrderHash}','"wrong"'),"version"="version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=$1`, wrongHashPending.order.approval_request_id);
  await expectError("aprobación de otro hash es rechazada", () => decideQuoteChangeOrderApproval(prisma, approverContext, { id: wrongHash.order.id, expectedVersion: 2, approvalExpectedVersion: 1, decision: "APPROVED", reason: "No debe aplicar", requestId: `decide-wrong-hash-${run}` }), "CHANGE_ORDER_APPROVAL_SCOPE_MISMATCH");

  const revisionSource = await createQuoteChangeOrder(prisma, requesterContext, createInput("revision-source", "500.00"));
  const revision = await reviseQuoteChangeOrder(prisma, requesterContext, {
    id: revisionSource.order.id, expectedVersion: 1, requestId: `revise-${run}`, pipelineCaseId: caseId, baseQuoteId: quoteId,
    baseQuoteVersion: 1, baseQuoteSnapshot: baseSnapshot, baseApprovedTotal: "100000", previousSubtotal: "100000", previousTotal: "100000", taxAmount: "0",
    reason: "Corrección material", description: "Versión corregida", items: [item("750.00", "revision-line")],
  });
  check("modificación material crea versión nueva", revision.order.version === 2 && revision.order.previous_version_id === revisionSource.order.id && revision.superseded.status === "SUPERSEDED");
  const currentVersions = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."quote_change_orders" WHERE "tenant_id"=$1 AND "series_id"=$2 AND "is_current"`, t1, revision.order.series_id);
  check("sólo una versión queda vigente", currentVersions[0].count === 1);
  await expectError("versión sustituida es inmutable", () => cancelQuoteChangeOrder(prisma, requesterContext, { id: revisionSource.order.id, expectedVersion: 2, reason: "No", requestId: `cancel-old-${run}` }), "CHANGE_ORDER_FINAL_IMMUTABLE");

  const concurrentRevisionSource = await createQuoteChangeOrder(prisma, requesterContext, createInput("revision-race", "100.00"));
  const revisionCommand = (suffix, amount) => reviseQuoteChangeOrder(prisma, requesterContext, {
    id: concurrentRevisionSource.order.id, expectedVersion: 1, requestId: `revision-race-${suffix}-${run}`, pipelineCaseId: caseId, baseQuoteId: quoteId,
    baseQuoteVersion: 1, baseQuoteSnapshot: baseSnapshot, baseApprovedTotal: "100000", previousSubtotal: "100000", previousTotal: "100000", taxAmount: "0",
    reason: `Race ${suffix}`, description: `Race ${suffix}`, items: [item(amount, `race-${suffix}`)],
  });
  const revisionRace = await Promise.allSettled([revisionCommand("a", "110.00"), revisionCommand("b", "120.00")]);
  check("dos versiones no pueden quedar vigentes", revisionRace.filter((entry) => entry.status === "fulfilled").length === 1);
  const revisionRaceCurrent = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."quote_change_orders" WHERE "tenant_id"=$1 AND "series_id"=$2 AND "is_current"`, t1, concurrentRevisionSource.order.series_id);
  check("restricción parcial conserva una versión actual", revisionRaceCurrent[0].count === 1);

  const cancelSource = await createQuoteChangeOrder(prisma, requesterContext, createInput("cancel", "50.00"));
  const cancelled = await cancelQuoteChangeOrder(prisma, requesterContext, { id: cancelSource.order.id, expectedVersion: 1, reason: "Retirada", requestId: `cancel-${run}` });
  check("cancelación terminal", cancelled.order.status === "CANCELLED");
  await expectError("estado final no cambia", () => cancelQuoteChangeOrder(prisma, requesterContext, { id: cancelSource.order.id, expectedVersion: 2, reason: "Otra", requestId: `cancel-again-${run}` }), "CHANGE_ORDER_FINAL_IMMUTABLE");
  const expiredSource = await createQuoteChangeOrder(prisma, requesterContext, createInput("expired", "50.00", { expiresAt: new Date(Date.now() - 1000).toISOString() }));
  const expired = await expireQuoteChangeOrder(prisma, requesterContext, { id: expiredSource.order.id, expectedVersion: 1, reason: "Venció", requestId: `expire-${run}` });
  check("vencimiento terminal", expired.order.status === "EXPIRED");

  const rollbackRequest = `audit-fail-${run}`;
  await expectError("fallo de auditoría crítica revierte creación", () => createQuoteChangeOrder(prisma, requesterContext, createInput("audit-fail", "10.00", { requestId: rollbackRequest }), { auditWriter: async () => { throw new Error("SYNTHETIC_AUDIT_FAILURE"); } }));
  const rolledBack = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."quote_change_orders" WHERE "tenant_id"=$1 AND "request_id"=$2`, t1, rollbackRequest);
  check("auditoría fallida no deja orden", rolledBack[0].count === 0);
  await expectError("partidas son append-only", () => prisma.$executeRawUnsafe(`UPDATE "osi"."quote_change_order_items" SET "description"='mutated' WHERE "id"=$1`, created.order.items[0].id));

  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."quote_addendums"("id","quote_id","base_version","addendum_number","description","amount_delta","currency","base_approved_amount","cap_percent","acceptance_json","evidence_json","created_by") VALUES
      ('legacy-ok-${run}','${quoteId}',1,90,'Convertible',1000,'DOP',100000,15,'{"acceptedBy":"Synthetic"}','[{"assetId":"proof"}]','synthetic'),
      ('legacy-incomplete-${run}','${quoteId}',1,91,'Incomplete',1000,'DOP',100000,15,NULL,'[]','synthetic'),
      ('legacy-conflict-${run}','${quoteId}',1,92,'Conflict',20000,'DOP',100000,15,'{"acceptedBy":"Synthetic"}','[{"assetId":"proof"}]','synthetic'),
      ('legacy-ambiguous-${run}','unknown-${run}',1,93,'Ambiguous',1000,'DOP',100000,15,'{"acceptedBy":"Synthetic"}','[{"assetId":"proof"}]','synthetic'),
      ('legacy-dup-a-${run}','${quoteId}',1,94,'Duplicate A',1000,'DOP',100000,15,'{"acceptedBy":"Synthetic"}','[{"assetId":"proof"}]','synthetic'),
      ('legacy-dup-b-${run}','${quoteId}',1,94,'Duplicate B',1000,'DOP',100000,15,'{"acceptedBy":"Synthetic"}','[{"assetId":"proof"}]','synthetic')
  `);
  const dryRun = await analyzeHistoricalChangeOrders(prisma);
  check("dry-run no escribe y clasifica cinco grupos", !dryRun.writesPerformed && dryRun.totals.AUTOMATICALLY_CONVERTIBLE >= 1 && dryRun.totals.AMBIGUOUS >= 1 && dryRun.totals.INCOMPLETE >= 1 && dryRun.totals.DUPLICATE >= 2 && dryRun.totals.CONFLICTIVE >= 1);

  const performanceCount = 2000;
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."quote_change_orders"(
      "id","tenant_id","pipeline_case_id","base_quote_id","base_quote_version","base_quote_hash","base_quote_snapshot_json","series_id","code","sequence_number","version",
      "change_type","classification","contract_stage","reason","description","currency","previous_subtotal","increment_amount","reduction_amount","tax_amount","previous_total","new_total","variation_amount","variation_percent",
      "policy_id","policy_snapshot_json","cap_amount","cumulative_increase","requires_approval","approval_reasons_json","risk_factor_changes_json","evidence_refs_json","requested_by_user_id","requested_by_membership_id","request_id","payload_hash"
    ) SELECT
      'perf-${run}-'||g,'${t1}','${caseId}','${quoteId}',1,repeat('a',64),'{}','perf-series-${run}-'||g,'PERF-${run}-'||g,1000000+g,1,
      'ADDENDUM','PERF','ACCEPTED','Synthetic','Performance','DOP',100000,0,0,0,100000,100000,0,0,
      '${policy.policy.id}','{}',15000,0,false,'[]','[]','[]','${actor.userId}','${actor.membershipId}','perf-request-${run}-'||g,repeat('b',64)
    FROM generate_series(1,${performanceCount}) g
  `);
  const started = performance.now();
  const page = await listQuoteChangeOrders(prisma, requesterContext, { limit: 100 });
  const elapsed = performance.now() - started;
  check("paginación obligatoria", page.items.length === 100 && page.nextCursor);
  check("rendimiento con 2,000 sintéticos", elapsed < 1500, `${elapsed.toFixed(2)} ms`);

  const afterQuote = await prisma.$queryRawUnsafe(`SELECT * FROM "osi"."osi_pipeline_case_quotes" WHERE "id"=$1`, quoteId);
  check("cotización original no cambia", JSON.stringify(beforeQuote) === JSON.stringify(afterQuote));
  const audits = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "entity"='QUOTE_CHANGE_ORDER'`, t1);
  check("operaciones críticas auditadas", audits[0].count >= 10);
  return { passed: results.length, failed: 0, results, performance: { records: performanceCount, pageMs: Number(elapsed.toFixed(2)) }, dryRun: dryRun.totals };
}

try {
  const report = await main();
  if (process.env.DB01G_RESULTS_PATH) await writeFile(process.env.DB01G_RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
