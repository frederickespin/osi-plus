/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import { APPROVAL_PERMISSIONS } from "../api/_lib/approvalRequest.js";
import {
  LOGISTIC_OVERRIDE_PERMISSIONS,
  createLogisticOverrideRequest,
  decideLogisticOverride,
  transitionLogisticOverride,
  validateLogisticOverride,
} from "../api/_lib/logisticOverrideApproval.js";
import {
  RISK_PERMISSIONS,
  activateRiskRule,
  approveRiskRule,
  createRiskRule,
  evaluateRisk,
  getRiskEngineMode,
  retireRiskRule,
  setRiskEngineMode,
  startRiskRuleShadow,
} from "../api/_lib/riskEngine.js";
import { analyzeLegacyRiskRules } from "./db01f-dry-run.mjs";
import { createDb01fPrisma } from "./db01f-lib.mjs";

const prisma = createDb01fPrisma();
const results = [];
const run = Date.now().toString(36);
const runCode = run.toUpperCase();

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
  ...Object.values(APPROVAL_PERMISSIONS),
  ...Object.values(RISK_PERMISSIONS),
  ...Object.values(LOGISTIC_OVERRIDE_PERMISSIONS),
  "commercial:audit:view",
])];
const t1 = `db01f-t1-${run}`;
const t2 = `db01f-t2-${run}`;
const requester = { userId: `db01f-requester-${run}`, membershipId: `db01f-m-requester-${run}` };
const approver = { userId: `db01f-approver-${run}`, membershipId: `db01f-m-approver-${run}` };
const otherApprover = { userId: `db01f-other-${run}`, membershipId: `db01f-m-other-${run}` };
const tenantTwoActor = { userId: requester.userId, membershipId: `db01f-m-t2-${run}` };

function context(tenantId, actorMembershipId, granted = permissions) {
  return { tenantId, actorKind: "MEMBERSHIP", actorMembershipId, permissions: granted };
}

const requesterContext = context(t1, requester.membershipId);
const approverContext = context(t1, approver.membershipId);
const tenantTwoContext = context(t2, tenantTwoActor.membershipId);
const systemContext = { tenantId: t1, actorKind: "SYSTEM" };

