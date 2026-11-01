import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { validateAppliedMigrationHistory } from "./canonical-migrations.mjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import { createFleetDriversPg17LocalPrisma } from "./v17-fleet-drivers-pg17-local-target.mjs";
import { canonicalHash } from "../api/_lib/logisticsEngineContract.js";
import { versionLogisticsRule } from "../api/_lib/logisticsEngineDomain.js";
import { costingHash } from "../api/_lib/costingContract.js";
import { calculateCosting, getCosting, publishCosting, versionCostingRule } from "../api/_lib/costingDomain.js";
import { TRANSPORT_CONTRACT } from "../api/_lib/logisticsTransportContract.js";
import { listTransportZones, loadTransportZones, versionTransportZone } from "../api/_lib/logisticsTransportZones.js";
import { calculateTransport, getTransportPublication, getTransportWorkspace, publishTransport } from "../api/_lib/logisticsTransportDomain.js";
import { QUOTE_TRANSPORT_CONTEXT } from "../api/_lib/logisticsTransportContext.js";

// These are the existing disposable runners. There is deliberately no dotenv,
// DATABASE_URL fallback, Preview connection, migration, or schema mutation.
const compatibility = process.env.V17_FLEET_DRIVERS_LOCAL_COMPAT;
assert.ok(compatibility === undefined || compatibility === "PG17", "unsupported local transport compatibility mode");
let local;
if (compatibility === "PG17") {
  local = await createFleetDriversPg17LocalPrisma(process.env.V17_FLEET_DRIVERS_PG17_DATABASE_URL);
} else {
  assert.equal(process.env.CANONICAL_DB_VALIDATION, "true", "transport integration requires disposable canonical CI");
  assert.equal(validateCrm01b1LocalUrl(process.env.CRM01B1_TEST_DATABASE_URL).database, "osi_db01n_ci");
  local = await createCrm01b1LocalPrisma(process.env.CRM01B1_TEST_DATABASE_URL);
}
const { prisma } = local;
const results = [];
const suffix = randomUUID().slice(0, 8).toUpperCase();
const permissions = ["logistics:rules:view", "logistics:rules:manage", "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:plan:tenant",
  "costing:rules:view", "costing:rules:manage", "costing:view", "costing:calculate", "costing:publish", "costing:tenant"];
