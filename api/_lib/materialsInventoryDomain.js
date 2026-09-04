import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { MaterialsInventoryError, canonicalPayloadHash, inventoryAvailability, normalizeCostVersionCreate, normalizeMaterialCreate, normalizeMaterialUpdate, normalizeMovement, normalizePurchaseRequest, normalizePurchaseTransition, normalizeRecipeCreate, normalizeRecipeVersionCreate, normalizeRequirementResolution, normalizeReservation, normalizeReservationAssign, normalizeReservationRelease, normalizeUnitConversionCreate, normalizeUnitCreate, normalizeWarehouseCreate, resolveRecipeQuantity } from "./materialsInventoryContract.js";

function fail(code, status = 400) { throw new MaterialsInventoryError(code, status); }
function requirePermission(context, permission) { if (!context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) fail("MATERIALS_FORBIDDEN", 403); }
function actor(context) { return { actorMembershipId: context.membershipId, actorUserId: context.userId }; }
function audit(context, action, entity, entityId, requestId, after) {
  return { tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId, role_snapshot: context.role, action, entity, entityId, after_json: after, source: "V17_MATERIALS_INVENTORY", request_id: requestId, correlation_id: requestId, critical: true };
}
function publicMaterial(row, balance = null) {
  const currentCost = row.costs?.[0];
  return Object.freeze({ materialRef: row.materialRef, code: row.code, name: row.name, description: row.description, family: row.family, subfamily: row.subfamily, baseUnit: row.baseUnit ? { unitRef: row.baseUnit.unitRef, code: row.baseUnit.code, name: row.baseUnit.name } : undefined, purchaseUnit: row.purchaseUnit ? { unitRef: row.purchaseUnit.unitRef, code: row.purchaseUnit.code, name: row.purchaseUnit.name } : undefined, consumptionUnit: row.consumptionUnit ? { unitRef: row.consumptionUnit.unitRef, code: row.consumptionUnit.code, name: row.consumptionUnit.name } : undefined, technicalFlags: row.technicalFlags, dimensionPolicy: row.dimensionPolicy, lotTrackingEnabled: row.lotTrackingEnabled, minimumStock: row.minimumStock == null ? null : Number(row.minimumStock), maximumStock: row.maximumStock == null ? null : Number(row.maximumStock), reorderPoint: row.reorderPoint == null ? null : Number(row.reorderPoint), status: row.status, version: row.version, currentCost: currentCost ? { costVersionRef: currentCost.costVersionRef, amount: Number(currentCost.amount), currency: currentCost.currency, unitRef: currentCost.unit.unitRef, unitCode: currentCost.unit.code, validFrom: currentCost.validFrom.toISOString(), version: currentCost.version } : null, inventory: balance });
}
async function commandReplay(tx, tenantId, requestId, payloadHash) {
  const existing = await tx.materialInventoryCommand.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash) fail("MATERIALS_IDEMPOTENCY_CONFLICT", 409);
  return existing.resultJson;
}
async function lockStock(tx, tenantId, materialId, locationId) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${materialId}:${locationId}`}, 0))`);
}
async function lockStockPair(tx, tenantId, materialId, firstLocationId, secondLocationId) {
  for (const locationId of [firstLocationId, secondLocationId].sort()) await lockStock(tx, tenantId, materialId, locationId);
}
async function stockAt(tx, tenantId, materialId, locationId) {
  const movements = await tx.materialInventoryMovement.findMany({ where: { tenantId, materialId, locationId }, select: { movementType: true, quantityBase: true } });
  const reservations = await tx.materialReservation.findMany({ where: { tenantId, materialId, locationId, status: { in: ["RESERVED", "ASSIGNED"] } }, select: { status: true, quantityBase: true } });
  return inventoryAvailability({ movements: movements.map((row) => ({ movementType: row.movementType, quantity: Number(row.quantityBase) })), reservations: reservations.map((row) => ({ status: row.status, quantity: Number(row.quantityBase) })) });
}
async function resolveMaterialLocation(tx, tenantId, materialRef, locationRef) {
  const material = await tx.materialCatalogItem.findFirst({ where: { tenantId, materialRef }, select: { id: true, materialRef: true, status: true, lotTrackingEnabled: true } });
  const location = await tx.materialLocation.findFirst({ where: { tenantId, locationRef }, select: { id: true, locationRef: true, status: true } });
  if (!material || !location) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
  if (material.status !== "ACTIVE" || location.status !== "ACTIVE") fail("MATERIALS_RESOURCE_INACTIVE", 409);
  return { material, location };
}