async function seed() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_users"
      ("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt")
    VALUES
      ('${requester.userId}','DB01F-R-${run}','Synthetic Requester','${run}.requester@example.invalid','+10000000001','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approver.userId}','DB01F-A-${run}','Synthetic Approver','${run}.approver@example.invalid','+10000000002','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${otherApprover.userId}','DB01F-O-${run}','Synthetic Other','${run}.other@example.invalid','+10000000003','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants" ("id","code","name","legal_name","status","provisioning_source","updated_at") VALUES
      ('${t1}','DB01F-T1-${runCode}','DB-01F Tenant One','Synthetic One','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${t2}','DB01F-T2-${runCode}','DB-01F Tenant Two','Synthetic Two','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  const permissionSql = permissions.map((permission) => `'${permission}'`).join(",");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"
      ("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at") VALUES
      ('${requester.membershipId}','${t1}','${requester.userId}','V','ACTIVE',ARRAY[${permissionSql}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approver.membershipId}','${t1}','${approver.userId}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${otherApprover.membershipId}','${t1}','${otherApprover.userId}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${tenantTwoActor.membershipId}','${t2}','${tenantTwoActor.userId}','V','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP)
  `);
}

function distanceRule(sequence, thresholdKm, result = "BLOCKED", code = `DISTANCE_${sequence}`) {
  return {
    code: `${code}_${run}`,
    name: `Distance rule ${sequence}`,
    description: "Synthetic DB-01F rule",
    priority: 10,
    conditionType: "DISTANCE_OVER_KM",
    conditionConfig: { field: "hubDistanceKm", thresholdKm },
    result,
    requestId: `rule-${sequence}-${run}`,
  };
}

async function prepareShadowRule(sequence, thresholdKm, result = "BLOCKED", code) {
  const created = await createRiskRule(prisma, requesterContext, distanceRule(sequence, thresholdKm, result, code));
  const shadow = await startRiskRuleShadow(prisma, requesterContext, {
    id: created.rule.id, expectedVersion: created.rule.rowVersion, requestId: `shadow-${sequence}-${run}`,
  });
  return { created, shadow };
}

function evaluationInput(sequence, distance = 125, extra = {}) {
  return {
    entity: "QUOTE", entityId: `quote-${sequence}-${run}`, caseId: `case-${sequence}-${run}`,
    quoteId: `quote-${sequence}-${run}`, quoteVersion: 1,
    snapshot: { hubDistanceKm: distance, transportDistanceKm: distance - 5, marginPercent: 20, flags: [] },
    requestId: `evaluation-${sequence}-${run}`,
    ...extra,
  };
}

try {
  await seed();
  const defaultMode = await getRiskEngineMode(prisma, systemContext);
  check("modo inicial LEGACY_ONLY", defaultMode.mode === "LEGACY_ONLY");
  const legacyOnlyEval = await evaluateRisk(prisma, systemContext, evaluationInput("legacy"));
  check("LEGACY_ONLY no persiste ni bloquea", !legacyOnlyEval.persisted && !legacyOnlyEval.blocking);
  await expectError("ENFORCED permanece deshabilitado", () => setRiskEngineMode(prisma, approverContext, { mode: "ENFORCED", requestId: `mode-enforced-${run}` }), "RISK_ENFORCEMENT_DISABLED");
  await setRiskEngineMode(prisma, approverContext, { mode: "SHADOW", requestId: `mode-shadow-${run}` });

  await expectError("RBAC impide crear reglas", () => createRiskRule(prisma, {
    ...requesterContext, deniedPermissions: [RISK_PERMISSIONS.MANAGE],
  }, distanceRule("forbidden", 90)), "RISK_FORBIDDEN");
  const deniedAudit = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "action"='RISK_RULE_CREATE_UNAUTHORIZED'`, t1);
  check("intento RBAC denegado queda auditado", deniedAudit[0].count === 1);

  const { created: baseCreated, shadow: baseShadow } = await prepareShadowRule("base", 80, "BLOCKED");
  check("versión inicia DRAFT y pasa a SHADOW", baseCreated.rule.state === "DRAFT" && baseShadow.rule.state === "SHADOW");
  const sameRule = await createRiskRule(prisma, requesterContext, distanceRule("base", 80));
  check("creación de regla idempotente", sameRule.idempotent && sameRule.rule.id === baseCreated.rule.id);
  await expectError("requestId de regla con payload distinto", () => createRiskRule(prisma, requesterContext, { ...distanceRule("base", 81), requestId: baseCreated.rule.requestId }), "RISK_IDEMPOTENCY_CONFLICT");
  await expectError("creador no aprueba su propia regla", () => approveRiskRule(prisma, requesterContext, { id: baseCreated.rule.id, expectedVersion: baseShadow.rule.rowVersion, requestId: `approve-self-${run}` }), "RISK_SEPARATION_OF_DUTIES");
  const baseApproved = await approveRiskRule(prisma, approverContext, { id: baseCreated.rule.id, expectedVersion: baseShadow.rule.rowVersion, requestId: `approve-base-${run}` });
  check("regla aprobada conserva SHADOW", baseApproved.rule.state === "SHADOW" && baseApproved.rule.approvedAt);

  const blocked = await evaluateRisk(prisma, systemContext, evaluationInput("blocked"));
  check("SHADOW calcula BLOCKED sin bloquear", blocked.evaluation.result === "BLOCKED" && blocked.wouldBlock && !blocked.blocking);
  const blockedRepeat = await evaluateRisk(prisma, systemContext, evaluationInput("blocked"));
  check("evaluación repetida es idempotente", blockedRepeat.idempotent && blockedRepeat.evaluation.id === blocked.evaluation.id);
  await expectError("evaluación requestId con otro snapshot entra en conflicto", () => evaluateRisk(prisma, systemContext, evaluationInput("blocked", 130)), "RISK_IDEMPOTENCY_CONFLICT");
  const evaluationRows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."risk_evaluation_rules" WHERE "tenant_id"=$1 AND "evaluation_id"=$2`, t1, blocked.evaluation.id);
  check("evaluación conserva reglas y versiones", evaluationRows[0].count >= 1 && blocked.evaluation.rulesSnapshot[0].hash.length === 64);

  await expectError("tenant ajeno no puede usar evaluación", () => createLogisticOverrideRequest(prisma, tenantTwoContext, {
    riskEvaluationId: blocked.evaluation.id, blockingRuleId: baseCreated.rule.id, businessReason: "Cross tenant",
    validTo: new Date(Date.now() + 3600000), requestId: `cross-${run}`,
  }), "LOGISTIC_OVERRIDE_NOT_FOUND");

  const override = await createLogisticOverrideRequest(prisma, requesterContext, {
    riskEvaluationId: blocked.evaluation.id, blockingRuleId: baseCreated.rule.id,
    businessReason: "Excepción administrativa sintética", originalValue: { distance: 125 }, authorizedValue: { maximumDistance: 130 },
    scope: { factorsAuthorized: ["hubDistanceKm"] }, evidence: [{ type: "NOTE", token: "secret-value" }],
    validTo: new Date(Date.now() + 3600000), assignedApproverMembershipId: approver.membershipId,
    requestId: `override-main-${run}`,
  });
  check("excepción es extensión 1:1 de ApprovalRequest", override.override.approvalRequestId === override.approval.id);
  check("evidencia sensible queda sanitizada", override.override.evidence[0].token === "[REDACTED]");
  await expectError("separación de funciones en excepción", () => decideLogisticOverride(prisma, requesterContext, {
    id: override.override.id, decision: "APPROVED", reason: "Self approval", expectedVersion: 1, requestId: `override-self-${run}`,
  }), "APPROVAL_NOT_ASSIGNED");

  const concurrentDecisions = await Promise.allSettled([
    decideLogisticOverride(prisma, approverContext, { id: override.override.id, decision: "APPROVED", reason: "Valid", expectedVersion: 1, requestId: `override-decision-${run}` }),
    decideLogisticOverride(prisma, approverContext, { id: override.override.id, decision: "APPROVED", reason: "Valid", expectedVersion: 1, requestId: `override-decision-${run}` }),
  ]);
  check("decisiones concurrentes producen una sola decisión final", concurrentDecisions.filter((item) => item.status === "fulfilled").length >= 1);
  const approvedRetry = await decideLogisticOverride(prisma, approverContext, { id: override.override.id, decision: "APPROVED", reason: "Valid", expectedVersion: 1, requestId: `override-decision-${run}` });
  check("reintento de decisión devuelve decisión existente", approvedRetry.override.approvalStatus === "APPROVED");
  const valid = await validateLogisticOverride(prisma, approverContext, {
    id: override.override.id, entity: blocked.evaluation.entity, entityId: blocked.evaluation.entityId,
    caseId: blocked.evaluation.caseId, quoteId: blocked.evaluation.quoteId, quoteVersion: blocked.evaluation.quoteVersion,
    materialHash: blocked.evaluation.materialHash,
  });
  check("excepción aprobada desbloquea solamente alcance exacto", valid.valid && valid.override.decisionHash?.length === 64);
  const changed = await validateLogisticOverride(prisma, approverContext, {
    id: override.override.id, entity: blocked.evaluation.entity, entityId: blocked.evaluation.entityId,
    caseId: blocked.evaluation.caseId, quoteId: blocked.evaluation.quoteId, quoteVersion: 2,
    materialHash: "a".repeat(64), requestId: `reuse-${run}`,
  });
  check("cambio material exige nueva evaluación", !changed.valid && changed.reason === "SCOPE_MISMATCH");

  const rejectEval = await evaluateRisk(prisma, systemContext, evaluationInput("reject"));
  const rejectRequest = await createLogisticOverrideRequest(prisma, requesterContext, {
    riskEvaluationId: rejectEval.evaluation.id, blockingRuleId: baseCreated.rule.id, businessReason: "Reject",
    validTo: new Date(Date.now() + 3600000), requestId: `override-reject-${run}`,
  });
  const rejected = await decideLogisticOverride(prisma, approverContext, { id: rejectRequest.override.id, decision: "REJECTED", reason: "No procede", expectedVersion: 1, requestId: `reject-decision-${run}` });
  check("excepción rechazada no desbloquea", rejected.override.approvalStatus === "REJECTED");

  const cancelEval = await evaluateRisk(prisma, systemContext, evaluationInput("cancel"));
  const cancelRequest = await createLogisticOverrideRequest(prisma, requesterContext, {
    riskEvaluationId: cancelEval.evaluation.id, blockingRuleId: baseCreated.rule.id, businessReason: "Cancel",
    validTo: new Date(Date.now() + 3600000), requestId: `override-cancel-${run}`,
  });
  const cancelled = await transitionLogisticOverride(prisma, requesterContext, { id: cancelRequest.override.id, reason: "Retirada", expectedVersion: 1, requestId: `cancel-decision-${run}` }, "CANCELLED");
  check("excepción cancelada usa estado base", cancelled.override.approvalStatus === "CANCELLED");

  const expireEval = await evaluateRisk(prisma, systemContext, evaluationInput("expire"));
  const expireRequest = await createLogisticOverrideRequest(prisma, requesterContext, {
    riskEvaluationId: expireEval.evaluation.id, blockingRuleId: baseCreated.rule.id, businessReason: "Expire",
    validTo: new Date(Date.now() + 3600000), requestId: `override-expire-${run}`,
  });
  const expired = await transitionLogisticOverride(prisma, systemContext, { id: expireRequest.override.id, reason: "Vencimiento", expectedVersion: 1, requestId: `expire-decision-${run}` }, "EXPIRED");
  check("excepción vencida usa estado base", expired.override.approvalStatus === "EXPIRED");

  const conflictA = await prepareShadowRule("conflict-a", 67, "REVIEW_REQUIRED", "CONFLICT_A");
  const conflictB = await prepareShadowRule("conflict-b", 67, "BLOCKED", "CONFLICT_B");
  const approvedA = await approveRiskRule(prisma, approverContext, { id: conflictA.created.rule.id, expectedVersion: conflictA.shadow.rule.rowVersion, requestId: `approve-ca-${run}` });
  const approvedB = await approveRiskRule(prisma, approverContext, { id: conflictB.created.rule.id, expectedVersion: conflictB.shadow.rule.rowVersion, requestId: `approve-cb-${run}` });
  const activations = await Promise.allSettled([
    activateRiskRule(prisma, approverContext, { id: approvedA.rule.id, expectedVersion: approvedA.rule.rowVersion, requestId: `activate-ca-${run}` }),
    activateRiskRule(prisma, approverContext, { id: approvedB.rule.id, expectedVersion: approvedB.rule.rowVersion, requestId: `activate-cb-${run}` }),
  ]);
  check("activación simultánea impide reglas contradictorias", activations.filter((item) => item.status === "fulfilled").length === 1 && activations.filter((item) => item.status === "rejected").length === 1);

  await expectError("versión de regla no admite edición directa", () => prisma.$executeRawUnsafe(
    `UPDATE "osi"."risk_engine_rules" SET "priority"=999 WHERE "tenant_id"=$1 AND "id"=$2`, t1, baseCreated.rule.id,
  ));
  const beforeRetireEval = await evaluateRisk(prisma, systemContext, evaluationInput("before-retire"));
  const retired = await retireRiskRule(prisma, approverContext, { id: baseCreated.rule.id, expectedVersion: baseApproved.rule.rowVersion, requestId: `retire-base-${run}` });
  check("retiro conserva evaluación histórica inmutable", retired.rule.state === "RETIRED" && beforeRetireEval.evaluation.rulesSnapshot.some((rule) => rule.id === baseCreated.rule.id));

  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "osi"."db01f_fail_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."action"='RISK_RULE_CREATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "db01f_fail_audit_trigger" BEFORE INSERT ON "osi"."commercial_audit_logs"
    FOR EACH ROW EXECUTE FUNCTION "osi"."db01f_fail_audit"()`);
  try {
    await expectError("fallo de auditoría crítica revierte la regla", () => createRiskRule(prisma, requesterContext, distanceRule("audit-fail", 333)));
    const rolledBack = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."risk_engine_rules" WHERE "tenant_id"=$1 AND "code"=$2`, t1, `DISTANCE_AUDIT-FAIL_${run}`);
    check("transacción empresarial quedó revertida", rolledBack[0].count === 0);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "db01f_fail_audit_trigger" ON "osi"."commercial_audit_logs"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi"."db01f_fail_audit"()`);
  }

  const dryRun = await analyzeLegacyRiskRules();
  check("dry-run no importa reglas", dryRun.mode === "DRY_RUN_ONLY" && !dryRun.importPerformed);
  check("dry-run detecta umbrales heredados", dryRun.thresholds.reviewKm === 80 && dryRun.thresholds.blockKm === 120);
  check("dry-run marca ajuste SLA sin consumidor", dryRun.unconvertible.some((item) => item.source === "riskRules.autoExtendedSla"));
  check("dry-run compara motor antiguo y candidato", dryRun.comparison.length === 4);

  const start = performance.now();
  const volume = 120;
  for (let index = 0; index < volume; index += 1) {
    await evaluateRisk(prisma, systemContext, evaluationInput(`perf-${index}`, 40 + (index % 120)));
  }
  const elapsedMs = Math.round(performance.now() - start);
  check("volumen sintético significativo", volume >= 100, `${volume} evaluaciones en ${elapsedMs} ms`);

  const crossFk = await expectError("FK compuesta rechaza evaluación cruzada", () => prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."risk_evaluation_rules"
      ("tenant_id","evaluation_id","rule_id","rule_code","rule_version","rule_hash","matched","result","reasons_json")
    VALUES ($1,$2,$3,'CROSS',1,repeat('a',64),true,'BLOCKED','[]')
  `, t2, blocked.evaluation.id, baseCreated.rule.id));
  check("aislamiento reforzado por base de datos", Boolean(crossFk));

  const auditCounts = await prisma.$queryRawUnsafe(`SELECT "action", COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "source" LIKE 'DB01F%' GROUP BY "action"`, t1);
  check("acciones críticas DB-01F quedaron auditadas", auditCounts.some((row) => row.action === "RISK_EVALUATION_EXECUTED") && auditCounts.some((row) => row.action === "LOGISTIC_OVERRIDE_APPROVED"));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results, performance: { evaluations: volume, elapsedMs } }, null, 2));
} finally {
  await prisma.$disconnect();
}