function check(name, condition) { assert.ok(condition, name); results.push(name); }
async function rejects(name, work, code) { await assert.rejects(work, (error) => error.code === code, name); results.push(name); }
function signed(operation, payload, requestId = randomUUID(), hash = canonicalHash) {
  return { requestId, payloadHash: hash({ operation, requestId, ...payload }), ...payload };
}
function zoneInput(changes = {}) {
  return { seriesRef: null, expectedVersion: null, code: `SYNTHETIC_${suffix}`, name: "Zona sintética de integración", zoneType: "INTERIOR", priority: 100,
    vehicleType: "TRUCK", purposes: ["QUOTE", "SERVICE", "VISIT"], geometry: { type: "Polygon", coordinates: [[[-70, 18], [-69.8, 18], [-69.8, 18.2], [-70, 18.2], [-70, 18]]] },
    mode: "ITEMIZED", factor: null, currency: "DOP", kmPerGallon: "20", gallonUnit: "US", fuelType: "SYNTHETIC_DIESEL", includedConcepts: [], state: "ACTIVE",
    components: [
      { code: "FUEL", label: "Combustible sintético", kind: "FUEL", basis: "GALLON", unitCost: "250.000000", classification: "PR", minimumMarginBps: 2000, recommendedMarginBps: 2500, includedConcepts: [] },
      { code: "TOLL", label: "Peaje sintético", kind: "TOLL", basis: "PASS", unitCost: "100", classification: "EX", minimumMarginBps: null, recommendedMarginBps: null, includedConcepts: [] },
      { code: "MEAL", label: "Dieta sintética", kind: "PER_DIEM", basis: "PERSON_DAY", unitCost: "200", classification: "PR", minimumMarginBps: 2000, recommendedMarginBps: 2500, includedConcepts: [] },
    ], ...changes };
}
async function account(label) {
  const tenant = await prisma.tenant.create({ data: { code: `TR-${suffix}-${label}`, name: `Synthetic transport ${label}`, countryCode: "DO" } });
  const email = `tr-${suffix}-${label}@example.invalid`.toLowerCase();
  const user = await prisma.user.create({ data: { id: randomUUID(), code: `TR-U-${suffix}-${label}`, name: `Synthetic transport ${label}`, email, normalizedEmail: email,
    phone: "0000000000", role: "B", status: "active", joinDate: "2026-10-31", passwordHash: "synthetic-not-authenticatable" } });
  const membership = await prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId: tenant.id, userId: user.id, role: "B", status: "ACTIVE", grantedPermissions: permissions, deniedPermissions: [], isDefault: true } });
  return { tenant, user, membership, context: { tenantId: tenant.id, membershipId: membership.id, userId: user.id, role: "B", effectivePermissions: permissions, deniedPermissions: [] } };
}
async function caseFixture(actor, label) {
  const service = await prisma.serviceCatalogItem.create({ data: { tenantId: actor.tenant.id, code: `MOVING_${label}`, name: "Mudanza sintética", usage: "PRIMARY", compatibleModes: ["LOCAL"] } });
  let pipelineCase = await prisma.pipelineCase.create({ data: { tenantId: actor.tenant.id, caseCode: `TR-${suffix}-${label}`, mode: "LOCAL", serviceType: "Mudanza sintética", customerType: "L4_PERSONAL",
    ownerName: actor.user.name, ownerMembershipId: actor.membership.id, ownerUserId: actor.user.id, estimatedCbm: 10, originLocation: "Synthetic origin", destinationLocation: "Synthetic destination" } });
  await prisma.pipelineCaseRouteSnapshot.createMany({ data: ["ORIGIN", "DESTINATION"].map((role) => ({ tenantId: actor.tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role, stopOrder: 0,
    countryCode: "DO", provinceState: "Provincia sintética", cityMunicipality: "Localidad sintética", streetAndNumber: `Synthetic ${role}` })) });
  pipelineCase = await prisma.pipelineCase.update({ where: { id: pipelineCase.id }, data: { routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED" } });
  const serviceRevision = await prisma.pipelineCaseServiceRevision.create({ data: { tenantId: actor.tenant.id, pipelineCaseId: pipelineCase.id, revision: 1, modeSnapshot: "LOCAL", source: "MANUAL",
    createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id,
    items: { create: [{ serviceId: service.id, kind: "PRIMARY", source: "MANUAL", position: 0, serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code, nameSnapshot: service.name, catalogVersionSnapshot: service.version }] } } });
  return { pipelineCase, serviceRevision };
}
function calculationInput(pipelineCase, purpose = "QUOTE", contextRef = null, journeyChanges = {}) {
  const start = Date.now() + 3_600_000;
  return { caseRef: pipelineCase.publicRef, purpose, contextRef, intervalStart: new Date(start).toISOString(), intervalEnd: new Date(start + 7_200_000).toISOString(), journeys: [{
    journeyRef: randomUUID(), label: "Recorrido sintético", vehicleType: "TRUCK", vehicleRef: null, origin: [-69.95, 18.05], destination: [-69.9, 18.1],
    distanceKm: "143.5", distanceSource: "SYNTHETIC_CONFIRMED_ROAD_DISTANCE", returnToOrigin: false, trips: 1, people: 2, days: "1.5", quantities: { TOLL: "2" }, ...journeyChanges,
  }] };
}
const zoneCommand = (input) => signed("TRANSPORT_ZONE_VERSION", input);
const calculate = (context, input) => calculateTransport(prisma, context, signed("TRANSPORT_CALCULATE", input));
const publish = (context, calculationRef, requestId = randomUUID()) => publishTransport(prisma, context, signed("TRANSPORT_PUBLISH", { calculationRef }, requestId));
async function costPublication(context, pipelineCase, transport) {
  const calculated = await calculateCosting(prisma, context, signed("COSTING_CALCULATE", { caseRef: pipelineCase.publicRef, logisticsPlanRevisionRef: transport.revisionRef, baseCurrency: "DOP" }, randomUUID(), costingHash));
  check(`costing ${transport.context.purpose} consumes exact transport authority without blockers`, calculated.result.lines.length === 3 && !calculated.result.issues.some((issue) => issue.severity === "BLOCKER"));
  return publishCosting(prisma, context, signed("COSTING_PUBLISH", { calculationRef: calculated.calculationRef }, randomUUID(), costingHash));
}
function failingAuditClient() {
  return { $transaction: (work, options) => prisma.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
    if (key === "commercialAuditLog") return { ...target.commercialAuditLog, create: async () => { throw Object.assign(new Error("synthetic atomic audit rejection"), { code: "SYNTHETIC_AUDIT_REJECTION" }); } };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } })), options) };
}