export async function listMaterials(prisma, context, query = {}) {
  const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const where = { tenantId: context.tenantId, ...(query.status ? { status: query.status } : {}), ...(query.family ? { family: String(query.family) } : {}), ...(query.search ? { OR: [{ code: { contains: String(query.search), mode: "insensitive" } }, { name: { contains: String(query.search), mode: "insensitive" } }] } : {}) };
  const [total, rows] = await Promise.all([prisma.materialCatalogItem.count({ where }), prisma.materialCatalogItem.findMany({ where, include: { baseUnit: true, purchaseUnit: true, consumptionUnit: true, costs: { where: { validTo: null }, include: { unit: true }, orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], skip: (page - 1) * pageSize, take: pageSize })]);
  const result = [];
  for (const row of rows) {
    const [movements, reservations] = await Promise.all([
      prisma.materialInventoryMovement.findMany({ where: { tenantId: context.tenantId, materialId: row.id }, select: { movementType: true, quantityBase: true, location: { select: { warehouse: { select: { warehouseRef: true } } } } } }),
      prisma.materialReservation.findMany({ where: { tenantId: context.tenantId, materialId: row.id, status: { in: ["RESERVED", "ASSIGNED"] } }, select: { status: true, quantityBase: true, location: { select: { warehouse: { select: { warehouseRef: true } } } } } }),
    ]);
    const balance = inventoryAvailability({ movements: movements.map((entry) => ({ movementType: entry.movementType, quantity: Number(entry.quantityBase) })), reservations: reservations.map((entry) => ({ status: entry.status, quantity: Number(entry.quantityBase) })) });
    const warehouseRefs = [...new Set([...movements.map((entry) => entry.location.warehouse.warehouseRef), ...reservations.map((entry) => entry.location.warehouse.warehouseRef)])];
    const byWarehouse = warehouseRefs.map((warehouseRef) => ({ warehouseRef, ...inventoryAvailability({ movements: movements.filter((entry) => entry.location.warehouse.warehouseRef === warehouseRef).map((entry) => ({ movementType: entry.movementType, quantity: Number(entry.quantityBase) })), reservations: reservations.filter((entry) => entry.location.warehouse.warehouseRef === warehouseRef).map((entry) => ({ status: entry.status, quantity: Number(entry.quantityBase) })) }) }));
    result.push(publicMaterial(row, { ...balance, byWarehouse }));
  }
  return Object.freeze({ page, pageSize, total, items: Object.freeze(result) });
}

export async function listUnits(prisma, context) {
  const rows = await prisma.materialUnit.findMany({ where: { tenantId: context.tenantId }, orderBy: { code: "asc" } });
  return Object.freeze(rows.map((row) => ({ unitRef: row.unitRef, code: row.code, name: row.name, decimalPlaces: row.decimalPlaces, status: row.status, version: row.version })));
}

export async function createUnit(prisma, context, raw) {
  requirePermission(context, "inventory:catalog:manage"); const input = normalizeUnitCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const row = await tx.materialUnit.create({ data: { tenantId: context.tenantId, code: input.code, name: input.name, decimalPlaces: input.decimalPlaces } });
    const result = { unitRef: row.unitRef, code: row.code, name: row.name, decimalPlaces: row.decimalPlaces, status: row.status, version: row.version };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.unitRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "UNIT_CREATE", "MaterialUnit", row.unitRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listWarehouses(prisma, context) {
  const rows = await prisma.materialWarehouse.findMany({ where: { tenantId: context.tenantId }, include: { locations: { orderBy: [{ depth: "asc" }, { code: "asc" }] } }, orderBy: { code: "asc" } });
  return Object.freeze(rows.map((row) => ({ warehouseRef: row.warehouseRef, code: row.code, name: row.name, status: row.status, version: row.version, locations: row.locations.map((location) => ({ locationRef: location.locationRef, code: location.code, name: location.name, kind: location.kind, depth: location.depth, path: location.path, status: location.status })) })));
}

export async function createWarehouse(prisma, context, raw) {
  requirePermission(context, "inventory:catalog:manage"); const input = normalizeWarehouseCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const warehouse = await tx.materialWarehouse.create({ data: { tenantId: context.tenantId, code: input.code, name: input.name } }); const byCode = new Map(); const publicLocations = [];
    for (const node of input.locations) {
      const parent = node.parentCode ? byCode.get(node.parentCode) : null; const depth = parent ? parent.depth + 1 : 0; const path = parent ? `${parent.path}/${node.code}` : node.code;
      const location = await tx.materialLocation.create({ data: { tenantId: context.tenantId, warehouseId: warehouse.id, parentLocationId: parent?.id, code: node.code, name: node.name, kind: node.kind, depth, path } }); byCode.set(node.code, location); publicLocations.push({ locationRef: location.locationRef, code: location.code, name: location.name, kind: location.kind, depth, path });
    }
    const result = { warehouseRef: warehouse.warehouseRef, code: warehouse.code, name: warehouse.name, status: warehouse.status, version: warehouse.version, locations: publicLocations };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: warehouse.warehouseRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "WAREHOUSE_CREATE", "MaterialWarehouse", warehouse.warehouseRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createCostVersion(prisma, context, raw) {
  requirePermission(context, "inventory:catalog:manage"); const input = normalizeCostVersionCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const [material, unit, supplier] = await Promise.all([tx.materialCatalogItem.findFirst({ where: { tenantId: context.tenantId, materialRef: input.materialRef }, select: { id: true } }), tx.materialUnit.findFirst({ where: { tenantId: context.tenantId, unitRef: input.unitRef }, select: { id: true } }), input.supplierRef ? tx.materialSupplierReference.findFirst({ where: { tenantId: context.tenantId, supplierRef: input.supplierRef }, select: { id: true } }) : null]);
    if (!material || !unit || (input.supplierRef && !supplier)) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const current = await tx.materialCostVersion.findFirst({ where: { tenantId: context.tenantId, materialId: material.id, validTo: null }, orderBy: { version: "desc" } }); if (current && new Date(input.validFrom) <= current.validFrom) fail("MATERIALS_COST_VERSION_CONFLICT", 409);
    if (current) await tx.materialCostVersion.update({ where: { id: current.id }, data: { validTo: new Date(input.validFrom) } });
    const row = await tx.materialCostVersion.create({ data: { tenantId: context.tenantId, materialId: material.id, unitId: unit.id, amount: input.amount, currency: input.currency, source: input.source, supplierReferenceId: supplier?.id, validFrom: new Date(input.validFrom), version: (current?.version || 0) + 1, createdByMembershipId: context.membershipId, createdByUserId: context.userId } });
    const result = { costVersionRef: row.costVersionRef, materialRef: input.materialRef, unitRef: input.unitRef, amount: Number(row.amount), currency: row.currency, source: row.source, validFrom: row.validFrom.toISOString(), version: row.version };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.costVersionRef, resultJson: result, ...actor(context) } }); await tx.commercialAuditLog.create({ data: audit(context, "COST_VERSION_CREATE", "MaterialCostVersion", row.costVersionRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listUnitConversions(prisma, context, query = {}) {
  const rows = await prisma.materialUnitConversion.findMany({ where: { tenantId: context.tenantId, ...(query.materialRef ? { material: { materialRef: String(query.materialRef) } } : {}) }, include: { material: true, sourceUnit: true, targetUnit: true }, orderBy: [{ materialId: "asc" }, { version: "desc" }] });
  return Object.freeze(rows.map((row) => ({ conversionRef: row.conversionRef, materialRef: row.material.materialRef, sourceUnit: { unitRef: row.sourceUnit.unitRef, code: row.sourceUnit.code }, targetUnit: { unitRef: row.targetUnit.unitRef, code: row.targetUnit.code }, multiplier: Number(row.multiplier), validFrom: row.validFrom.toISOString(), validTo: row.validTo?.toISOString() ?? null, version: row.version, status: row.status })));
}

export async function createUnitConversion(prisma, context, raw) {
  requirePermission(context, "inventory:catalog:manage"); const input = normalizeUnitConversionCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const [material, sourceUnit, targetUnit] = await Promise.all([tx.materialCatalogItem.findFirst({ where: { tenantId: context.tenantId, materialRef: input.materialRef }, select: { id: true } }), tx.materialUnit.findFirst({ where: { tenantId: context.tenantId, unitRef: input.sourceUnitRef }, select: { id: true } }), tx.materialUnit.findFirst({ where: { tenantId: context.tenantId, unitRef: input.targetUnitRef }, select: { id: true } })]);
    if (!material || !sourceUnit || !targetUnit) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const current = await tx.materialUnitConversion.findFirst({ where: { tenantId: context.tenantId, materialId: material.id, sourceUnitId: sourceUnit.id, targetUnitId: targetUnit.id, status: "ACTIVE", validTo: null }, orderBy: { version: "desc" } });
    if (current && new Date(input.validFrom) <= current.validFrom) fail("MATERIALS_CONVERSION_VERSION_CONFLICT", 409);
    if (current) await tx.materialUnitConversion.update({ where: { id: current.id }, data: { validTo: new Date(input.validFrom), status: "INACTIVE" } });
    const row = await tx.materialUnitConversion.create({ data: { tenantId: context.tenantId, materialId: material.id, sourceUnitId: sourceUnit.id, targetUnitId: targetUnit.id, multiplier: input.multiplier, validFrom: new Date(input.validFrom), version: (current?.version || 0) + 1 } });
    const result = { conversionRef: row.conversionRef, materialRef: input.materialRef, sourceUnitRef: input.sourceUnitRef, targetUnitRef: input.targetUnitRef, multiplier: Number(row.multiplier), validFrom: row.validFrom.toISOString(), version: row.version, status: row.status };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.conversionRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "UNIT_CONVERSION_CREATE", "MaterialUnitConversion", row.conversionRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRecipe(prisma, context, raw) {
  requirePermission(context, "inventory:recipes:manage"); const input = normalizeRecipeCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const materialRefs = [...new Set(input.lines.map((line) => line.materialRef))]; const unitRefs = [...new Set(input.lines.map((line) => line.unitRef))];
    const [materials, units] = await Promise.all([tx.materialCatalogItem.findMany({ where: { tenantId: context.tenantId, materialRef: { in: materialRefs }, status: "ACTIVE" } }), tx.materialUnit.findMany({ where: { tenantId: context.tenantId, unitRef: { in: unitRefs }, status: "ACTIVE" } })]); if (materials.length !== materialRefs.length || units.length !== unitRefs.length) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const materialByRef = new Map(materials.map((row) => [row.materialRef, row.id])); const unitByRef = new Map(units.map((row) => [row.unitRef, row.id]));
    const recipe = await tx.packingRecipe.create({ data: { tenantId: context.tenantId, code: input.code, name: input.name } });
    const version = await tx.packingRecipeVersion.create({ data: { tenantId: context.tenantId, recipeId: recipe.id, version: 1, status: "ACTIVE", applicability: input.applicability, applicabilitySha256: canonicalPayloadHash(input.applicability), activatedAt: new Date(), createdByMembershipId: context.membershipId, createdByUserId: context.userId } });
    await tx.packingRecipeLine.createMany({ data: input.lines.map((line) => ({ tenantId: context.tenantId, recipeVersionId: version.id, position: line.position, materialId: materialByRef.get(line.materialRef), unitId: unitByRef.get(line.unitRef), formulaType: line.formulaType, fixedQuantity: line.fixedQuantity, multiplier: line.multiplier, roundingIncrement: line.roundingIncrement, wastePercent: line.wastePercent, formulaConfig: line.formulaConfig })) });
    const result = { recipeRef: recipe.recipeRef, recipeVersionRef: version.recipeVersionRef, code: recipe.code, name: recipe.name, version: version.version, status: version.status };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: recipe.recipeRef, resultJson: result, ...actor(context) } }); await tx.commercialAuditLog.create({ data: audit(context, "RECIPE_CREATE_AND_ACTIVATE", "PackingRecipe", recipe.recipeRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRecipeVersion(prisma, context, raw) {
  requirePermission(context, "inventory:recipes:manage"); const input = normalizeRecipeVersionCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const recipe = await tx.packingRecipe.findFirst({ where: { tenantId: context.tenantId, recipeRef: input.recipeRef, status: "ACTIVE" } });
    if (!recipe) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${recipe.id}:recipe-version`}, 0))`);
    const current = await tx.packingRecipeVersion.findFirst({ where: { tenantId: context.tenantId, recipeId: recipe.id, status: "ACTIVE" }, orderBy: { version: "desc" } });
    if (!current) fail("MATERIALS_RECIPE_ACTIVE_VERSION_MISSING", 409);
    if (current.version !== input.expectedActiveVersion) fail("MATERIALS_VERSION_CONFLICT", 409);
    const materialRefs = [...new Set(input.lines.map((line) => line.materialRef))]; const unitRefs = [...new Set(input.lines.map((line) => line.unitRef))];
    const [materials, units] = await Promise.all([tx.materialCatalogItem.findMany({ where: { tenantId: context.tenantId, materialRef: { in: materialRefs }, status: "ACTIVE" } }), tx.materialUnit.findMany({ where: { tenantId: context.tenantId, unitRef: { in: unitRefs }, status: "ACTIVE" } })]);
    if (materials.length !== materialRefs.length || units.length !== unitRefs.length) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const materialByRef = new Map(materials.map((row) => [row.materialRef, row.id])); const unitByRef = new Map(units.map((row) => [row.unitRef, row.id]));
    await tx.packingRecipeVersion.update({ where: { id: current.id }, data: { status: "RETIRED" } });
    const version = await tx.packingRecipeVersion.create({ data: { tenantId: context.tenantId, recipeId: recipe.id, version: current.version + 1, status: "ACTIVE", applicability: input.applicability, applicabilitySha256: canonicalPayloadHash(input.applicability), activatedAt: new Date(), createdByMembershipId: context.membershipId, createdByUserId: context.userId } });
    await tx.packingRecipeLine.createMany({ data: input.lines.map((line) => ({ tenantId: context.tenantId, recipeVersionId: version.id, position: line.position, materialId: materialByRef.get(line.materialRef), unitId: unitByRef.get(line.unitRef), formulaType: line.formulaType, fixedQuantity: line.fixedQuantity, multiplier: line.multiplier, roundingIncrement: line.roundingIncrement, wastePercent: line.wastePercent, formulaConfig: line.formulaConfig })) });
    const result = { recipeRef: recipe.recipeRef, recipeVersionRef: version.recipeVersionRef, code: recipe.code, name: recipe.name, version: version.version, status: version.status };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: version.recipeVersionRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "RECIPE_VERSION_ACTIVATE", "PackingRecipeVersion", version.recipeVersionRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

export async function createMaterial(prisma, context, raw) {
  requirePermission(context, "inventory:catalog:manage");
  const input = normalizeMaterialCreate(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const refs = [...new Set([input.baseUnitRef, input.purchaseUnitRef, input.consumptionUnitRef])];
    const units = await tx.materialUnit.findMany({ where: { tenantId: context.tenantId, unitRef: { in: refs }, status: "ACTIVE" } });
    if (units.length !== refs.length) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const byRef = new Map(units.map((unit) => [unit.unitRef, unit.id]));
    const row = await tx.materialCatalogItem.create({ data: { tenantId: context.tenantId, code: input.code, name: input.name, description: input.description, family: input.family, subfamily: input.subfamily, baseUnitId: byRef.get(input.baseUnitRef), purchaseUnitId: byRef.get(input.purchaseUnitRef), consumptionUnitId: byRef.get(input.consumptionUnitRef), technicalFlags: input.technicalFlags, dimensionPolicy: input.dimensionPolicy, lotTrackingEnabled: input.lotTrackingEnabled, minimumStock: input.minimumStock, maximumStock: input.maximumStock, reorderPoint: input.reorderPoint, sortOrder: input.sortOrder }, include: { baseUnit: true, purchaseUnit: true, consumptionUnit: true } });
    const result = publicMaterial(row);
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.materialRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "MATERIAL_CREATE", "MaterialCatalogItem", row.materialRef, input.requestId, result) });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateMaterial(prisma, context, materialRef, raw) {
  requirePermission(context, "inventory:catalog:manage"); const input = normalizeMaterialUpdate(raw, materialRef);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const current = await tx.materialCatalogItem.findFirst({ where: { tenantId: context.tenantId, materialRef: input.materialRef }, include: { baseUnit: true, purchaseUnit: true, consumptionUnit: true } });
    if (!current) fail("MATERIALS_RESOURCE_NOT_FOUND", 404); if (current.version !== input.expectedVersion) fail("MATERIALS_VERSION_CONFLICT", 409);
    const changed = await tx.materialCatalogItem.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion }, data: { name: input.name, description: input.description, family: input.family, subfamily: input.subfamily, technicalFlags: input.technicalFlags, dimensionPolicy: input.dimensionPolicy, lotTrackingEnabled: input.lotTrackingEnabled, minimumStock: input.minimumStock, maximumStock: input.maximumStock, reorderPoint: input.reorderPoint, sortOrder: input.sortOrder, status: input.status, version: { increment: 1 } } });
    if (changed.count !== 1) fail("MATERIALS_VERSION_CONFLICT", 409);
    const updated = await tx.materialCatalogItem.findUniqueOrThrow({ where: { id: current.id }, include: { baseUnit: true, purchaseUnit: true, consumptionUnit: true } }); const result = publicMaterial(updated);
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: updated.materialRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, input.status === "INACTIVE" && current.status !== "INACTIVE" ? "MATERIAL_INACTIVATE" : "MATERIAL_UPDATE", "MaterialCatalogItem", updated.materialRef, input.requestId, result) }); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listMovements(prisma, context, query = {}) {
  const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const rows = await prisma.materialInventoryMovement.findMany({ where: { tenantId: context.tenantId }, include: { material: true, location: { include: { warehouse: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
  return Object.freeze({ page, pageSize, items: rows.map((row) => ({ movementRef: row.movementRef, transactionRef: row.transactionRef, movementType: row.movementType, material: { materialRef: row.material.materialRef, code: row.material.code, name: row.material.name }, location: { locationRef: row.location.locationRef, code: row.location.code, name: row.location.name, warehouse: row.location.warehouse.name }, quantity: Number(row.quantityBase), lotCode: row.lotCode, reasonCode: row.reasonCode, occurredAt: row.occurredAt.toISOString() })) });
}

export async function listReservations(prisma, context) {
  const rows = await prisma.materialReservation.findMany({ where: { tenantId: context.tenantId }, include: { material: true, location: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 100 });
  return Object.freeze(rows.map((row) => ({ reservationRef: row.reservationRef, material: { materialRef: row.material.materialRef, code: row.material.code, name: row.material.name }, location: { locationRef: row.location.locationRef, code: row.location.code, name: row.location.name }, quantity: Number(row.quantityBase), status: row.status, version: row.version, createdAt: row.createdAt.toISOString() })));
}

export async function listRecipes(prisma, context) {
  const rows = await prisma.packingRecipe.findMany({ where: { tenantId: context.tenantId }, include: { versions: { include: { lines: { include: { material: true, unit: true }, orderBy: { position: "asc" } } }, orderBy: { version: "desc" } } }, orderBy: { code: "asc" } });
  return Object.freeze(rows.map((row) => ({ recipeRef: row.recipeRef, code: row.code, name: row.name, status: row.status, versions: row.versions.map((version) => ({ recipeVersionRef: version.recipeVersionRef, version: version.version, status: version.status, applicability: version.applicability, lines: version.lines.map((line) => ({ materialRef: line.material.materialRef, materialCode: line.material.code, materialName: line.material.name, unitRef: line.unit.unitRef, unitCode: line.unit.code, formulaType: line.formulaType, fixedQuantity: line.fixedQuantity == null ? null : Number(line.fixedQuantity), multiplier: line.multiplier == null ? null : Number(line.multiplier), roundingIncrement: Number(line.roundingIncrement), wastePercent: Number(line.wastePercent) })) })) })));
}

export async function listMaterialRequirements(prisma, context) {
  const rows = await prisma.materialRequirementSnapshot.findMany({ where: { tenantId: context.tenantId }, include: { surveyPublication: true, recipeVersion: { include: { recipe: true } }, lines: { include: { material: true, unit: true }, orderBy: { position: "asc" } } }, orderBy: [{ createdAt: "desc" }, { revision: "desc" }], take: 100 });
  return Object.freeze(rows.map((row) => ({ requirementRef: row.requirementRef, surveyPublicationRef: row.surveyPublication.publicationRef, recipe: { recipeRef: row.recipeVersion.recipe.recipeRef, recipeVersionRef: row.recipeVersion.recipeVersionRef, code: row.recipeVersion.recipe.code, version: row.recipeVersion.version }, revision: row.revision, status: row.status, logicalSha256: row.logicalSha256, createdAt: row.createdAt.toISOString(), items: row.lines.map((line) => ({ materialRef: line.material.materialRef, code: line.material.code, name: line.material.name, quantity: Number(line.requiredQuantity), unit: { unitRef: line.unit.unitRef, code: line.unit.code } })) })));
}

export async function recordMovement(prisma, context, raw) {
  const input = normalizeMovement(raw);
  const required = input.movementType === "RECEIPT" ? "inventory:stock:receive"
    : input.movementType.startsWith("TRANSFER_") ? "inventory:stock:transfer"
      : ["ISSUE", "CONSUMPTION", "RETURN"].includes(input.movementType) ? "inventory:stock:issue"
        : "inventory:stock:adjust";
  requirePermission(context, required);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const { material, location } = await resolveMaterialLocation(tx, context.tenantId, input.materialRef, input.locationRef);
    if (material.lotTrackingEnabled && !input.lotCode) fail("MATERIALS_LOT_REQUIRED", 409);
    const counterpart = input.movementType.startsWith("TRANSFER_")
      ? await resolveMaterialLocation(tx, context.tenantId, input.materialRef, input.counterpartLocationRef)
      : null;
    const reservation = input.reservationRef ? await tx.materialReservation.findFirst({ where: { tenantId: context.tenantId, reservationRef: input.reservationRef }, select: { id: true, materialId: true, locationId: true, quantityBase: true, status: true, version: true } }) : null;
    if (input.reservationRef && (!reservation || reservation.materialId !== material.id || reservation.locationId !== location.id)) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (reservation && input.movementType !== "ISSUE") fail("MATERIALS_RESERVATION_OPERATION_INVALID", 409);
    if (reservation && (!["RESERVED", "ASSIGNED"].includes(reservation.status) || Number(reservation.quantityBase) !== input.quantity)) fail("MATERIALS_RESERVATION_QUANTITY_CONFLICT", 409);
    const requirementLines = input.requirementRef ? await tx.materialRequirementLine.findMany({ where: { tenantId: context.tenantId, materialId: material.id, requirementSnapshot: { requirementRef: input.requirementRef } }, select: { id: true }, take: 2 }) : [];
    if (input.requirementRef && requirementLines.length !== 1) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (counterpart) await lockStockPair(tx, context.tenantId, material.id, location.id, counterpart.location.id);
    else await lockStock(tx, context.tenantId, material.id, location.id);
    const current = await stockAt(tx, context.tenantId, material.id, location.id);
    const dispatchable = current.available + (reservation ? Number(reservation.quantityBase) : 0);
    if (["TRANSFER_OUT", "ISSUE", "CONSUMPTION", "ADJUSTMENT_NEGATIVE"].includes(input.movementType) && dispatchable < input.quantity) fail("MATERIALS_NEGATIVE_STOCK_FORBIDDEN", 409);
    const transactionRef = randomUUID();
    const result = { transactionRef, movementType: input.movementType, materialRef: input.materialRef, locationRef: input.locationRef, counterpartLocationRef: input.counterpartLocationRef, quantity: input.quantity };
    const command = await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: transactionRef, resultJson: result, ...actor(context) } });
    const common = { tenantId: context.tenantId, materialId: material.id, commandId: command.id, reservationId: reservation?.id, requirementLineId: requirementLines[0]?.id, transactionRef, quantityBase: input.quantity, lotCode: input.lotCode, reasonCode: input.reasonCode, ...actor(context) };
    if (input.movementType.startsWith("TRANSFER_")) {
      await tx.materialInventoryMovement.createMany({ data: [{ ...common, locationId: location.id, movementType: "TRANSFER_OUT" }, { ...common, locationId: counterpart.location.id, movementType: "TRANSFER_IN" }] });
    } else await tx.materialInventoryMovement.create({ data: { ...common, locationId: location.id, movementType: input.movementType } });
    if (reservation) {
      const changed = await tx.materialReservation.updateMany({ where: { tenantId: context.tenantId, id: reservation.id, version: reservation.version, status: reservation.status }, data: { status: "DISPATCHED", version: { increment: 1 } } });
      if (changed.count !== 1) fail("MATERIALS_VERSION_CONFLICT", 409);
      await tx.materialReservationEvent.create({ data: { tenantId: context.tenantId, reservationId: reservation.id, fromStatus: reservation.status, toStatus: "DISPATCHED", quantityBase: reservation.quantityBase, reasonCode: input.reasonCode, ...actor(context) } });
    }
    await tx.commercialAuditLog.create({ data: audit(context, input.movementType, "MaterialInventoryMovement", transactionRef, input.requestId, result) });
    return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

export async function createReservation(prisma, context, raw) {
  requirePermission(context, "inventory:reservation:manage");
  const input = normalizeReservation(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const { material, location } = await resolveMaterialLocation(tx, context.tenantId, input.materialRef, input.locationRef);
    await lockStock(tx, context.tenantId, material.id, location.id);
    const balance = await stockAt(tx, context.tenantId, material.id, location.id); if (balance.available < input.quantity) fail("MATERIALS_INSUFFICIENT_AVAILABILITY", 409);
    const pipelineCase = input.caseRef ? await tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: input.caseRef }, select: { id: true } }) : null;
    const requirement = input.requirementRef ? await tx.materialRequirementLine.findFirst({ where: { tenantId: context.tenantId, requirementSnapshot: { requirementRef: input.requirementRef } }, select: { id: true } }) : null;
    if ((input.caseRef && !pipelineCase) || (input.requirementRef && !requirement)) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const row = await tx.materialReservation.create({ data: { tenantId: context.tenantId, materialId: material.id, locationId: location.id, pipelineCaseId: pipelineCase?.id, requirementLineId: requirement?.id, cratingReference: input.cratingReference, quantityBase: input.quantity } });
    await tx.materialReservationEvent.create({ data: { tenantId: context.tenantId, reservationId: row.id, toStatus: "RESERVED", quantityBase: input.quantity, reasonCode: "RESERVATION_CREATED", ...actor(context) } });
    const result = { reservationRef: row.reservationRef, materialRef: input.materialRef, locationRef: input.locationRef, quantity: input.quantity, status: row.status, version: row.version };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.reservationRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "RESERVATION_CREATE", "MaterialReservation", row.reservationRef, input.requestId, result) });
    return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

