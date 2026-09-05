import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculateLogistics, publishLogistics, versionLogisticsRule } from "../api/_lib/logisticsEngineDomain.js";
import { canonicalHash as logisticsHash } from "../api/_lib/logisticsEngineContract.js";
import { calculateCosting, publishCosting, versionCostingRule } from "../api/_lib/costingDomain.js";
import { costingHash } from "../api/_lib/costingContract.js";
import { createQuoteProposal, publishQuoteProposal, recordQuoteDecision, sendQuoteProposal } from "../api/_lib/quoteDomain.js";
import { quoteHash } from "../api/_lib/quoteContract.js";

const EXPECTED_DATABASE = "v17_consolidated_preview_10b";
const EXPECTED_BRANCH = "br-mute-credit-ahxnvfx0";
const EXPECTED_MODE = "PREVIEW_REHEARSAL";
const EXPECTED_BATCH = "V17-PREVIEW-ENVIRONMENT-10B";
const TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B";
const SECOND_TENANT_CODE = "V17-CONSOLIDATED-PREVIEW-10B-X";
const CREDENTIALS_PATH = ".env.v17-consolidated-preview-10b.local";

function storedPasswordFor(email) {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  const entries = Object.fromEntries(readFileSync(CREDENTIALS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return separator < 1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const prefix = Object.keys(entries).find((key) => key.endsWith("_EMAIL") && entries[key] === email)?.slice(0, -6);
  return prefix ? entries[`${prefix}_PASSWORD`] || null : null;
}

function fail(message) { throw new Error(`V17_PREVIEW_SEED_BLOCKED:${message}`); }
function exact(value, expected, name) { if (value !== expected) fail(`${name}_INVALID`); }
function stableUuid(label) {
  const bytes = createHash("sha256").update(`osi-plus-v17-preview-10b:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sha(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function signed(hash, operation, payload, label) {
  const requestId = stableUuid(label);
  return { requestId, payloadHash: hash({ operation, requestId, ...payload }), ...payload };
}

function guardEnvironment() {
  exact(process.env.V17_PREVIEW_SEED_MODE, EXPECTED_MODE, "MODE");
  exact(process.env.V17_PREVIEW_SEED_BATCH, EXPECTED_BATCH, "BATCH");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") fail("PRODUCTION_ENVIRONMENT");
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL_MISSING");
  const url = new URL(raw);
  exact(decodeURIComponent(url.pathname.slice(1)), EXPECTED_DATABASE, "DATABASE");
  exact(url.searchParams.get("schema"), "osi", "SCHEMA");
  if (/fragrant-night|bitter-bush/i.test(url.hostname) || /\bmain\b/i.test(url.pathname)) fail("KNOWN_PRODUCTION_TARGET");
  return raw;
}

const raw = guardEnvironment();
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });

const adminPermissions = [
  "pipeline:view", "pipeline:create", "pipeline:update:any", "pipeline:destination-pending:create",
  "membership:view", "membership:invite", "membership:role:assign", "membership:status:manage",
  "services:catalog:view", "services:catalog:manage", "services:case:view", "services:case:manage",
  "survey:view", "survey:assign", "survey:perform", "survey:publish", "survey:tenant",
  "materials:view", "materials:manage", "inventory:view", "inventory:manage",
  "assets:view", "assets:manage",
  "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:plan:tenant", "logistics:plan:override", "logistics:plan:resolve", "logistics:rules:view", "logistics:rules:manage",
  "costing:view", "costing:calculate", "costing:publish", "costing:tenant", "costing:override", "costing:authorize-margin", "costing:resolve", "costing:rules:view", "costing:rules:manage",
  "quote:view", "quote:create", "quote:update", "quote:publish", "quote:send", "quote:record-client-decision", "quote:override-price", "quote:internal-cost:view", "quote:tenant",
];
const evaluatorPermissions = ["pipeline:view", "services:case:view", "survey:view", "survey:perform", "survey:publish"];

async function ensureIdentity(email, code, name, role, permissions, deniedPermissions = []) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const membership = await prisma.tenantMembership.findFirst({ where: { userId: existing.id, tenant: { code: TENANT_CODE } } });
    if (existsSync(CREDENTIALS_PATH)) return { user: existing, membership, password: null };
    const password = randomBytes(36).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    return { user, membership, password, permissions, deniedPermissions };
  }
  const storedPassword = storedPasswordFor(email);
  const password = storedPassword || randomBytes(36).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { code, name, email, normalizedEmail: email, phone: "+12025550100", role, status: "ACTIVE", department: "Preview sintético", joinDate: "2026-09-05", passwordHash } });
  return { user, membership: null, password: storedPassword ? null : password, permissions, deniedPermissions };
}

async function ensureMembership(tenant, identity, role, permissions, deniedPermissions = [], isDefault = true) {
  const existing = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: identity.user.id } });
  if (existing) return existing;
  return prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: identity.user.id, role, status: "ACTIVE", isDefault, grantedPermissions: permissions, deniedPermissions, provisioningSource: "MANUAL", provisioningBatchId: EXPECTED_BATCH } });
}

async function ensureClient(tenantId, position, name) {
  const code = `PV10B-CLI-${position}`;
  const found = await prisma.client.findUnique({ where: { code } });
  if (found) return found;
  return prisma.client.create({ data: { tenantId, code, name, email: `client-${position}@example.invalid`, normalizedEmail: `client-${position}@example.invalid`, phone: `+120255501${String(position).padStart(2, "0")}`, normalizedPhone: `120255501${String(position).padStart(2, "0")}`, address: "Dirección sintética Preview", type: position === 1 ? "PERSON" : "ORGANIZATION", status: "ACTIVE", totalServices: 0, createdAt: "2026-09-05" } });
}

async function ensureAddress(tenantId, clientId, label, city, countryCode = "DO") {
  const existing = await prisma.clientAddress.findFirst({ where: { tenantId, clientId, label } });
  if (existing) return existing;
  return prisma.clientAddress.create({ data: { tenantId, clientId, countryCode, provinceState: countryCode === "DO" ? "Distrito Nacional" : "Florida", cityMunicipality: city, sector: "Sector Preview", streetAndNumber: "Calle Sintética 10B #1", buildingResidential: "Edificio Preview", floorUnit: "Nivel 1", arrivalReference: "Referencia ficticia", locationContactName: "Contacto Sintético", locationContactPhone: "+12025550199", label } });
}

async function ensureService(tenantId, code, name, modes, usage = "PRIMARY") {
  const existing = await prisma.serviceCatalogItem.findFirst({ where: { tenantId, code } });
  return existing || prisma.serviceCatalogItem.create({ data: { tenantId, code, name, category: "PREVIEW_SYNTHETIC", usage, compatibleModes: modes, sortOrder: 10 } });
}

async function ensureCase({ tenant, client, owner, code, mode, service, cbm, requiresSurvey, destinationStatus, origin, destination }) {
  let row = await prisma.pipelineCase.findFirst({ where: { tenantId: tenant.id, caseCode: code } });
  if (row && row.routeRevision > 0 && await prisma.pipelineCaseRouteSnapshot.count({ where: { tenantId: tenant.id, pipelineCaseId: row.id } }) === 0) {
    await prisma.pipelineCase.delete({ where: { id: row.id } });
    row = null;
  }
  if (!row) {
    row = await prisma.pipelineCase.create({ data: { tenantId: tenant.id, clientId: client.id, caseCode: code, clientName: "LEGACY_VALUE_NOT_AUTHORITY", mode, serviceType: service.name, customerType: "L4_PERSONAL", status: "NEW_INBOX", ownerName: owner.user.name, ownerMembershipId: owner.membership.id, ownerUserId: owner.user.id, estimatedCbm: cbm, requiresSurvey, surveyMethod: requiresSurvey ? "PRESENCIAL" : "NO_APLICA", flags: ["PREVIEW_SYNTHETIC"], originLocation: "SNAPSHOT_STRUCTURED", destinationLocation: destinationStatus === "PENDING" ? "PENDING" : "SNAPSHOT_STRUCTURED", destinationContracted: destinationStatus !== "PENDING", caseContactName: `Contacto ${code}`, caseContactPhone: "+12025550188", caseContactPhoneNormalized: "+12025550188", caseContactEmail: `${code.toLowerCase()}@example.invalid`, caseContactEmailNormalized: `${code.toLowerCase()}@example.invalid`, intakeChannel: "WEB", clientProfileType: "INDIVIDUAL" } });
  }
  const routeCount = await prisma.pipelineCaseRouteSnapshot.count({ where: { tenantId: tenant.id, pipelineCaseId: row.id, routeVersion: 1 } });
  if (routeCount === 0) {
    if (row.routeRevision !== 0 || row.routeContractVersion !== 1) fail("MALFORMED_CASE_ROUTE_STATE");
    await prisma.pipelineCaseRouteSnapshot.create({ data: { tenantId: tenant.id, pipelineCaseId: row.id, routeVersion: 1, role: "ORIGIN", stopOrder: 0, sourceAddressRef: origin.addressRef, countryCode: origin.countryCode, provinceState: origin.provinceState, cityMunicipality: origin.cityMunicipality, sector: origin.sector, streetAndNumber: origin.streetAndNumber, buildingResidential: origin.buildingResidential, floorUnit: origin.floorUnit, arrivalReference: origin.arrivalReference, locationContactName: origin.locationContactName, locationContactPhone: origin.locationContactPhone } });
    if (destinationStatus !== "PENDING") await prisma.pipelineCaseRouteSnapshot.create({ data: { tenantId: tenant.id, pipelineCaseId: row.id, routeVersion: 1, role: "DESTINATION", stopOrder: 0, sourceAddressRef: destination.addressRef, countryCode: destination.countryCode, provinceState: destination.provinceState, cityMunicipality: destination.cityMunicipality, sector: destination.sector, streetAndNumber: destination.streetAndNumber, buildingResidential: destination.buildingResidential, floorUnit: destination.floorUnit, arrivalReference: destination.arrivalReference, locationContactName: destination.locationContactName, locationContactPhone: destination.locationContactPhone } });
  }
  if (row.routeRevision !== 1 || row.routeContractVersion !== 2 || row.destinationStatus !== destinationStatus) row = await prisma.pipelineCase.update({ where: { id: row.id }, data: { routeContractVersion: 2, routeRevision: 1, destinationStatus } });
  let revision = await prisma.pipelineCaseServiceRevision.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: row.id, revision: 1 }, include: { items: true } });
  if (!revision) revision = await prisma.pipelineCaseServiceRevision.create({ data: { tenantId: tenant.id, pipelineCaseId: row.id, revision: 1, modeSnapshot: mode, source: "MANUAL", createdByMembershipId: owner.membership.id, createdByUserId: owner.user.id, items: { create: [{ serviceId: service.id, kind: "PRIMARY", source: "MANUAL", position: 0, serviceRefSnapshot: service.serviceRef, codeSnapshot: service.code, nameSnapshot: service.name, categorySnapshot: service.category, catalogVersionSnapshot: service.version }] } }, include: { items: true } });
  return { ...row, serviceRevision: revision };
}

async function ensureSurveyFixture(tenant, actor, evaluator, scenario, material) {
  let catalog = await prisma.surveyCatalogVersion.findFirst({ where: { tenantId: tenant.id, version: 1 } });
  if (!catalog) catalog = await prisma.surveyCatalogVersion.create({ data: { tenantId: tenant.id, version: 1, status: "ACTIVE", activatedAt: new Date(), createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  let area = await prisma.surveyAreaCatalogItem.findFirst({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code: "LIVING" } });
  if (!area) area = await prisma.surveyAreaCatalogItem.create({ data: { tenantId: tenant.id, catalogVersionId: catalog.id, areaRef: stableUuid("survey-area-living"), code: "LIVING", name: "Sala sintética", sortOrder: 1 } });
  let article = await prisma.surveyArticleCatalogItem.findFirst({ where: { tenantId: tenant.id, catalogVersionId: catalog.id, code: "FRAGILE-BOX" } });
  if (!article) article = await prisma.surveyArticleCatalogItem.create({ data: { tenantId: tenant.id, catalogVersionId: catalog.id, articleRef: stableUuid("survey-article-fragile"), code: "FRAGILE-BOX", name: "Artículo frágil sintético", aliases: ["preview"], frequentAreaRefs: [area.areaRef], defaultVolumeM3: "1.25", defaultWeightKg: "25", weightSource: "CATALOG", sortOrder: 1 } });
  let assignment = await prisma.surveyAssignment.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id } });
  if (!assignment) assignment = await prisma.surveyAssignment.create({ data: { tenantId: tenant.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, routeVersion: 1, evaluatorMembershipId: evaluator.membership.id, evaluatorUserId: evaluator.user.id, scheduledStart: new Date("2026-09-12T13:00:00Z"), scheduledEnd: new Date("2026-09-12T15:00:00Z"), status: "COMPLETED", arrivalAt: new Date("2026-09-12T12:58:00Z"), punctualityConfirmedAt: new Date("2026-09-12T12:58:00Z"), contextSnapshot: { synthetic: true, caseCode: scenario.caseCode }, instructionSnapshot: "Evidencia sintética Preview", createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  let draft = await prisma.surveyDraft.findFirst({ where: { tenantId: tenant.id, assignmentId: assignment.id, revision: 1 } });
  if (!draft) draft = await prisma.surveyDraft.create({ data: { tenantId: tenant.id, assignmentId: assignment.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, catalogVersionId: catalog.id, routeVersion: 1, revision: 1, status: "PUBLISHED", notes: "Survey sintético publicado" } });
  if (!await prisma.surveyDraftItem.findFirst({ where: { tenantId: tenant.id, draftId: draft.id, sortOrder: 1 } })) {
    await prisma.surveyDraftItem.create({ data: { tenantId: tenant.id, draftId: draft.id, catalogVersionId: catalog.id, catalogItemId: article.id, areaCatalogItemId: area.id, articleRefSnapshot: article.articleRef, articleCodeSnapshot: article.code, articleNameSnapshot: article.name, areaRefSnapshot: area.areaRef, areaCodeSnapshot: area.code, areaNameSnapshot: area.name, shipmentMode: "SEA", quantity: 2, condition: "GOOD", flags: ["CRATING_CANDIDATE", "FRAGILE"], originalUnit: "CM", originalDimensions: { length: 100, width: 80, height: 70 }, lengthCm: "100", widthCm: "80", heightCm: "70", unitVolumeM3: "0.56", unitWeightKg: "25", volumeSource: "MEASURED", weightSource: "CATALOG", note: "Fixture Preview", sortOrder: 1 } });
  }
  let publication = await prisma.surveyPublication.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, status: "CURRENT" } });
  if (!publication) {
    const pdf = await prisma.surveyBlobObject.create({ data: { tenantId: tenant.id, provider: "PREVIEW_LOCAL_GATED", storageKey: `preview/${scenario.caseCode}/survey.pdf`, mimeType: "application/pdf", sizeBytes: 128, sha256: sha(`synthetic-pdf-${scenario.caseCode}`) } });
    publication = await prisma.surveyPublication.create({ data: { tenantId: tenant.id, draftId: draft.id, pipelineCaseId: scenario.id, serviceRevisionId: scenario.serviceRevision.id, revision: 1, routeVersion: 1, catalogVersion: 1, serviceSelectionRef: scenario.serviceRevision.selectionRef, contextSnapshot: { synthetic: true, distanceKm: 15 }, totalsSnapshot: { totalVolumeM3: 1.12, totalWeightKg: 50, itemCount: 2, cratingCandidates: 1 }, logicalSha256: sha(`survey-${scenario.caseCode}`), pdfBlobObjectId: pdf.id, pdfSha256: pdf.sha256, publishedByMembershipId: evaluator.membership.id, publishedByUserId: evaluator.user.id } });
    await prisma.surveyPublicationItem.create({ data: { tenantId: tenant.id, publicationId: publication.id, position: 1, articleRef: article.articleRef, articleCode: article.code, articleName: article.name, areaRef: area.areaRef, areaCode: area.code, areaName: area.name, shipmentMode: "SEA", quantity: 2, condition: "GOOD", flags: ["CRATING_CANDIDATE", "FRAGILE"], measurements: { lengthCm: 100, widthCm: 80, heightCm: 70 }, unitVolumeM3: "0.56", unitWeightKg: "25", metricSources: { volume: "MEASURED", weight: "CATALOG" }, note: "Fixture sintético" } });
    await prisma.surveyPublicationAccess.createMany({ data: [{ tenantId: tenant.id, publicationId: publication.id, side: "ORIGIN", factsSnapshot: { stairs: true, narrowAccess: false } }, { tenantId: tenant.id, publicationId: publication.id, side: "DESTINATION", factsSnapshot: { elevator: true } }] });
  }
  let recipe = await prisma.packingRecipe.findFirst({ where: { tenantId: tenant.id, code: "EXPORT-CRATING" } });
  if (!recipe) recipe = await prisma.packingRecipe.create({ data: { tenantId: tenant.id, code: "EXPORT-CRATING", name: "Receta sintética Export Crating" } });
  let recipeVersion = await prisma.packingRecipeVersion.findFirst({ where: { tenantId: tenant.id, recipeId: recipe.id, version: 1 } });
  if (!recipeVersion) recipeVersion = await prisma.packingRecipeVersion.create({ data: { tenantId: tenant.id, recipeId: recipe.id, version: 1, status: "ACTIVE", applicability: { modes: ["EXPORT"], flags: ["CRATING_CANDIDATE"] }, applicabilitySha256: sha(JSON.stringify({ modes: ["EXPORT"], flags: ["CRATING_CANDIDATE"] })), activatedAt: new Date(), createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  if (!await prisma.packingRecipeLine.findFirst({ where: { tenantId: tenant.id, recipeVersionId: recipeVersion.id, position: 1 } })) {
    await prisma.packingRecipeLine.create({ data: { tenantId: tenant.id, recipeVersionId: recipeVersion.id, position: 1, materialId: material.id, unitId: material.baseUnitId, formulaType: "FIXED", fixedQuantity: "4", roundingIncrement: "1", wastePercent: "5", formulaConfig: { synthetic: true } } });
  }
  let requirement = await prisma.materialRequirementSnapshot.findFirst({ where: { tenantId: tenant.id, pipelineCaseId: scenario.id, status: "CURRENT" } });
  if (!requirement) requirement = await prisma.materialRequirementSnapshot.create({ data: { tenantId: tenant.id, surveyPublicationId: publication.id, pipelineCaseId: scenario.id, recipeVersionId: recipeVersion.id, revision: 1, contextSnapshot: { synthetic: true, surveyPublicationRef: publication.publicationRef }, logicalSha256: sha(`materials-${scenario.caseCode}`), createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  if (!await prisma.materialRequirementLine.findFirst({ where: { tenantId: tenant.id, requirementSnapshotId: requirement.id, position: 1 } })) {
    await prisma.materialRequirementLine.create({ data: { tenantId: tenant.id, requirementSnapshotId: requirement.id, position: 1, materialId: material.id, unitId: material.baseUnitId, requiredQuantity: "4", formulaSnapshot: { formulaType: "FIXED", fixedQuantity: 4 }, sourceSnapshot: { recipeVersion: 1, synthetic: true } } });
  }
  return { catalog, publication, requirement };
}

async function ensureResources(tenant, actor) {
  let unit = await prisma.materialUnit.findFirst({ where: { tenantId: tenant.id, code: "EA" } });
  if (!unit) unit = await prisma.materialUnit.create({ data: { tenantId: tenant.id, code: "EA", name: "Unidad", decimalPlaces: 0 } });
  let material = await prisma.materialCatalogItem.findFirst({ where: { tenantId: tenant.id, code: "CRATE-PANEL" } });
  if (!material) material = await prisma.materialCatalogItem.create({ data: { tenantId: tenant.id, code: "CRATE-PANEL", name: "Panel de madera sintético", family: "CRATING", baseUnitId: unit.id, purchaseUnitId: unit.id, consumptionUnitId: unit.id, minimumStock: "2", reorderPoint: "4" } });
  if (!await prisma.materialCostVersion.findFirst({ where: { tenantId: tenant.id, materialId: material.id, version: 1 } })) await prisma.materialCostVersion.create({ data: { tenantId: tenant.id, materialId: material.id, unitId: unit.id, amount: "350", currency: "DOP", source: "PREVIEW_SYNTHETIC", validFrom: new Date("2026-09-01T00:00:00Z"), version: 1, createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  let warehouse = await prisma.materialWarehouse.findFirst({ where: { tenantId: tenant.id, code: "PREVIEW" } });
  if (!warehouse) warehouse = await prisma.materialWarehouse.create({ data: { tenantId: tenant.id, code: "PREVIEW", name: "Almacén sintético Preview" } });
  let location = await prisma.materialLocation.findFirst({ where: { tenantId: tenant.id, warehouseId: warehouse.id, code: "A-01" } });
  if (!location) location = await prisma.materialLocation.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, code: "A-01", name: "Ubicación sintética", kind: "BIN", depth: 0, path: "A-01" } });
  let assetModel = await prisma.assetModel.findFirst({ where: { tenantId: tenant.id, code: "HAND-TRUCK" } });
  if (!assetModel) assetModel = await prisma.assetModel.create({ data: { tenantId: tenant.id, code: "HAND-TRUCK", name: "Carretilla sintética", family: "HANDLING", resourceType: "TOOL", serialPolicy: "OPTIONAL", capacity: { kilograms: 250 } } });
  let asset = await prisma.assetInstance.findFirst({ where: { tenantId: tenant.id, internalCode: "PREVIEW-HT-001" } });
  if (!asset) asset = await prisma.assetInstance.create({ data: { tenantId: tenant.id, assetModelId: assetModel.id, currentLocationId: location.id, internalCode: "PREVIEW-HT-001", serialNumber: "SYNTHETIC-001", operationalStatus: "AVAILABLE", physicalCondition: "GOOD", acquiredAt: new Date("2026-01-01"), acquisitionCost: "10000", replacementCost: "12000", currency: "DOP" } });
  if (!await prisma.assetCostVersion.findFirst({ where: { tenantId: tenant.id, assetModelId: assetModel.id, costType: "INTERNAL_RATE", version: 1 } })) await prisma.assetCostVersion.create({ data: { tenantId: tenant.id, assetModelId: assetModel.id, costType: "INTERNAL_RATE", amount: "500", currency: "DOP", temporalUnit: "DAY", validFrom: new Date("2026-09-01T00:00:00Z"), version: 1, source: "PREVIEW_SYNTHETIC", createdByMembershipId: actor.membership.id, createdByUserId: actor.user.id } });
  return { unit, material, warehouse, location, assetModel, asset };
}

async function ensureRules(context) {
  const logistics = [
    { label: "log-rule-labor", family: "LABOR", code: "PREVIEW_CREW", name: "Cuadrilla sintética", conditions: {}, result: { kind: "PACKER", label: "Empacadores", quantity: { basis: "VOLUME_M3", divisor: 10, minimum: 2 }, hours: 6, unit: "persona" } },
    { label: "log-rule-crating", family: "CRATING", code: "PREVIEW_CRATING", name: "Crating sintético", conditions: { serviceCodes: ["EXPORT_CRATING"] }, result: { kind: "CRATING_CREW", label: "Preparación Crating", quantity: 1, hours: 4, unit: "servicio" } },
    { label: "log-rule-provider", family: "EXTERNAL", code: "PREVIEW_PROVIDER", name: "Proveedor pendiente sintético", conditions: { serviceCodes: ["OUTSOURCE_PENDING"] }, result: { kind: "EXTERNAL_RESOURCE", label: "Proveedor especializado pendiente", quantity: 1, unit: "servicio", availabilitySource: "PROVIDER", sourceCode: "EXTERNAL_RESOURCE", shortageSeverity: "BLOCKER" } },
  ];
  for (const item of logistics) {
    if (await prisma.logisticsRule.findFirst({ where: { tenantId: context.tenantId, code: item.code, state: "ACTIVE" } })) continue;
    const payload = { seriesRef: stableUuid(`${item.label}-series`), family: item.family, code: item.code, name: item.name, priority: 100, specificity: item.code === "PREVIEW_CREW" ? 1 : 50, conditions: item.conditions, result: item.result, state: "ACTIVE", validFrom: null, validTo: null };
    await versionLogisticsRule(prisma, context, signed(logisticsHash, "LOGISTICS_RULE_VERSION", payload, item.label));
  }
  const costingRules = [
    { label: "cost-rule-labor", family: "LABOR", code: "PREVIEW_LABOR_COST", conditions: { logisticsFamilies: ["LABOR"] }, unitCost: "450", result: { unit: "HOUR" } },
    { label: "cost-rule-crating", family: "CRATING", code: "PREVIEW_CRATING_COST", conditions: { logisticsFamilies: ["CRATING"] }, unitCost: "2500", result: { unit: "SERVICE" } },
    { label: "cost-rule-material", family: "MATERIAL", code: "PREVIEW_MATERIAL_MARGIN", conditions: { logisticsFamilies: ["MATERIAL"] }, unitCost: "1", result: { unit: "UNIT" } },
  ];
  for (const item of costingRules) {
    if (await prisma.costingRule.findFirst({ where: { tenantId: context.tenantId, code: item.code, state: "ACTIVE" } })) continue;
    const payload = { seriesRef: stableUuid(`${item.label}-series`), family: item.family, code: item.code, name: item.code.replaceAll("_", " "), classification: "PR", source: "ADMIN", priority: 100, specificity: 20, conditions: item.conditions, unitCost: item.unitCost, currency: "DOP", minimumMarginBps: 2500, recommendedMarginBps: 3500, result: item.result, state: "ACTIVE", validFrom: null, validTo: null };
    await versionCostingRule(prisma, context, signed(costingHash, "COSTING_RULE_VERSION", payload, item.label));
  }
}

async function ensurePlans(context, scenarios) {
  const results = new Map();
  for (const scenario of scenarios) {
    const start = "2026-10-01T13:00:00.000Z";
    const end = "2026-10-01T21:00:00.000Z";
    const calcPayload = { caseRef: scenario.publicRef, intervalStart: start, intervalEnd: end };
    const calc = await calculateLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_CALCULATE", calcPayload, `log-calc-${scenario.caseCode}`));
    const plan = await publishLogistics(prisma, context, signed(logisticsHash, "LOGISTICS_PUBLISH", { calculationRef: calc.calculationRef }, `log-publish-${scenario.caseCode}`));
    const costCalcPayload = { caseRef: scenario.publicRef, logisticsPlanRevisionRef: plan.revisionRef, baseCurrency: "DOP" };
    const costCalc = await calculateCosting(prisma, context, signed(costingHash, "COSTING_CALCULATE", costCalcPayload, `cost-calc-v2-${scenario.caseCode}`));
    if (scenario.caseCode === "PV10B-C-PENDING") {
      assert.ok(costCalc.result.issues.some((item) => item.severity === "BLOCKER"), "Escenario C requiere blocker de Costing");
      results.set(scenario.caseCode, { plan, costing: costCalc });
      continue;
    }
    const unexpectedBlockers = costCalc.result.issues.filter((item) => item.severity === "BLOCKER").map((item) => `${item.code}-${item.family || "NONE"}`);
    if (unexpectedBlockers.length) fail(`UNEXPECTED_COSTING_BLOCKER_${scenario.caseCode}_${unexpectedBlockers.join("_")}`);
    const costing = await publishCosting(prisma, context, signed(costingHash, "COSTING_PUBLISH", { calculationRef: costCalc.calculationRef }, `cost-publish-v2-${scenario.caseCode}`));
    results.set(scenario.caseCode, { plan, costing });
  }
  return results;
}

function quoteDraft(costing, caseRef, position, name) {
  const first = costing.lines.find((line) => line.suggestedPrice != null);
  assert.ok(first, "Costing publicado requiere una línea cotizable");
  return { caseRef, costingRevisionRef: costing.revisionRef, position, proposalName: name, currency: costing.baseCurrency, issueDate: "2026-09-05", validUntil: "2026-10-05", commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null }, payer: { kind: "CLIENT", reference: "PREVIEW-PAYER", displayName: "Pagador sintético", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null }, terms: { paymentTerms: "Contado", scope: "Alcance sintético Preview", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null }, exchange: null, discount: null, marginAuthorizationRef: null, lines: [{ sourceKind: "COSTING", costingLineRef: first.lineRef, concept: first.concept, quantity: String(first.quantity), unit: first.unit, economicClass: first.classification, quotedPrice: String(first.suggestedPrice), currency: costing.baseCurrency, reason: null, manualAuthority: null }] };
}

async function ensureScenarioDQuotes(context, scenario, costing) {
  const names = ["Esencial", "Recomendada", "Integral"];
  const proposals = [];
  for (let i = 0; i < 3; i += 1) {
    const payload = quoteDraft(costing, scenario.publicRef, i + 1, names[i]);
    proposals.push(await createQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_CREATE", payload, `quote-create-${i + 1}`)));
  }
  let accepted = proposals[1];
  if (accepted.state === "DRAFT") accepted = await publishQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_PUBLISH", { proposalRef: accepted.proposalRef, expectedRevision: accepted.revision }, "quote-publish-2"));
  if (accepted.state === "READY") accepted = await sendQuoteProposal(prisma, context, signed(quoteHash, "QUOTE_PROPOSAL_SEND", { proposalRef: accepted.proposalRef, expectedRevision: accepted.revision, channel: "MANUAL", recipient: { kind: "RECIPIENT_ON_FILE", displayName: null, reference: null, present: true }, evidenceRef: null }, "quote-send-2"));
  if (accepted.state === "SENT") accepted = await recordQuoteDecision(prisma, context, signed(quoteHash, "QUOTE_CLIENT_DECISION", { proposalRef: accepted.proposalRef, expectedRevision: accepted.revision, decision: "ACCEPTED", method: "SIGNED_DOCUMENT", decidedBy: { kind: "CLIENT_REPRESENTATIVE", displayName: null, reference: null, present: true }, evidenceRef: "PREVIEW-SYNTHETIC-ACCEPTANCE", reason: null }, "quote-accept-2"));
  return { proposals, accepted };
}

async function writeCredentials(identities) {
  const created = identities.filter((item) => item.password);
  if (!created.length) return;
  if (existsSync(CREDENTIALS_PATH)) fail("CREDENTIALS_FILE_ALREADY_EXISTS");
  const lines = created.flatMap((item) => [`${item.key}_EMAIL=${item.user.email}`, `${item.key}_PASSWORD=${item.password}`]);
  writeFileSync(CREDENTIALS_PATH, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { chmodSync(CREDENTIALS_PATH, 0o600); } catch { /* Windows ACL is tightened by the caller. */ }
}

async function main() {
  const identity = await prisma.$queryRawUnsafe(`SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch`);
  exact(identity[0]?.database, EXPECTED_DATABASE, "DATABASE_RUNTIME");
  exact(identity[0]?.branch, EXPECTED_BRANCH, "BRANCH_RUNTIME");
  const migrations = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM osi._prisma_migrations ORDER BY migration_name`);
  if (migrations.length !== 29 || migrations.some((row) => !row.finished_at || row.rolled_back_at || row.applied_steps_count !== 1)) fail("MIGRATIONS_NOT_29_COMPLETE");

  const tenant = await prisma.tenant.upsert({ where: { code: TENANT_CODE }, update: {}, create: { code: TENANT_CODE, name: "International Packers — Preview sintético", countryCode: "DO", defaultCurrency: "DOP", provisioningSource: "MANUAL", provisioningBatchId: EXPECTED_BATCH } });
  const crossTenant = await prisma.tenant.upsert({ where: { code: SECOND_TENANT_CODE }, update: {}, create: { code: SECOND_TENANT_CODE, name: "Tenant B — Preview sintético", countryCode: "US", defaultCurrency: "USD", provisioningSource: "MANUAL", provisioningBatchId: EXPECTED_BATCH } });
  const adminIdentity = await ensureIdentity("admin-preview-10b@example.invalid", "PV10B-A", "Administrador Preview", "A", adminPermissions);
  const evaluatorIdentity = await ensureIdentity("evaluator-preview-10b@example.invalid", "PV10B-E", "Evaluador Preview", "E", evaluatorPermissions);
  const denyIdentity = await ensureIdentity("deny-preview-10b@example.invalid", "PV10B-D", "Usuario Deny Preview", "V", ["pipeline:view"], ["pipeline:view"]);
  const adminMembership = await ensureMembership(tenant, adminIdentity, "A", adminPermissions);
  const evaluatorMembership = await ensureMembership(tenant, evaluatorIdentity, "E", evaluatorPermissions);
  const denyMembership = await ensureMembership(tenant, denyIdentity, "V", [], ["pipeline:view"]);
  await ensureMembership(crossTenant, adminIdentity, "A", ["pipeline:view"], [], false);
  adminIdentity.membership = adminMembership; evaluatorIdentity.membership = evaluatorMembership; denyIdentity.membership = denyMembership;
  await writeCredentials([{ ...adminIdentity, key: "V17_PREVIEW_ADMIN" }, { ...evaluatorIdentity, key: "V17_PREVIEW_EVALUATOR" }, { ...denyIdentity, key: "V17_PREVIEW_DENY" }]);

  const clients = await Promise.all([
    ensureClient(tenant.id, 1, "Familia Horizonte — Sintético"),
    ensureClient(tenant.id, 2, "Exportadora Aurora — Sintético"),
    ensureClient(tenant.id, 3, "Proyecto Tercero — Sintético"),
    ensureClient(tenant.id, 4, "Corporación Tres Opciones — Sintético"),
  ]);
  const addresses = [];
  for (let i = 0; i < clients.length; i += 1) addresses.push({ origin: await ensureAddress(tenant.id, clients[i].id, "ORIGEN", "Santo Domingo", "DO"), destination: await ensureAddress(tenant.id, clients[i].id, "DESTINO", i === 1 ? "Miami" : "Santiago", i === 1 ? "US" : "DO") });
  const services = await Promise.all([
    ensureService(tenant.id, "LOCAL_SIMPLE", "Mudanza local simple", ["LOCAL"]),
    ensureService(tenant.id, "EXPORT_CRATING", "Exportación con Crating", ["EXPORT"]),
    ensureService(tenant.id, "OUTSOURCE_PENDING", "Servicio con proveedor pendiente", ["LOCAL"]),
    ensureService(tenant.id, "PREMIUM_MOVE", "Mudanza integral tres propuestas", ["LOCAL"]),
  ]);
  const owner = { user: adminIdentity.user, membership: adminMembership };
  const scenarios = [
    await ensureCase({ tenant, client: clients[0], owner, code: "PV10B-A-LOCAL", mode: "LOCAL", service: services[0], cbm: 12, requiresSurvey: false, destinationStatus: "CONFIRMED", ...addresses[0] }),
    await ensureCase({ tenant, client: clients[1], owner, code: "PV10B-B-EXPORT", mode: "EXPORT", service: services[1], cbm: 20, requiresSurvey: true, destinationStatus: "CONFIRMED", ...addresses[1] }),
    await ensureCase({ tenant, client: clients[2], owner, code: "PV10B-C-PENDING", mode: "LOCAL", service: services[2], cbm: 8, requiresSurvey: false, destinationStatus: "CONFIRMED", ...addresses[2] }),
    await ensureCase({ tenant, client: clients[3], owner, code: "PV10B-D-QUOTES", mode: "LOCAL", service: services[3], cbm: 18, requiresSurvey: false, destinationStatus: "CONFIRMED", ...addresses[3] }),
  ];
  const resources = await ensureResources(tenant, owner);
  await ensureSurveyFixture(tenant, owner, { user: evaluatorIdentity.user, membership: evaluatorMembership }, scenarios[1], resources.material);
  if (!await prisma.externalResourceOffer.findFirst({ where: { tenantId: tenant.id, providerReference: "PREVIEW-PENDING-PROVIDER" } })) await prisma.externalResourceOffer.create({ data: { tenantId: tenant.id, providerReference: "PREVIEW-PENDING-PROVIDER", providerNameSnapshot: "Proveedor sintético pendiente", resourceDescription: "Servicio externo sintético", capacity: { quantity: 1 }, rateAmount: null, currency: null, temporalUnit: "SERVICE", availabilityStatus: "UNCONFIRMED", termsSnapshot: { synthetic: true }, contractualReference: null } });
  const context = { tenantId: tenant.id, membershipId: adminMembership.id, userId: adminIdentity.user.id, role: "A", effectivePermissions: adminPermissions, deniedPermissions: [] };
  await ensureRules(context);
  const plans = await ensurePlans(context, scenarios);
  const scenarioDQuotes = await ensureScenarioDQuotes(context, scenarios[3], plans.get("PV10B-D-QUOTES").costing);

  const counts = { tenants: await prisma.tenant.count({ where: { code: { in: [TENANT_CODE, SECOND_TENANT_CODE] } } }), users: await prisma.user.count({ where: { email: { in: [adminIdentity.user.email, evaluatorIdentity.user.email, denyIdentity.user.email] } } }), memberships: await prisma.tenantMembership.count({ where: { provisioningBatchId: EXPECTED_BATCH } }), cases: await prisma.pipelineCase.count({ where: { tenantId: tenant.id } }), clients: await prisma.client.count({ where: { tenantId: tenant.id } }), services: await prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }), surveys: await prisma.surveyPublication.count({ where: { tenantId: tenant.id } }), materials: await prisma.materialCatalogItem.count({ where: { tenantId: tenant.id } }), assets: await prisma.assetInstance.count({ where: { tenantId: tenant.id } }), plans: await prisma.logisticsPlanRevision.count({ where: { tenantId: tenant.id, status: "PUBLISHED" } }), costings: await prisma.costingRevision.count({ where: { tenantId: tenant.id, status: "PUBLISHED" } }), proposals: await prisma.quoteProposal.count({ where: { tenantId: tenant.id, pipelineCaseId: scenarios[3].id } }), accepted: await prisma.quoteProposal.count({ where: { tenantId: tenant.id, pipelineCaseId: scenarios[3].id, state: "ACCEPTED" } }) };
  assert.deepEqual({ tenants: counts.tenants, users: counts.users, memberships: counts.memberships, cases: counts.cases, clients: counts.clients }, { tenants: 2, users: 3, memberships: 4, cases: 4, clients: 4 });
  assert.equal(counts.proposals, 3); assert.equal(counts.accepted, 1);
  const pendingPlan = plans.get("PV10B-C-PENDING").plan;
  assert.ok(pendingPlan.issues.some((item) => item.code === "EXTERNAL_PRICE_PENDING" && item.severity === "BLOCKER"));
  console.log(JSON.stringify({ ok: true, batch: EXPECTED_BATCH, migrations: "29/29", scenarios: 4, syntheticOnly: true, idempotent: true, counts, scenarioCBlocker: true, scenarioDAccepted: scenarioDQuotes.accepted.state === "ACCEPTED", productionApiEnabled: false }));
}

try { await main(); } finally { await prisma.$disconnect(); }
