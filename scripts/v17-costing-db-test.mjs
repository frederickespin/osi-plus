import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { costingHash } from "../api/_lib/costingContract.js";
import { authorizeCostingMargin, calculateCosting, createCostingOverride, listCostingRules, publishCosting, versionCostingExchangeRate, versionCostingRule } from "../api/_lib/costingDomain.js";
import { canonicalHash as logisticsHash } from "../api/_lib/logisticsEngineContract.js";
import { calculateLogistics, publishLogistics, versionLogisticsRule } from "../api/_lib/logisticsEngineDomain.js";

const raw = process.env.V17_COSTING_TEST_DATABASE_URL || process.env.DATABASE_URL;
assert.ok(raw, "V17_COSTING_TEST_DATABASE_URL requerida");
const url = new URL(raw);
assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Sólo PostgreSQL local");
const canonicalCi = process.env.CANONICAL_DB_VALIDATION === "true" && url.hostname === "127.0.0.1" && url.port === "55432" && url.pathname === "/osi_db01n_ci";
assert.ok(/costing/i.test(url.pathname) || canonicalCi, "Base Costing aislada o CI canónica requerida");
assert.equal(url.searchParams.get("schema"), "osi");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
try {
  const migrations = await prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM "osi"."_prisma_migrations" ORDER BY started_at`;
  assert.equal(migrations.length, 28); assertions += 1;
  check(migrations.every((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1), "Migraciones incompletas");
  assert.equal(migrations.at(-1).migration_name, "20260909010000_v17_costing"); assertions += 1;
  const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='osi' AND table_name LIKE 'costing_%' ORDER BY table_name`;
  assert.deepEqual(tables.map((row) => row.table_name), ["costing_calculations", "costing_exchange_rates", "costing_issues", "costing_lines", "costing_margin_authorizations", "costing_mutation_commands", "costing_overrides", "costing_revisions", "costing_rules"]); assertions += 1;
  const triggers = await prisma.$queryRaw`SELECT event_object_table AS table_name, trigger_name FROM information_schema.triggers WHERE trigger_schema='osi' AND event_object_table LIKE 'costing_%' ORDER BY event_object_table, trigger_name`;
  for (const table of ["costing_calculations", "costing_revisions", "costing_lines", "costing_overrides", "costing_margin_authorizations", "costing_mutation_commands"]) check(triggers.some((row) => row.table_name === table && row.trigger_name.includes("append_only")), `Trigger append-only ausente: ${table}`);
  check(triggers.some((row) => row.table_name === "costing_issues" && row.trigger_name === "costing_issues_resolution_only"), "Issues no son resolution-only");
  check(triggers.some((row) => row.table_name === "costing_rules" && row.trigger_name === "costing_rules_identity_immutable"), "Reglas sin identidad inmutable");
  check(triggers.some((row) => row.table_name === "costing_exchange_rates" && row.trigger_name === "costing_exchange_rates_identity_immutable"), "Tasas sin identidad inmutable");
  const constraints = await prisma.$queryRaw`SELECT conname, contype FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='osi' AND conname LIKE 'costing_%' ORDER BY conname`;
  for (const name of ["costing_rules_no_equal_conflict", "costing_exchange_rates_no_overlap", "costing_rules_values_check", "costing_rules_period_check", "costing_exchange_rates_values_check", "costing_lines_values_check", "costing_issues_resolution_check"]) check(constraints.some((row) => row.conname === name), `Constraint ausente: ${name}`);
  const tenantFks = constraints.filter((row) => row.contype === "f").length;
  check(tenantFks >= 25, `FK tenant-first insuficientes: ${tenantFks}`);
  const indexes = await prisma.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='osi' AND tablename LIKE 'costing_%'`;
  for (const name of ["costing_rules_resolve_idx", "costing_exchange_rates_resolve_idx", "costing_revisions_case_revision_key", "costing_lines_position_key", "costing_commands_tenant_request_key"]) check(indexes.some((row) => row.indexname === name), `Índice ausente: ${name}`);
  check(indexes.some((row) => row.indexdef.includes("tenant_id") && row.indexdef.includes("revision_ref")), "Lookup tenant-first de revisiones ausente");
  const enumRows = await prisma.$queryRaw`SELECT t.typname, COUNT(*)::int AS values FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='osi' AND t.typname LIKE 'Costing%' GROUP BY t.typname ORDER BY t.typname`;
  assert.equal(enumRows.find((row) => row.typname === "CostingFamily")?.values, 13); assertions += 1;
  assert.equal(enumRows.find((row) => row.typname === "CostingEconomicClass")?.values, 3); assertions += 1;
  const publicTables = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'costing_%'`;
  assert.equal(publicTables[0].count, 0); assertions += 1;

  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const permissions = ["costing:view", "costing:calculate", "costing:publish", "costing:tenant", "costing:override", "costing:authorize-margin", "costing:resolve", "costing:rules:view", "costing:rules:manage", "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:plan:tenant", "logistics:plan:override", "logistics:plan:resolve", "logistics:rules:view", "logistics:rules:manage"];
  const tenant = await prisma.tenant.create({ data: { code: `COST-${suffix}`, name: "Costing isolated test", countryCode: "DO" } });
  const user = await prisma.user.create({ data: { code: `COST-U-${suffix}`, name: "Synthetic costing actor", email: `cost-${suffix}@example.invalid`, phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-09", passwordHash: "synthetic-not-authenticatable" } });
  const membership = await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: "A", grantedPermissions: permissions, deniedPermissions: [] } });
  const context = { tenantId: tenant.id, membershipId: membership.id, userId: user.id, role: "A", effectivePermissions: permissions, deniedPermissions: [] };

  const seriesRef = randomUUID();
  const createRule = () => {
    const requestId = randomUUID();
    const payload = { seriesRef, family: "LABOR", code: "CREW_HOUR", name: "Crew hour", classification: "PR", source: "ADMIN", priority: 100, specificity: 10, conditions: { role: "PACKER" }, unitCost: "450", currency: "DOP", minimumMarginBps: 2500, recommendedMarginBps: 3500, result: { unit: "HOUR" }, state: "ACTIVE", validFrom: null, validTo: null };
    return versionCostingRule(prisma, context, { requestId, payloadHash: costingHash({ operation: "COSTING_RULE_VERSION", requestId, ...payload }), ...payload });
  };
  const concurrentRules = await Promise.all([createRule(), createRule()]);
  assert.deepEqual(concurrentRules.map((row) => row.version).sort(), [1, 2]); assertions += 1;
  const storedRules = await prisma.costingRule.findMany({ where: { tenantId: tenant.id, seriesRef }, orderBy: { version: "asc" } });
  assert.deepEqual(storedRules.map((row) => [row.version, row.state]), [[1, "SUPERSEDED"], [2, "ACTIVE"]]); assertions += 1;

  const rateInput = (requestId) => {
    const payload = { seriesRef: null, baseCurrency: "USD", quoteCurrency: "DOP", rate: "60.25", source: "SYNTHETIC_AUTHORITY", state: "ACTIVE", effectiveAt: "2026-09-09T00:00:00.000Z", validTo: null };
    return { requestId, payloadHash: costingHash({ operation: "COSTING_EXCHANGE_RATE_VERSION", requestId, ...payload }), ...payload };
  };
  const concurrentRates = await Promise.allSettled([versionCostingExchangeRate(prisma, context, rateInput(randomUUID())), versionCostingExchangeRate(prisma, context, rateInput(randomUUID()))]);
  assert.equal(concurrentRates.filter((row) => row.status === "fulfilled").length, 1); assertions += 1;
  assert.equal(concurrentRates.filter((row) => row.status === "rejected").length, 1); assertions += 1;

  await assert.rejects(listCostingRules(prisma, { ...context, deniedPermissions: ["costing:rules:view"] }), /COSTING_FORBIDDEN/); assertions += 1;

  const service = await prisma.serviceCatalogItem.create({ data: { tenantId: tenant.id, code: "MOVING_LOCAL", name: "Mudanza local", usage: "PRIMARY", compatibleModes: ["LOCAL"] } });
  let pipelineCase = await prisma.pipelineCase.create({ data: { tenantId: tenant.id, caseCode: `COST-${suffix}`, mode: "LOCAL", serviceType: "Mudanza local", customerType: "L4_PERSONAL", ownerName: user.name, ownerMembershipId: membership.id, ownerUserId: user.id, estimatedCbm: 20, originLocation: "snapshot", destinationLocation: "snapshot" } });
  await prisma.pipelineCaseRouteSnapshot.createMany({ data: [{ tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "ORIGIN", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic origin" }, { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "DESTINATION", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic destination" }] });
  pipelineCase = await prisma.pipelineCase.update({ where: { id: pipelineCase.id }, data: { routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED" } });
  await prisma.pipelineCaseServiceRevision.create({ data: { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, revision: 1, modeSnapshot: "LOCAL", source: "MANUAL", createdByMembershipId: membership.id, createdByUserId: user.id, items: { create: [{ serviceId: service.id, kind: "PRIMARY", source: "MANUAL", position: 0, serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code, nameSnapshot: service.name, catalogVersionSnapshot: service.version }] } } });
  const logisticsRuleRequest = randomUUID();
  const logisticsRulePayload = { seriesRef: null, family: "LABOR", code: "CREW_LOCAL", name: "Equipo por volumen", priority: 100, specificity: 10, conditions: { modes: ["LOCAL"] }, result: { kind: "PACKER", label: "Empacadores", quantity: { basis: "VOLUME_M3", divisor: 10, minimum: 2 }, hours: 6, unit: "persona" }, state: "ACTIVE", validFrom: null, validTo: null };
  await versionLogisticsRule(prisma, context, { requestId: logisticsRuleRequest, payloadHash: logisticsHash({ operation: "LOGISTICS_RULE_VERSION", requestId: logisticsRuleRequest, ...logisticsRulePayload }), ...logisticsRulePayload });
  const logisticsRequest = randomUUID();
  const logisticsPayload = { caseRef: pipelineCase.publicRef, intervalStart: new Date(Date.now() + 3_600_000).toISOString(), intervalEnd: new Date(Date.now() + 9 * 3_600_000).toISOString() };
  const logisticsCalculation = await calculateLogistics(prisma, context, { requestId: logisticsRequest, payloadHash: logisticsHash({ operation: "LOGISTICS_CALCULATE", requestId: logisticsRequest, ...logisticsPayload }), ...logisticsPayload });
  const logisticsPublishRequest = randomUUID();
  const logisticsPublishPayload = { calculationRef: logisticsCalculation.calculationRef };
  const logisticsRevision = await publishLogistics(prisma, context, { requestId: logisticsPublishRequest, payloadHash: logisticsHash({ operation: "LOGISTICS_PUBLISH", requestId: logisticsPublishRequest, ...logisticsPublishPayload }), ...logisticsPublishPayload });

  const costingRequest = randomUUID();
  const costingPayload = { caseRef: pipelineCase.publicRef, logisticsPlanRevisionRef: logisticsRevision.revisionRef, baseCurrency: "DOP" };
  const costingCalculation = await calculateCosting(prisma, context, { requestId: costingRequest, payloadHash: costingHash({ operation: "COSTING_CALCULATE", requestId: costingRequest, ...costingPayload }), ...costingPayload });
  assert.equal(costingCalculation.result.lines.length, 1); assertions += 1;
  const publishRequest = randomUUID();
  const publishPayload = { calculationRef: costingCalculation.calculationRef };
  const publishCommand = { requestId: publishRequest, payloadHash: costingHash({ operation: "COSTING_PUBLISH", requestId: publishRequest, ...publishPayload }), ...publishPayload };
  const concurrentPublications = await Promise.all([publishCosting(prisma, context, publishCommand), publishCosting(prisma, context, publishCommand)]);
  assert.equal(new Set(concurrentPublications.map((row) => row.revisionRef)).size, 1); assertions += 1;
  assert.equal(await prisma.costingRevision.count({ where: { tenantId: tenant.id, calculationId: (await prisma.costingCalculation.findFirst({ where: { calculationRef: costingCalculation.calculationRef } })).id } }), 1); assertions += 1;

  const revision = concurrentPublications[0];
  const line = revision.lines[0];
  const overrideRequest = randomUUID();
  const overridePayload = { revisionRef: revision.revisionRef, lineRef: line.lineRef, kind: "SUGGESTED_PRICE", expectedSuggested: { totalCost: line.totalCost, suggestedPrice: line.suggestedPrice, classification: line.classification, minimumMarginBps: line.minimumMarginBps, recommendedMarginBps: line.recommendedMarginBps }, finalValue: { amount: line.totalCost }, reason: "Synthetic below-margin authorization test" };
  const overrideCommand = { requestId: overrideRequest, payloadHash: costingHash({ operation: "COSTING_OVERRIDE", requestId: overrideRequest, ...overridePayload }), ...overridePayload };
  const concurrentOverrides = await Promise.all([createCostingOverride(prisma, context, overrideCommand), createCostingOverride(prisma, context, overrideCommand)]);
  assert.equal(new Set(concurrentOverrides.map((row) => row.overrideRef)).size, 1); assertions += 1;
  assert.equal(concurrentOverrides[0].status, "AUTHORIZATION_REQUIRED"); assertions += 1;
  const authorizationRequest = randomUUID();
  const authorizationPayload = { overrideRef: concurrentOverrides[0].overrideRef, decision: "AUTHORIZED", reason: "Synthetic economic authority" };
  const authorizationCommand = { requestId: authorizationRequest, payloadHash: costingHash({ operation: "COSTING_MARGIN_AUTHORIZE", requestId: authorizationRequest, ...authorizationPayload }), ...authorizationPayload };
  const concurrentAuthorizations = await Promise.all([authorizeCostingMargin(prisma, context, authorizationCommand), authorizeCostingMargin(prisma, context, authorizationCommand)]);
  assert.equal(new Set(concurrentAuthorizations.map((row) => row.authorizationRef)).size, 1); assertions += 1;

  const staleRequest = randomUUID();
  const staleCalculation = await calculateCosting(prisma, context, { requestId: staleRequest, payloadHash: costingHash({ operation: "COSTING_CALCULATE", requestId: staleRequest, ...costingPayload }), ...costingPayload });
  await createRule();
  const stalePublishRequest = randomUUID();
  const stalePublishPayload = { calculationRef: staleCalculation.calculationRef };
  await assert.rejects(publishCosting(prisma, context, { requestId: stalePublishRequest, payloadHash: costingHash({ operation: "COSTING_PUBLISH", requestId: stalePublishRequest, ...stalePublishPayload }), ...stalePublishPayload }), /COSTING_INPUT_STALE/); assertions += 1;
  await assert.rejects(prisma.costingRevision.update({ where: { id: (await prisma.costingRevision.findFirst({ where: { revisionRef: revision.revisionRef } })).id }, data: { logicalSha256: "0".repeat(64) } }), /COSTING_APPEND_ONLY/); assertions += 1;

  const commandCount = await prisma.costingMutationCommand.count({ where: { tenantId: tenant.id } });
  const auditCount = await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, source: "V17_COSTING" } });
  assert.equal(commandCount, auditCount); assertions += 1;
  assert.equal(commandCount, 9); assertions += 1;

  process.stdout.write(JSON.stringify({ ok: true, assertions, migrations: "28/28", models: tables.length, families: 13, tenantFirstForeignKeys: tenantFks, immutableSnapshots: true, concurrentRuleVersions: "1/2", concurrentRateWinners: 1, concurrentPublicationReplay: true, concurrentOverrideReplay: true, concurrentAuthorizationReplay: true, stalePublishRejected: true, auditCommandParity: true }) + "\n");
} finally { await prisma.$disconnect(); }