export async function releaseReservation(prisma, context, raw) {
  requirePermission(context, "inventory:reservation:manage");
  const input = normalizeReservationRelease(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const current = await tx.materialReservation.findFirst({ where: { tenantId: context.tenantId, reservationRef: input.reservationRef } });
    if (!current) fail("MATERIALS_RESOURCE_NOT_FOUND", 404); if (!["RESERVED", "ASSIGNED"].includes(current.status) || current.version !== input.expectedVersion) fail("MATERIALS_VERSION_CONFLICT", 409);
    const changed = await tx.materialReservation.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion, status: current.status }, data: { status: "RELEASED", version: { increment: 1 } } });
    if (changed.count !== 1) fail("MATERIALS_VERSION_CONFLICT", 409);
    await tx.materialReservationEvent.create({ data: { tenantId: context.tenantId, reservationId: current.id, fromStatus: current.status, toStatus: "RELEASED", quantityBase: current.quantityBase, reasonCode: input.reasonCode, ...actor(context) } });
    const result = { reservationRef: current.reservationRef, status: "RELEASED", version: current.version + 1 };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: current.reservationRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "RESERVATION_RELEASE", "MaterialReservation", current.reservationRef, input.requestId, result) });
    return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignReservation(prisma, context, raw) {
  requirePermission(context, "inventory:reservation:manage"); const input = normalizeReservationAssign(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const current = await tx.materialReservation.findFirst({ where: { tenantId: context.tenantId, reservationRef: input.reservationRef } });
    if (!current) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (current.status !== "RESERVED" || current.version !== input.expectedVersion) fail("MATERIALS_VERSION_CONFLICT", 409);
    const changed = await tx.materialReservation.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion, status: "RESERVED" }, data: { status: "ASSIGNED", version: { increment: 1 } } });
    if (changed.count !== 1) fail("MATERIALS_VERSION_CONFLICT", 409);
    await tx.materialReservationEvent.create({ data: { tenantId: context.tenantId, reservationId: current.id, fromStatus: "RESERVED", toStatus: "ASSIGNED", quantityBase: current.quantityBase, reasonCode: input.reasonCode, ...actor(context) } });
    const result = { reservationRef: current.reservationRef, status: "ASSIGNED", version: current.version + 1 };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: current.reservationRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "RESERVATION_ASSIGN", "MaterialReservation", current.reservationRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createPurchaseRequest(prisma, context, raw) {
  requirePermission(context, "inventory:purchase:request");
  const input = normalizePurchaseRequest(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const [material, unit] = await Promise.all([tx.materialCatalogItem.findFirst({ where: { tenantId: context.tenantId, materialRef: input.materialRef }, select: { id: true } }), tx.materialUnit.findFirst({ where: { tenantId: context.tenantId, unitRef: input.unitRef }, select: { id: true } })]);
    const requirement = input.requirementRef ? await tx.materialRequirementLine.findFirst({ where: { tenantId: context.tenantId, requirementSnapshot: { requirementRef: input.requirementRef } }, select: { id: true } }) : null;
    if (!material || !unit || (input.requirementRef && !requirement)) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    const row = await tx.materialPurchaseRequest.create({ data: { tenantId: context.tenantId, materialId: material.id, unitId: unit.id, requirementLineId: requirement?.id, requestedQuantity: input.quantity, ...{ requestedByMembershipId: context.membershipId, requestedByUserId: context.userId } } });
    const result = { purchaseRequestRef: row.purchaseRequestRef, status: row.status, quantity: input.quantity, unitRef: input.unitRef, materialRef: input.materialRef };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: row.purchaseRequestRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "PURCHASE_REQUEST_CREATE", "MaterialPurchaseRequest", row.purchaseRequestRef, input.requestId, result) });
    return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listPurchaseRequests(prisma, context) {
  if (!(context.effectivePermissions?.includes("inventory:purchase:request") || context.effectivePermissions?.includes("inventory:purchase:approve")) || context.deniedPermissions?.includes("inventory:purchase:request") && context.deniedPermissions?.includes("inventory:purchase:approve")) fail("MATERIALS_FORBIDDEN", 403);
  const rows = await prisma.materialPurchaseRequest.findMany({ where: { tenantId: context.tenantId }, include: { material: true, unit: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  return Object.freeze(rows.map((row) => ({ purchaseRequestRef: row.purchaseRequestRef, material: { materialRef: row.material.materialRef, code: row.material.code, name: row.material.name }, unit: { unitRef: row.unit.unitRef, code: row.unit.code }, quantity: Number(row.requestedQuantity), status: row.status, version: row.version, createdAt: row.createdAt.toISOString() })));
}

export async function transitionPurchaseRequest(prisma, context, raw) {
  requirePermission(context, "inventory:purchase:approve"); const input = normalizePurchaseTransition(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const current = await tx.materialPurchaseRequest.findFirst({ where: { tenantId: context.tenantId, purchaseRequestRef: input.purchaseRequestRef }, include: { material: true, unit: true } });
    if (!current) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (current.version !== input.expectedVersion) fail("MATERIALS_VERSION_CONFLICT", 409);
    const nextByAction = { APPROVE: current.status === "REQUESTED" ? "APPROVED" : null, ORDER: current.status === "APPROVED" ? "ORDERED" : null, RECEIVE: ["APPROVED", "ORDERED"].includes(current.status) ? "RECEIVED" : null, CANCEL: ["REQUESTED", "APPROVED", "ORDERED"].includes(current.status) ? "CANCELLED" : null };
    const nextStatus = nextByAction[input.action]; if (!nextStatus) fail("MATERIALS_PURCHASE_TRANSITION_INVALID", 409);
    const location = input.action === "RECEIVE" ? await tx.materialLocation.findFirst({ where: { tenantId: context.tenantId, locationRef: input.locationRef, status: "ACTIVE" } }) : null;
    if (input.action === "RECEIVE" && !location) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (input.action === "RECEIVE" && current.material.lotTrackingEnabled && !input.lotCode) fail("MATERIALS_LOT_REQUIRED", 409);
    if (location) await lockStock(tx, context.tenantId, current.materialId, location.id);
    const result = { purchaseRequestRef: current.purchaseRequestRef, status: nextStatus, version: current.version + 1, receiptTransactionRef: location ? randomUUID() : null };
    const command = await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: current.purchaseRequestRef, resultJson: result, ...actor(context) } });
    const changed = await tx.materialPurchaseRequest.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion, status: current.status }, data: { status: nextStatus, version: { increment: 1 } } });
    if (changed.count !== 1) fail("MATERIALS_VERSION_CONFLICT", 409);
    if (location) await tx.materialInventoryMovement.create({ data: { tenantId: context.tenantId, materialId: current.materialId, locationId: location.id, commandId: command.id, purchaseRequestId: current.id, transactionRef: result.receiptTransactionRef, movementType: "RECEIPT", quantityBase: current.requestedQuantity, lotCode: input.lotCode, reasonCode: input.reasonCode, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, `PURCHASE_REQUEST_${input.action}`, "MaterialPurchaseRequest", current.purchaseRequestRef, input.requestId, result) }); return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