try {
  const history = await prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM "osi"."_prisma_migrations" ORDER BY started_at`;
  const migrationNames = validateAppliedMigrationHistory(history, compatibility === "PG17" ? { throughMigration: "20261031010000_v17_fleet_driver_authority" } : {});
  check("full current canonical migration inventory is present", migrationNames.length === (compatibility === "PG17" ? 37 : 38));
  const [a, b] = await Promise.all([account("A"), account("B")]);
  const { pipelineCase, serviceRevision } = await caseFixture(a, "A");

  const createCommand = zoneCommand(zoneInput());
  const concurrentCreate = await Promise.all([versionTransportZone(prisma, a.context, createCommand), versionTransportZone(prisma, a.context, createCommand)]);
  const first = concurrentCreate[0];
  check("concurrent identical creation commits one zone and returns one version", concurrentCreate[1].ruleRef === first.ruleRef && await prisma.logisticsRule.count({ where: { tenantId: a.tenant.id } }) === 1);
  check("zone version atomically binds three monetary tariffs and its audited command", await prisma.costingRule.count({ where: { tenantId: a.tenant.id } }) === 3
    && await prisma.logisticsMutationCommand.count({ where: { tenantId: a.tenant.id } }) === 1
    && await prisma.commercialAuditLog.count({ where: { tenant_id: a.tenant.id, request_id: createCommand.requestId } }) === 4);
  check("operational JSON contains only authority references, never tariffs or margins", !/unitCost|MarginBps|classification/.test(JSON.stringify((await prisma.logisticsRule.findFirst({ where: { tenantId: a.tenant.id, ruleRef: first.ruleRef } })).result)));
  check("another tenant cannot list the zone", (await listTransportZones(prisma, b.context)).length === 0);
  await rejects("another tenant cannot version the zone", () => versionTransportZone(prisma, b.context, zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: 1 }))), "LOGISTICS_TRANSPORT_ZONE_NOT_FOUND");
  await rejects("expected version prevents lost updates", () => versionTransportZone(prisma, a.context, zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: 2 }))), "LOGISTICS_TRANSPORT_VERSION_CONFLICT");
  await rejects("request id cannot be reused with a changed command", () => versionTransportZone(prisma, a.context, signed("TRANSPORT_ZONE_VERSION", zoneInput({ name: "Changed synthetic zone" }), createCommand.requestId)), "LOGISTICS_TRANSPORT_IDEMPOTENCY_CONFLICT");

  await prisma.tenantMembership.update({ where: { id: a.membership.id }, data: { grantedPermissions: permissions.filter((permission) => permission !== "costing:rules:manage"), deniedPermissions: ["costing:rules:manage"] } });
  await rejects("revoked persisted grant blocks a previously authorized replay", () => versionTransportZone(prisma, a.context, createCommand), "LOGISTICS_TRANSPORT_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: a.membership.id }, data: { grantedPermissions: permissions, deniedPermissions: [] } });
  const draftComponents = zoneInput().components.map((component) => component.code === "FUEL" ? { ...component, unitCost: "260" } : component);
  const draft = await versionTransportZone(prisma, a.context, zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: 1, components: draftComponents, state: "DRAFT" })));
  const active = await prisma.$transaction((tx) => loadTransportZones(tx, a.tenant.id, new Date()), { isolationLevel: "Serializable" });
  check("draft edit leaves active version and old monetary tariffs applicable", draft.version === 2 && active.length === 1 && active[0].version === 1 && active[0].components[0].unitCost === "250");
  check("administration returns the latest draft for expected-version editing", (await listTransportZones(prisma, a.context))[0].ruleRef === draft.ruleRef);

  const quoteCalculation = await calculate(a.context, calculationInput(pipelineCase));
  check("calculation preserves fractional gallons and explicit road distance", quoteCalculation.status === "VALID" && quoteCalculation.result.complete
    && new Prisma.Decimal(quoteCalculation.result.lines.find((line) => line.kind === "FUEL").quantity).equals("7.175")
    && quoteCalculation.result.totals[0].amount === "2593.750000");
  const publicationRequest = randomUUID();
  const quotePublications = await Promise.all([publish(a.context, quoteCalculation.calculationRef, publicationRequest), publish(a.context, quoteCalculation.calculationRef, publicationRequest)]);
  const quote = quotePublications[0];
  check("concurrent publication replays one immutable quotation context", quotePublications[1].revisionRef === quote.revisionRef && quote.context.purpose === "QUOTE");
  const quoteCost = await costPublication(a.context, pipelineCase, quote);
  check("costing maintains fractional fuel and references the same versioned tariff", quoteCost.lines.some((line) => line.unit === "GALLON" && new Prisma.Decimal(line.quantity).equals("7.175") && line.source === "MOTOR")
    && new Prisma.Decimal(quoteCost.totals.totalCost).equals("2593.75"));
  const frozenQuote = await prisma.logisticsPlanRevision.findFirst({ where: { tenantId: a.tenant.id, revisionRef: quote.revisionRef } });
  const frozenCost = await prisma.costingRevision.findFirst({ where: { tenantId: a.tenant.id, revisionRef: quoteCost.revisionRef } });
  const originalSnapshots = canonicalHash({ transport: frozenQuote.resultSnapshot, costing: frozenCost.totalsSnapshot, transportInput: frozenQuote.inputSnapshot, costingInput: frozenCost.inputSnapshot });

  const service = await publish(a.context, (await calculate(a.context, calculationInput(pipelineCase, "SERVICE", null, { distanceKm: "200" }))).calculationRef);
  const serviceCost = await costPublication(a.context, pipelineCase, service);
  const decision = await prisma.surveyEvaluationDecision.create({ data: { tenantId: a.tenant.id, pipelineCaseId: pipelineCase.id, serviceRevisionId: serviceRevision.id, routeVersion: 1,
    version: 1, method: "IN_PERSON", commercialState: "READY_TO_SCHEDULE", createdByMembershipId: a.membership.id, createdByUserId: a.user.id } });
  check("visit fixture has no completed survey", await prisma.surveyPublication.count({ where: { tenantId: a.tenant.id, pipelineCaseId: pipelineCase.id } }) === 0);
  const visitInput = calculationInput(pipelineCase, "VISIT", decision.decisionRef, { distanceKm: "20", people: 1, days: "1", quantities: { TOLL: "0" } });
  const visit = await publish(a.context, (await calculate(a.context, visitInput)).calculationRef);
  const visitCost = await costPublication(a.context, pipelineCase, visit);
  check("visit computes and publishes before a completed survey", visit.context.contextRef === decision.decisionRef && visit.result.totals[0].amount === "450.000000");
  for (const expected of [quote, service, visit]) {
    const query = { caseRef: pipelineCase.publicRef, purpose: expected.context.purpose, ...(expected.context.contextRef ? { contextRef: expected.context.contextRef } : {}) };
    check(`latest ${expected.context.purpose} publication is independent`, (await getTransportPublication(prisma, a.context, query)).revisionRef === expected.revisionRef);
  }
  check("later service and visit costing never replace quotation costing", (await getCosting(prisma, a.context, pipelineCase.publicRef, QUOTE_TRANSPORT_CONTEXT)).revisionRef === quoteCost.revisionRef
    && (await getCosting(prisma, a.context, pipelineCase.publicRef, service.context)).revisionRef === serviceCost.revisionRef
    && (await getCosting(prisma, a.context, pipelineCase.publicRef, visit.context)).revisionRef === visitCost.revisionRef);
  await rejects("another tenant cannot read the publication by case reference", () => getTransportPublication(prisma, b.context, { caseRef: pipelineCase.publicRef, purpose: "QUOTE" }), "LOGISTICS_PLAN_NOT_FOUND");

  const alternateOwner = await prisma.tenantMembership.create({ data: { tenantId: a.tenant.id, userId: b.user.id, role: "B", status: "ACTIVE", grantedPermissions: [], deniedPermissions: [], isDefault: false } });
  const { pipelineCase: otherOwnedCase } = await caseFixture({ tenant: a.tenant, user: b.user, membership: alternateOwner }, "OTHER_OWNER");
  const otherOwnedPublication = await publish(a.context, (await calculate(a.context, calculationInput(otherOwnedCase))).calculationRef);
  const pendingOwnerCheck = await calculate(a.context, calculationInput(otherOwnedCase));
  for (const missing of ["costing:tenant", "logistics:plan:tenant"]) {
    await prisma.tenantMembership.update({ where: { id: a.membership.id }, data: { grantedPermissions: permissions.filter((permission) => permission !== missing) } });
    await rejects(`${missing} absence prevents reading another owner's money`, () => getTransportPublication(prisma, a.context, { caseRef: otherOwnedCase.publicRef, purpose: "QUOTE" }), "LOGISTICS_PLAN_NOT_FOUND");
    await rejects(`${missing} absence prevents calculating another owner's money`, () => calculate(a.context, calculationInput(otherOwnedCase)), "LOGISTICS_PLAN_NOT_FOUND");
    await rejects(`${missing} absence prevents publishing another owner's money`, () => publish(a.context, pendingOwnerCheck.calculationRef), "LOGISTICS_PLAN_NOT_FOUND");
    check(`${missing} absence hides another owner's case from the transport workspace`, !(await getTransportWorkspace(prisma, a.context)).cases.some((row) => row.caseRef === otherOwnedCase.publicRef));
  }
  await prisma.tenantMembership.update({ where: { id: a.membership.id }, data: { grantedPermissions: permissions } });
  check("both tenant-wide authorities allow the cross-owner transport publication", (await getTransportPublication(prisma, a.context, { caseRef: otherOwnedCase.publicRef, purpose: "QUOTE" })).revisionRef === otherOwnedPublication.revisionRef);

  const staleCalculation = await calculate(a.context, calculationInput(pipelineCase));
  const activeComponents = zoneInput().components.map((component) => component.code === "FUEL" ? { ...component, unitCost: "300" } : component);
  const activated = await versionTransportZone(prisma, a.context, zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: draft.version, components: activeComponents })));
  check("activation creates a new policy and closes older active rates", activated.version === 3
    && await prisma.logisticsRule.count({ where: { tenantId: a.tenant.id, state: "ACTIVE" } }) === 1
    && await prisma.costingRule.count({ where: { tenantId: a.tenant.id, state: "ACTIVE" } }) === 3);
  await rejects("tariff changes make an unpublished estimate stale", () => publish(a.context, staleCalculation.calculationRef), "LOGISTICS_INPUT_STALE");
  const preservedQuote = await prisma.logisticsPlanRevision.findFirst({ where: { tenantId: a.tenant.id, revisionRef: quote.revisionRef } });
  const preservedCost = await prisma.costingRevision.findFirst({ where: { tenantId: a.tenant.id, revisionRef: quoteCost.revisionRef } });
  check("tariff activation leaves published quotation snapshots unchanged", canonicalHash({ transport: preservedQuote.resultSnapshot, costing: preservedCost.totalsSnapshot, transportInput: preservedQuote.inputSnapshot, costingInput: preservedCost.inputSnapshot }) === originalSnapshots);

  const beforeRollback = { zones: await prisma.logisticsRule.findMany({ where: { tenantId: a.tenant.id }, orderBy: { version: "asc" } }),
    tariffs: await prisma.costingRule.findMany({ where: { tenantId: a.tenant.id }, orderBy: { id: "asc" } }), commands: await prisma.logisticsMutationCommand.count({ where: { tenantId: a.tenant.id } }) };
  const rejectedCommand = zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: 3, state: "INACTIVE" }));
  await rejects("audit failure aborts the actual database transaction", () => versionTransportZone(failingAuditClient(), a.context, rejectedCommand), "SYNTHETIC_AUDIT_REJECTION");
  const afterRollback = { zones: await prisma.logisticsRule.findMany({ where: { tenantId: a.tenant.id }, orderBy: { version: "asc" } }),
    tariffs: await prisma.costingRule.findMany({ where: { tenantId: a.tenant.id }, orderBy: { id: "asc" } }), commands: await prisma.logisticsMutationCommand.count({ where: { tenantId: a.tenant.id } }) };
  check("rollback restores active rows and leaves no tariff zone or command residue", JSON.stringify(afterRollback) === JSON.stringify(beforeRollback));

  const protectedRule = await prisma.logisticsRule.findFirst({ where: { tenantId: a.tenant.id, ruleRef: activated.ruleRef } });
  const protectedTariff = await prisma.costingRule.findFirst({ where: { tenantId: a.tenant.id, ruleRef: activated.components[0].costRuleRef } });
  await rejects("generic logistics editor cannot replace a protected zone series", () => versionLogisticsRule(prisma, a.context, signed("LOGISTICS_RULE_VERSION", {
    seriesRef: first.seriesRef, family: "ZONE", code: "GENERIC_BYPASS", name: "Synthetic bypass attempt", priority: 100, specificity: 0, conditions: {}, result: {}, state: "ACTIVE", validFrom: null, validTo: null,
  })), "LOGISTICS_TRANSPORT_CANONICAL_PATH_REQUIRED");
  await rejects("generic costing editor cannot replace a transport tariff series", () => versionCostingRule(prisma, a.context, signed("COSTING_RULE_VERSION", {
    seriesRef: protectedTariff.seriesRef, family: "TRANSPORT", code: "GENERIC_BYPASS", name: "Synthetic bypass attempt", classification: "PR", source: "ADMIN", priority: 100, specificity: 0,
    conditions: {}, unitCost: "1", currency: "DOP", minimumMarginBps: null, recommendedMarginBps: null, result: {}, state: "ACTIVE", validFrom: null, validTo: null,
  }, randomUUID(), costingHash)), "COSTING_TRANSPORT_RULE_PROTECTED");
  await assert.rejects(() => prisma.logisticsRule.update({ where: { id: protectedRule.id }, data: { result: {} } }), /LOGISTICS_IDENTITY_IMMUTABLE/);
  await assert.rejects(() => prisma.costingRule.update({ where: { id: protectedTariff.id }, data: { unitCost: "1" } }), /COSTING_IDENTITY_IMMUTABLE/);
  await assert.rejects(() => prisma.logisticsPlanRevision.update({ where: { id: frozenQuote.id }, data: { resultSnapshot: {} } }), /LOGISTICS_APPEND_ONLY/);
  await assert.rejects(() => prisma.costingRevision.update({ where: { id: frozenCost.id }, data: { totalsSnapshot: {} } }), /COSTING_APPEND_ONLY/);
  check("database triggers preserve policy tariff and published histories", true);
  for (const family of ["LODGING", "LABOR"]) {
    const legacy = { seriesRef: null, family, code: `OLD_${family}`, name: "Synthetic legacy travel", priority: 90, specificity: 0, conditions: {}, result: { kind: "SYNTHETIC_TRAVEL", label: "Synthetic travel", quantity: 1, unit: "TRIP", ...(family === "LABOR" ? { family: "TRANSPORT" } : {}) }, state: "ACTIVE", validFrom: null, validTo: null };
    const legacyRule = await versionLogisticsRule(prisma, a.context, signed("LOGISTICS_RULE_VERSION", legacy));
    const conflicted = await calculate(a.context, calculationInput(pipelineCase));
    check(`${family} cannot add a second travel charge through its effective item family`, !conflicted.result.complete && conflicted.result.issues.some((issue) => issue.code === "TRANSPORT_LEGACY_RULE_CONFLICT"));
    await rejects(`${family} overlapping travel blocks publication`, () => publish(a.context, conflicted.calculationRef), "TRANSPORT_CALCULATION_INCOMPLETE");
    await versionLogisticsRule(prisma, a.context, signed("LOGISTICS_RULE_VERSION", { ...legacy, seriesRef: legacyRule.seriesRef, state: "INACTIVE" }));
  }
  const badSeries = randomUUID();
  const { id: _id, createdAt: _createdAt, ...copied } = protectedRule;
  await assert.rejects(() => prisma.logisticsRule.create({ data: { ...copied, ruleRef: randomUUID(), seriesRef: badSeries, requestId: randomUUID(), version: 1, state: "DRAFT", replacesRuleId: null,
    conditions: { transportContract: TRANSPORT_CONTRACT, zoneSeriesRef: badSeries, vehicleType: "TRUCK" }, actorMembershipId: b.membership.id, actorUserId: b.user.id } }), (error) => error.code === "P2003");
  check("tenant-first actor FK rejects a foreign membership even below the API", true);

  const pendingComponents = zoneInput().components.map((component) => component.code === "FUEL" ? { ...component, unitCost: null } : component);
  await versionTransportZone(prisma, a.context, zoneCommand(zoneInput({ seriesRef: first.seriesRef, expectedVersion: 3, components: pendingComponents })));
  const pending = await calculate(a.context, calculationInput(pipelineCase));
  check("missing tariff stays pending and never becomes a zero transport total", pending.status === "CONFLICT" && !pending.result.complete && pending.result.totals[0].amount === null
    && pending.result.lines.find((line) => line.kind === "FUEL").unitCost === null);
  await rejects("incomplete transport cannot be published", () => publish(a.context, pending.calculationRef), "TRANSPORT_CALCULATION_INCOMPLETE");

  const automaticActor = await account("AUTOMATIC");
  const automaticInput = zoneInput({ code: null, state: "DRAFT", components: zoneInput().components.map((row) => ({ ...row, code: null })) });
  const automaticCommand = zoneCommand(automaticInput);
  const automaticCreations = await Promise.all([
    versionTransportZone(prisma, automaticActor.context, automaticCommand),
    versionTransportZone(prisma, automaticActor.context, automaticCommand),
  ]);
  const automaticZone = automaticCreations[0];
  check("concurrent code-free zone requests replay one saved identity", automaticCreations[1].ruleRef === automaticZone.ruleRef
    && /^ZON_[A-F0-9]{24}$/.test(automaticZone.code)
    && await prisma.logisticsRule.count({ where: { tenantId: automaticActor.tenant.id } }) === 1
    && await prisma.costingRule.count({ where: { tenantId: automaticActor.tenant.id } }) === 3);
  check("code-free rows have distinct generated references", automaticZone.components.every((row) => /^REN_[A-F0-9]{24}$/.test(row.code))
    && new Set(automaticZone.components.map((row) => row.code)).size === 3);
  await rejects("automatic zone retry with changed data is rejected", () => versionTransportZone(prisma, automaticActor.context,
    signed("TRANSPORT_ZONE_VERSION", { ...automaticInput, name: "Changed automatic zone" }, automaticCommand.requestId)), "LOGISTICS_TRANSPORT_IDEMPOTENCY_CONFLICT");
  const automaticVersion = await versionTransportZone(prisma, automaticActor.context, zoneCommand({ ...automaticInput,
    seriesRef: automaticZone.seriesRef, expectedVersion: automaticZone.version,
    components: automaticInput.components.map((row, index) => ({ ...row, code: automaticZone.components[index].code })) }));
  check("zone and tariff references survive code-free zone versioning", automaticVersion.code === automaticZone.code
    && automaticVersion.components.every((row, index) => row.code === automaticZone.components[index].code && row.costRuleVersion === 2));
  await rejects("saved automatic zone code cannot be renamed", () => versionTransportZone(prisma, automaticActor.context,
    zoneCommand({ ...automaticInput, seriesRef: automaticZone.seriesRef, expectedVersion: 2, code: "RENAMED_ZONE" })), "LOGISTICS_TRANSPORT_ZONE_CODE_IMMUTABLE");
  const otherAutomaticZone = await versionTransportZone(prisma, automaticActor.context, zoneCommand(automaticInput));
  check("a distinct create request receives distinct zone and row codes", otherAutomaticZone.code !== automaticZone.code
    && otherAutomaticZone.components.every((row, index) => row.code !== automaticZone.components[index].code));
  const tenantScopedZone = await versionTransportZone(prisma, b.context, automaticCommand);
  check("same automatic zone request is isolated by tenant", tenantScopedZone.code !== automaticZone.code);

  const automaticRuleInput = { seriesRef: null, family: "LABOR", code: null, name: "Regla sintética automática", priority: 10, specificity: 0,
    conditions: {}, result: { kind: "SYNTHETIC_CREW", label: "Personal sintético", quantity: 1, unit: "persona" }, state: "DRAFT", validFrom: null, validTo: null };
  const automaticRuleCommand = signed("LOGISTICS_RULE_VERSION", automaticRuleInput);
  const automaticRules = await Promise.all([
    versionLogisticsRule(prisma, automaticActor.context, automaticRuleCommand),
    versionLogisticsRule(prisma, automaticActor.context, automaticRuleCommand),
  ]);
  const automaticRule = automaticRules[0];
  check("concurrent code-free operational rules replay one identity", automaticRules[1].ruleRef === automaticRule.ruleRef
    && /^RGL_[A-F0-9]{24}$/.test(automaticRule.code)
    && await prisma.logisticsRule.count({ where: { tenantId: automaticActor.tenant.id, requestId: automaticRuleCommand.requestId } }) === 1
    && await prisma.logisticsMutationCommand.count({ where: { tenantId: automaticActor.tenant.id, requestId: automaticRuleCommand.requestId } }) === 1);
  await rejects("automatic operational rule retry rejects altered payload", () => versionLogisticsRule(prisma, automaticActor.context,
    signed("LOGISTICS_RULE_VERSION", { ...automaticRuleInput, name: "Changed rule" }, automaticRuleCommand.requestId)), "LOGISTICS_IDEMPOTENCY_CONFLICT");
  const automaticRuleVersion = await versionLogisticsRule(prisma, automaticActor.context,
    signed("LOGISTICS_RULE_VERSION", { ...automaticRuleInput, seriesRef: automaticRule.seriesRef }));
  check("operational rule versions preserve their generated reference", automaticRuleVersion.version === 2 && automaticRuleVersion.code === automaticRule.code);
  await rejects("operational rule codes cannot be renamed", () => versionLogisticsRule(prisma, automaticActor.context,
    signed("LOGISTICS_RULE_VERSION", { ...automaticRuleInput, seriesRef: automaticRule.seriesRef, code: "RENAMED_RULE" })), "LOGISTICS_RULE_CODE_IMMUTABLE");
  await rejects("foreign operational rule series cannot be recreated in another tenant", () => versionLogisticsRule(prisma, b.context,
    signed("LOGISTICS_RULE_VERSION", { ...automaticRuleInput, seriesRef: automaticRule.seriesRef })), "LOGISTICS_RULE_NOT_FOUND");
  const tenantScopedRule = await versionLogisticsRule(prisma, b.context, automaticRuleCommand);
  check("same operational request is isolated by tenant", tenantScopedRule.code !== automaticRule.code);

  process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, migrations: migrationNames.length, isolatedDatabase: local.target.database,
    postgres17: compatibility === "PG17", remoteDatabaseAccess: false, schemaChanges: false, results }, null, 2) + "\n");
} finally {
  await prisma.$disconnect();
}
