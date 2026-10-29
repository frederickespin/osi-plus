import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { costingHash } from "../api/_lib/costingContract.js";
import { calculateCosting, publishCosting, versionCostingRule } from "../api/_lib/costingDomain.js";
import { canonicalHash as logisticsHash } from "../api/_lib/logisticsEngineContract.js";
import { calculateLogistics, publishLogistics, versionLogisticsRule } from "../api/_lib/logisticsEngineDomain.js";

const UPSTREAM_PERMISSIONS = Object.freeze([
  "costing:view", "costing:calculate", "costing:publish", "costing:tenant", "costing:rules:manage",
  "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:plan:tenant", "logistics:rules:manage",
]);
function signed(hash, operation, payload) {
  const requestId = randomUUID();
  return { requestId, payloadHash: hash({ operation, requestId, ...payload }), ...payload };
}

// Tests only. All downstream reads are scoped to identities created by this
// invocation; no published Costing from another test or tenant is selected.
export async function createPublishedQuoteCostingFixture(prisma, quotePermissions) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const permissions = [...new Set([...quotePermissions, ...UPSTREAM_PERMISSIONS])];
  const tenant = await prisma.tenant.create({ data: {
    code: `QUOTE-CI-${suffix}`, name: "Quote isolated fixture", countryCode: "DO",
  } });
  const user = await prisma.user.create({ data: {
    code: `QUOTE-U-${suffix}`, name: "Synthetic Quote actor", email: `quote-${suffix}@example.invalid`,
    phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-10",
    passwordHash: "synthetic-not-authenticatable",
  } });
  const membership = await prisma.tenantMembership.create({ data: {
    tenantId: tenant.id, userId: user.id, role: "A", grantedPermissions: permissions, deniedPermissions: [],
  } });
  const context = {
    tenantId: tenant.id, membershipId: membership.id, userId: user.id,
    role: "A", effectivePermissions: permissions, deniedPermissions: [],
  };

  const service = await prisma.serviceCatalogItem.create({ data: {
    tenantId: tenant.id, code: "MOVING_LOCAL", name: "Mudanza local", usage: "PRIMARY", compatibleModes: ["LOCAL"],
  } });
  let pipelineCase = await prisma.pipelineCase.create({ data: {
    tenantId: tenant.id, caseCode: `QUOTE-CI-${suffix}`, mode: "LOCAL", serviceType: "Mudanza local",
    customerType: "L4_PERSONAL", ownerName: user.name, ownerMembershipId: membership.id, ownerUserId: user.id,
    estimatedCbm: 20, originLocation: "synthetic origin", destinationLocation: "synthetic destination",
  } });
  await prisma.pipelineCaseRouteSnapshot.createMany({ data: ["ORIGIN", "DESTINATION"].map((role) => ({
    tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role, stopOrder: 0,
    countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo",
    streetAndNumber: `Synthetic ${role.toLowerCase()}`,
  })) });
  pipelineCase = await prisma.pipelineCase.update({ where: { id: pipelineCase.id }, data: {
    routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED",
  } });
  await prisma.pipelineCaseServiceRevision.create({ data: {
    tenantId: tenant.id, pipelineCaseId: pipelineCase.id, revision: 1, modeSnapshot: "LOCAL", source: "MANUAL",
    createdByMembershipId: membership.id, createdByUserId: user.id,
    items: { create: [{
      serviceId: service.id, kind: "PRIMARY", source: "MANUAL", position: 0,
      serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code,
      nameSnapshot: service.name, catalogVersionSnapshot: service.version,
    }] },
  } });

  await versionLogisticsRule(prisma, context, signed(logisticsHash, "LOGISTICS_RULE_VERSION", {
    seriesRef: null, family: "LABOR", code: "QUOTE_CREW_LOCAL", name: "Equipo Quote por volumen",
    priority: 100, specificity: 10, conditions: { modes: ["LOCAL"] },
    result: { kind: "PACKER", label: "Empacadores", quantity: { basis: "VOLUME_M3", divisor: 10, minimum: 2 }, hours: 6, unit: "persona" },
    state: "ACTIVE", validFrom: null, validTo: null,
  }));
  const now = Date.now();
  const logisticsCalculation = await calculateLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_CALCULATE", {
    caseRef: pipelineCase.publicRef,
    intervalStart: new Date(now + 3_600_000).toISOString(), intervalEnd: new Date(now + 9 * 3_600_000).toISOString(),
  }));
  const logisticsRevision = await publishLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_PUBLISH", {
    calculationRef: logisticsCalculation.calculationRef,
  }));

  await versionCostingRule(prisma, context, signed(costingHash, "COSTING_RULE_VERSION", {
    seriesRef: null, family: "LABOR", code: "QUOTE_CREW_HOUR", name: "Quote crew hour", classification: "PR", source: "ADMIN",
    priority: 100, specificity: 10, conditions: { role: "PACKER" }, unitCost: "450", currency: "DOP",
    minimumMarginBps: 2500, recommendedMarginBps: 3500, result: { unit: "HOUR" }, state: "ACTIVE", validFrom: null, validTo: null,
  }));
  const costingCalculation = await calculateCosting(prisma, context, signed(costingHash, "COSTING_CALCULATE", {
    caseRef: pipelineCase.publicRef, logisticsPlanRevisionRef: logisticsRevision.revisionRef, baseCurrency: "DOP",
  }));
  const published = await publishCosting(prisma, context, signed(costingHash, "COSTING_PUBLISH", {
    calculationRef: costingCalculation.calculationRef,
  }));
  const costing = await prisma.costingRevision.findFirstOrThrow({
    where: { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, revisionRef: published.revisionRef, status: "PUBLISHED" },
    include: { lines: true, issues: true, pipelineCase: true },
  });
  assert.equal(costing.issues.some((issue) => issue.severity === "BLOCKER" && issue.status === "OPEN"), false);
  assert.ok(costing.lines.some((line) => line.suggestedPrice != null));
  assert.equal(costing.publishedByMembershipId, membership.id);
  assert.equal(costing.publishedByUserId, user.id);
  return {
    costing,
    context: { ...context, effectivePermissions: [...quotePermissions] },
  };
}