export async function resolveSurveyRequirements(prisma, context, raw) {
  requirePermission(context, "inventory:recipes:manage");
  const input = normalizeRequirementResolution(raw);
  return prisma.$transaction(async (tx) => {
    const replay = await commandReplay(tx, context.tenantId, input.requestId, input.payloadHash); if (replay) return replay;
    const publication = await tx.surveyPublication.findFirst({ where: { tenantId: context.tenantId, publicationRef: input.surveyPublicationRef }, include: { items: { orderBy: { position: "asc" } } } });
    const recipeVersion = await tx.packingRecipeVersion.findFirst({ where: { tenantId: context.tenantId, recipeVersionRef: input.recipeVersionRef, status: "ACTIVE" }, include: { lines: { include: { material: true, unit: true }, orderBy: { position: "asc" } } } });
    if (!publication || !recipeVersion) fail("MATERIALS_RESOURCE_NOT_FOUND", 404);
    if (recipeVersion.lines.some((line) => line.material.status !== "ACTIVE")) fail("MATERIALS_RECIPE_HAS_INACTIVE_MATERIAL", 409);
    const applicability = recipeVersion.applicability || {}; const allowedArticles = new Set(Array.isArray(applicability.articleCodes) ? applicability.articleCodes : []); const allowedModes = new Set(Array.isArray(applicability.modes) ? applicability.modes : []);
    const items = publication.items.filter((item) => (allowedArticles.size === 0 || allowedArticles.has(item.articleCode)) && (allowedModes.size === 0 || allowedModes.has(item.shipmentMode)));
    const lines = recipeVersion.lines.map((line, position) => {
      const quantity = items.reduce((sum, item) => sum + resolveRecipeQuantity(line, { quantity: item.quantity, lengthM: Number(item.measurements?.lengthM || 0), areaM2: Number(item.measurements?.areaM2 || 0) }), 0);
      return { position, line, quantity };
    }).filter((row) => row.quantity > 0);
    if (!lines.length) fail("MATERIALS_RECIPE_NOT_APPLICABLE", 409);
    await tx.materialRequirementSnapshot.updateMany({ where: { tenantId: context.tenantId, surveyPublicationId: publication.id, status: "CURRENT" }, data: { status: "SUPERSEDED" } });
    const revision = await tx.materialRequirementSnapshot.count({ where: { tenantId: context.tenantId, surveyPublicationId: publication.id } }) + 1;
    const contextSnapshot = { publicationRef: publication.publicationRef, publicationRevision: publication.revision, recipeVersionRef: recipeVersion.recipeVersionRef, recipeVersion: recipeVersion.version, applicability: recipeVersion.applicability };
    const logicalSha256 = canonicalPayloadHash({ contextSnapshot, lines: lines.map(({ line, quantity }) => ({ materialRef: line.material.materialRef, unitRef: line.unit.unitRef, quantity, formula: { formulaType: line.formulaType, fixedQuantity: line.fixedQuantity && Number(line.fixedQuantity), multiplier: line.multiplier && Number(line.multiplier), roundingIncrement: Number(line.roundingIncrement), wastePercent: Number(line.wastePercent) } })) });
    const createdSnapshot = await tx.materialRequirementSnapshot.create({ data: { tenantId: context.tenantId, surveyPublicationId: publication.id, pipelineCaseId: publication.pipelineCaseId, recipeVersionId: recipeVersion.id, revision, contextSnapshot, logicalSha256, createdByMembershipId: context.membershipId, createdByUserId: context.userId } });
    await tx.materialRequirementLine.createMany({ data: lines.map(({ position, line, quantity }) => ({ tenantId: context.tenantId, requirementSnapshotId: createdSnapshot.id, position, materialId: line.materialId, unitId: line.unitId, requiredQuantity: quantity, formulaSnapshot: { formulaType: line.formulaType, fixedQuantity: line.fixedQuantity && Number(line.fixedQuantity), multiplier: line.multiplier && Number(line.multiplier), roundingIncrement: Number(line.roundingIncrement), wastePercent: Number(line.wastePercent), formulaConfig: line.formulaConfig }, sourceSnapshot: { articleRefs: items.map((item) => item.articleRef), publicationRevision: publication.revision } })) });
    const snapshot = await tx.materialRequirementSnapshot.findUniqueOrThrow({ where: { id: createdSnapshot.id }, include: { lines: { include: { material: true, unit: true }, orderBy: { position: "asc" } } } });
    const result = { requirementRef: snapshot.requirementRef, revision, status: snapshot.status, logicalSha256, surveyPublicationRef: publication.publicationRef, recipeVersionRef: recipeVersion.recipeVersionRef, items: snapshot.lines.map((line) => ({ materialRef: line.material.materialRef, code: line.material.code, name: line.material.name, quantity: Number(line.requiredQuantity), unit: { unitRef: line.unit.unitRef, code: line.unit.code } })) };
    await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: snapshot.requirementRef, resultJson: result, ...actor(context) } });
    await tx.commercialAuditLog.create({ data: audit(context, "REQUIREMENT_RESOLVE", "MaterialRequirementSnapshot", snapshot.requirementRef, input.requestId, { revision, logicalSha256 }) });
    return Object.freeze(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });
}
