import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { PERMS, permsForRole } from "./rbac.js";
import { CrmServicesError } from "./crmServicesContract.js";
import { normalizeCaseConfigurationSave, normalizeCatalogModesSave, normalizeConfigurationConflictResolve, normalizeMaterialPolicySave, normalizeModeSave, normalizePackageSave } from "./servicePackagesContract.js";

const ALLOWED_ROLES = new Set(["A", "V"]);
const fail = (code, status = 400) => { throw new CrmServicesError(code, status); };
const contextText = (value) => { if (typeof value !== "string" || !value || value.length > 191) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return value; };
const digest = (value) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

async function actor(tx, context, permission) {
  const tenantId = contextText(context?.tenantId); const membershipId = contextText(context?.membershipId); const userId = contextText(context?.userId);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS role,m."status"::text AS membership_status,
      m."granted_permissions",m."denied_permissions",u."status" AS user_status,t."status"::text AS tenant_status
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m`);
  const row = rows[0]; if (!row) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
  const role = String(row.role || "").toUpperCase(); const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((item) => !denied.has(item)));
  if (String(row.user_status).toUpperCase() !== "ACTIVE" || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE" || !ALLOWED_ROLES.has(role) || denied.has(permission) || !effective.has(permission)) fail("SERVICE_PACKAGES_PERMISSION_FORBIDDEN", 403);
  return Object.freeze({ tenantId, membershipId: String(row.id), userId: String(row.user_id), role });
}
async function limits(tx) { await tx.$executeRawUnsafe("SET LOCAL lock_timeout='250ms'"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'"); }
async function commandLock(tx, tenantId, key) { const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`SERVICES-15A:${tenantId}:${key}`},0)) AS ok`); if (rows[0]?.ok !== true) fail("SERVICE_PACKAGES_COMMAND_IN_PROGRESS", 409); }
async function prior(tx, tenantId, command) { const row = await tx.serviceConfigurationCommand.findFirst({ where: { tenantId, requestId: command.requestId } }); if (!row) return null; if (row.operation !== command.operation || row.payloadHash !== command.payloadHash) fail("SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT", 409); return row; }
async function journal(tx, who, command, targetRef, version, aggregateType, action, snapshot) {
  const snapshotHash = digest(snapshot);
  await tx.serviceConfigurationCommand.create({ data: { tenantId: who.tenantId, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, targetRef, resultingVersion: version, actorMembershipId: who.membershipId, actorUserId: who.userId } });
  await tx.serviceConfigurationAuditEvent.create({ data: { tenantId: who.tenantId, aggregateRef: targetRef, aggregateType, action, version, snapshotSha256: snapshotHash, metadata: { source: "V17_SERVICE_PACKAGES_RESOURCES_15A" }, actorMembershipId: who.membershipId, actorUserId: who.userId } });
}
function databaseError(error) {
  if (error instanceof CrmServicesError) return error;
  const code = [error?.meta?.code, error?.cause?.code, error?.code].find((value) => typeof value === "string");
  if (["P2002", "23505"].includes(code)) return new CrmServicesError("SERVICE_PACKAGES_CONFLICT", 409, { cause: error });
  if (["P2034", "40001", "40P01"].includes(code)) return new CrmServicesError("SERVICE_PACKAGES_VERSION_CONFLICT", 409, { cause: error });
  if (["P2003", "P2025", "23503", "23514"].includes(code)) return new CrmServicesError("SERVICE_PACKAGES_STATE_INVALID", 409, { cause: error });
  if (["55P03", "57014"].includes(code)) return new CrmServicesError("SERVICE_PACKAGES_COMMAND_IN_PROGRESS", 409, { cause: error });
  return new CrmServicesError("SERVICE_PACKAGES_DATABASE_UNAVAILABLE", 503, { cause: error });
}
const transaction = (database, work, write = false) => database.$transaction(work, write ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 } : { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
const date = (value) => value === null ? null : new Date(value);

function publicRequirement(row) { return Object.freeze({ requirementRef: row.requirementRef, kind: row.kind, code: row.code, name: row.name, quantity: row.quantity === null ? null : Number(row.quantity), unitCode: row.unitCode, hours: row.hours === null ? null : Number(row.hours), days: row.days === null ? null : Number(row.days), phaseCode: row.phaseCode, materialRef: row.material?.materialRef || null, assetModelRef: row.assetModel?.modelRef || null, capabilityRef: row.capability?.capabilityRef || null, disposition: row.disposition, chargeType: row.chargeType, configuration: row.configuration, position: row.position }); }
function publicPackage(row) {
  const primary = row.services.find((item) => item.kind === "PRIMARY");
  return Object.freeze({ packageRef: row.package.packageRef, versionRef: row.versionRef, code: row.package.code, name: row.name, description: row.description, category: row.category, tags: Object.freeze(row.tags), state: row.state, version: row.version, validFrom: row.validFrom, validTo: row.validTo, modes: Object.freeze(row.modes.map((entry) => Object.freeze({ modeRef: entry.mode.modeRef, code: entry.mode.code, name: entry.mode.name }))), primary: primary ? Object.freeze({ serviceRef: primary.service.serviceRef, code: primary.service.code, name: primary.service.name }) : null, complementaries: Object.freeze(row.services.filter((entry) => entry.kind === "COMPLEMENTARY").map((entry) => Object.freeze({ serviceRef: entry.service.serviceRef, code: entry.service.code, name: entry.service.name }))), requirements: Object.freeze(row.requirements.map(publicRequirement)) });
}
const packageInclude = { package: true, modes: { include: { mode: true }, orderBy: { id: "asc" } }, services: { include: { service: true }, orderBy: { position: "asc" } }, requirements: { include: { material: true, assetModel: true, capability: true }, orderBy: { position: "asc" } } };
async function packageByRef(tx, tenantId, versionRef) { const row = await tx.servicePackageVersion.findFirst({ where: { tenantId, versionRef }, include: packageInclude }); if (!row) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return row; }

export async function listServiceModes(context, database = prisma) {
  try { return await transaction(database, async (tx) => { const who = await actor(tx, context, PERMS.SERVICES_PACKAGES_VIEW); const rows = await tx.serviceModeDefinition.findMany({ where: { tenantId: who.tenantId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }); return Object.freeze(rows.map((row) => Object.freeze({ modeRef: row.modeRef, code: row.code, name: row.name, description: row.description, state: row.state, version: row.version }))); }); } catch (error) { throw databaseError(error); }
}
export async function saveServiceMode(context, input, database = prisma) {
  const command = normalizeModeSave(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.SERVICES_PACKAGES_MANAGE); await commandLock(tx, who.tenantId, command.requestId); const replay = await prior(tx, who.tenantId, command);
    if (replay) { const found = await tx.serviceModeDefinition.findFirst({ where: { tenantId: who.tenantId, modeRef: replay.targetRef } }); if (!found) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return Object.freeze({ mode: Object.freeze({ modeRef: found.modeRef, code: found.code, name: found.name, description: found.description, state: found.state, version: found.version }), replayed: true }); }
    let row;
    if (command.modeRef) { const current = await tx.serviceModeDefinition.findFirst({ where: { tenantId: who.tenantId, modeRef: command.modeRef } }); if (!current) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); if (current.version !== command.expectedVersion || current.code !== command.code) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409); row = await tx.serviceModeDefinition.update({ where: { id: current.id }, data: { name: command.name, description: command.description, state: command.state, sortOrder: command.sortOrder, version: { increment: 1 } } }); }
    else row = await tx.serviceModeDefinition.create({ data: { id: randomUUID(), tenantId: who.tenantId, code: command.code, name: command.name, description: command.description, state: command.state, sortOrder: command.sortOrder } });
    await journal(tx, who, command, row.modeRef, row.version, "SERVICE_MODE", command.modeRef ? "SERVICE_MODE_VERSIONED" : "SERVICE_MODE_CREATED", { code: row.code, version: row.version, state: row.state });
    return Object.freeze({ mode: Object.freeze({ modeRef: row.modeRef, code: row.code, name: row.name, description: row.description, state: row.state, version: row.version }), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}
export async function saveServiceCatalogModes(context, input, database = prisma) {
  const command = normalizeCatalogModesSave(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.SERVICES_CATALOG_MANAGE); await commandLock(tx, who.tenantId, command.requestId); const replay = await prior(tx, who.tenantId, command);
    const service = await tx.serviceCatalogItem.findFirst({ where: { tenantId: who.tenantId, serviceRef: command.serviceRef } }); if (!service) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    if (replay) return Object.freeze({ serviceRef: service.serviceRef, modeRefs: Object.freeze((await tx.serviceCatalogMode.findMany({ where: { tenantId: who.tenantId, serviceId: service.id }, include: { mode: true } })).map((row) => row.mode.modeRef)), replayed: true });
    const modes = await tx.serviceModeDefinition.findMany({ where: { tenantId: who.tenantId, modeRef: { in: command.modeRefs }, state: { not: "INACTIVE" } } }); if (modes.length !== command.modeRefs.length) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    const used = await tx.servicePackageVersionService.count({ where: { tenantId: who.tenantId, serviceId: service.id, packageVersion: { state: "PUBLISHED", modes: { some: { modeId: { notIn: modes.map((row) => row.id) } } } } } }); if (used) fail("SERVICE_PACKAGES_MODE_IN_USE", 409);
    await tx.serviceCatalogMode.deleteMany({ where: { tenantId: who.tenantId, serviceId: service.id } }); await tx.serviceCatalogMode.createMany({ data: modes.map((mode) => ({ id: randomUUID(), tenantId: who.tenantId, serviceId: service.id, modeId: mode.id })) }); await tx.serviceCatalogItem.update({ where: { id: service.id }, data: { compatibleModes: modes.map((mode) => mode.code).sort() } });
    await journal(tx, who, command, service.serviceRef, service.version, "SERVICE_CATALOG", "SERVICE_CATALOG_MODES_CHANGED", { code: service.code, modeCodes: modes.map((row) => row.code).sort() });
    return Object.freeze({ serviceRef: service.serviceRef, modeRefs: Object.freeze(modes.map((row) => row.modeRef)), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}
export async function listServiceCatalogModes(context, database = prisma) {
  try { return await transaction(database, async (tx) => { const who = await actor(tx, context, PERMS.SERVICES_CATALOG_VIEW); const rows = await tx.serviceCatalogItem.findMany({ where: { tenantId: who.tenantId }, select: { serviceRef: true, catalogModes: { select: { mode: { select: { modeRef: true } } } } }, orderBy: { code: "asc" } }); return Object.freeze(rows.map((row) => Object.freeze({ serviceRef: row.serviceRef, modeRefs: Object.freeze(row.catalogModes.map((entry) => entry.mode.modeRef).sort()) }))); }); } catch (error) { throw databaseError(error); }
}
export async function listServicePackages(context, database = prisma) {
  try { return await transaction(database, async (tx) => { const who = await actor(tx, context, PERMS.SERVICES_PACKAGES_VIEW); const rows = await tx.servicePackageVersion.findMany({ where: { tenantId: who.tenantId }, include: packageInclude, orderBy: [{ package: { code: "asc" } }, { version: "desc" }] }); return Object.freeze(rows.map(publicPackage)); }); } catch (error) { throw databaseError(error); }
}

async function resolvePackageAuthorities(tx, tenantId, command) {
  const modes = await tx.serviceModeDefinition.findMany({ where: { tenantId, modeRef: { in: command.modeRefs }, state: { not: "INACTIVE" } } });
  if (modes.length !== command.modeRefs.length) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
  const services = await tx.serviceCatalogItem.findMany({ where: { tenantId, serviceRef: { in: [command.primaryServiceRef, ...command.complementaryRefs] }, status: "ACTIVE" } });
  const byRef = new Map(services.map((row) => [row.serviceRef, row])); const primary = byRef.get(command.primaryServiceRef);
  if (!primary || !["PRIMARY", "BOTH"].includes(primary.usage)) fail("SERVICE_PACKAGES_PRIMARY_INVALID", 409);
  const complementary = command.complementaryRefs.map((entry) => byRef.get(entry));
  if (complementary.some((row) => !row || !["COMPLEMENTARY", "BOTH"].includes(row.usage) || row.id === primary.id)) fail("SERVICE_PACKAGES_COMPLEMENTARY_INVALID", 409);
  const compatibility = await tx.serviceCatalogMode.findMany({ where: { tenantId, serviceId: { in: services.map((row) => row.id) }, modeId: { in: modes.map((row) => row.id) } } });
  if (compatibility.length !== services.length * modes.length) fail("SERVICE_PACKAGES_MODE_INCOMPATIBLE", 409);
  const requirements = [];
  for (const item of command.requirements) {
    const material = item.materialRef ? await tx.materialCatalogItem.findFirst({ where: { tenantId, materialRef: item.materialRef, status: "ACTIVE" } }) : null;
    const asset = item.assetModelRef ? await tx.assetModel.findFirst({ where: { tenantId, modelRef: item.assetModelRef, status: "ACTIVE" } }) : null;
    const capability = item.capabilityRef ? await tx.operationalCapability.findFirst({ where: { tenantId, capabilityRef: item.capabilityRef, status: "ACTIVE" } }) : null;
    if ((item.materialRef && !material) || (item.assetModelRef && !asset) || (item.capabilityRef && !capability)) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    requirements.push({ ...item, materialId: material?.id || null, assetModelId: asset?.id || null, capabilityId: capability?.id || null });
  }
  return { modes, primary, complementary, requirements };
}

export async function saveServicePackage(context, input, database = prisma) {
  const command = normalizePackageSave(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.SERVICES_PACKAGES_MANAGE); await commandLock(tx, who.tenantId, command.requestId); const replay = await prior(tx, who.tenantId, command);
    if (replay) return Object.freeze({ package: publicPackage(await packageByRef(tx, who.tenantId, replay.targetRef)), replayed: true });
    const authority = await resolvePackageAuthorities(tx, who.tenantId, command); let stable; let nextVersion = 1; let previous = null;
    if (command.packageRef) { stable = await tx.servicePackage.findFirst({ where: { tenantId: who.tenantId, packageRef: command.packageRef }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }); if (!stable) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); previous = stable.versions[0]; if (!previous || previous.version !== command.expectedVersion || stable.code !== command.code) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409); nextVersion = previous.version + 1; await tx.servicePackageVersion.update({ where: { id: previous.id }, data: { state: "INACTIVE" } }); }
    else stable = await tx.servicePackage.create({ data: { id: randomUUID(), tenantId: who.tenantId, code: command.code } });
    const row = await tx.servicePackageVersion.create({ data: { id: randomUUID(), tenantId: who.tenantId, packageId: stable.id, version: nextVersion, state: command.state, name: command.name, description: command.description, category: command.category, tags: command.tags, sortOrder: 0, validFrom: date(command.validFrom), validTo: date(command.validTo), replacesVersionId: previous?.id || null, createdByMembershipId: who.membershipId, createdByUserId: who.userId, publishedAt: command.state === "PUBLISHED" ? new Date() : null } });
    await tx.servicePackageVersionMode.createMany({ data: authority.modes.map((mode) => ({ id: randomUUID(), tenantId: who.tenantId, packageVersionId: row.id, modeId: mode.id })) });
    await tx.servicePackageVersionService.createMany({ data: [{ id: randomUUID(), tenantId: who.tenantId, packageVersionId: row.id, serviceId: authority.primary.id, kind: "PRIMARY", position: 0 }, ...authority.complementary.map((service, index) => ({ id: randomUUID(), tenantId: who.tenantId, packageVersionId: row.id, serviceId: service.id, kind: "COMPLEMENTARY", position: index + 1 }))] });
    if (authority.requirements.length) await tx.servicePackageRequirement.createMany({ data: authority.requirements.map((item, position) => ({ id: randomUUID(), tenantId: who.tenantId, packageVersionId: row.id, kind: item.kind, code: item.code, name: item.name, quantity: item.quantity, unitCode: item.unitCode, hours: item.hours, days: item.days, phaseCode: item.phaseCode, materialId: item.materialId, assetModelId: item.assetModelId, capabilityId: item.capabilityId, disposition: item.disposition, chargeType: item.chargeType, configuration: item.configuration, position })) });
    await journal(tx, who, command, row.versionRef, nextVersion, "SERVICE_PACKAGE", command.state === "PUBLISHED" ? "PACKAGE_PUBLISHED" : "PACKAGE_VERSION_CREATED", { code: stable.code, version: nextVersion, state: command.state });
    return Object.freeze({ package: publicPackage(await packageByRef(tx, who.tenantId, row.versionRef)), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}

function publicPolicy(row) { return Object.freeze({ policyRef: row.policy.policyRef, versionRef: row.versionRef, code: row.policy.code, name: row.name, version: row.version, state: row.state, packageVersionRef: row.packageVersion?.versionRef || null, serviceRef: row.service?.serviceRef || null, modeRef: row.mode?.modeRef || null, preferenceCode: row.preferenceCode, standardCode: row.standardCode, validFrom: row.validFrom, validTo: row.validTo, lines: Object.freeze(row.lines.map((line) => Object.freeze({ lineRef: line.lineRef, materialRef: line.material?.materialRef || null, assetModelRef: line.assetModel?.modelRef || null, materialClass: line.materialClass, disposition: line.disposition, proportion: line.proportion === null ? null : Number(line.proportion), chargeType: line.chargeType, preparationRule: line.preparationRule, maintenanceRule: line.maintenanceRule, deteriorationRule: line.deteriorationRule, replacementRule: line.replacementRule, conditions: line.conditions }))) }); }
const policyInclude = { policy: true, packageVersion: true, service: true, mode: true, lines: { include: { material: true, assetModel: true }, orderBy: { position: "asc" } } };
async function policyByVersionRef(tx, tenantId, versionRef) { const row = await tx.serviceMaterialPolicyVersion.findFirst({ where: { tenantId, versionRef }, include: policyInclude }); if (!row) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return row; }
export async function listMaterialPolicies(context, database = prisma) { try { return await transaction(database, async (tx) => { const who = await actor(tx, context, PERMS.SERVICES_MATERIALS_VIEW); const rows = await tx.serviceMaterialPolicyVersion.findMany({ where: { tenantId: who.tenantId }, include: policyInclude, orderBy: [{ policy: { code: "asc" } }, { version: "desc" }] }); return Object.freeze(rows.map(publicPolicy)); }); } catch (error) { throw databaseError(error); } }

export async function saveMaterialPolicy(context, input, database = prisma) {
  const command = normalizeMaterialPolicySave(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.SERVICES_MATERIALS_MANAGE); await commandLock(tx, who.tenantId, command.requestId); const replay = await prior(tx, who.tenantId, command);
    if (replay) return Object.freeze({ policy: publicPolicy(await policyByVersionRef(tx, who.tenantId, replay.targetRef)), replayed: true });
    const packageVersion = command.packageVersionRef ? await packageByRef(tx, who.tenantId, command.packageVersionRef) : null;
    const service = command.serviceRef ? await tx.serviceCatalogItem.findFirst({ where: { tenantId: who.tenantId, serviceRef: command.serviceRef } }) : null;
    const mode = command.modeRef ? await tx.serviceModeDefinition.findFirst({ where: { tenantId: who.tenantId, modeRef: command.modeRef } }) : null;
    if ((command.serviceRef && !service) || (command.modeRef && !mode)) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    const lines = [];
    for (const line of command.lines) { const material = line.materialRef ? await tx.materialCatalogItem.findFirst({ where: { tenantId: who.tenantId, materialRef: line.materialRef, status: "ACTIVE" } }) : null; const asset = line.assetModelRef ? await tx.assetModel.findFirst({ where: { tenantId: who.tenantId, modelRef: line.assetModelRef, status: "ACTIVE" } }) : null; if ((line.materialRef && !material) || (line.assetModelRef && !asset)) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); lines.push({ ...line, materialId: material?.id || null, assetModelId: asset?.id || null }); }
    const total = lines.filter((line) => line.proportion !== null).reduce((sum, line) => sum + line.proportion, 0); if (lines.some((line) => line.proportion !== null) && Math.abs(total - 1) > 0.0001) fail("SERVICE_PACKAGES_MATERIAL_PROPORTION_INVALID", 409);
    let stable; let previous = null; let version = 1;
    if (command.policyRef) { stable = await tx.serviceMaterialPolicy.findFirst({ where: { tenantId: who.tenantId, policyRef: command.policyRef }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }); if (!stable) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); previous = stable.versions[0]; if (!previous || previous.version !== command.expectedVersion || stable.code !== command.code) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409); version = previous.version + 1; await tx.serviceMaterialPolicyVersion.update({ where: { id: previous.id }, data: { state: "INACTIVE" } }); }
    else stable = await tx.serviceMaterialPolicy.create({ data: { id: randomUUID(), tenantId: who.tenantId, code: command.code } });
    const row = await tx.serviceMaterialPolicyVersion.create({ data: { id: randomUUID(), tenantId: who.tenantId, policyId: stable.id, packageVersionId: packageVersion?.id || null, serviceId: service?.id || null, modeId: mode?.id || null, version, state: command.state, name: command.name, preferenceCode: command.preferenceCode, standardCode: command.standardCode, validFrom: date(command.validFrom), validTo: date(command.validTo), replacesVersionId: previous?.id || null, createdByMembershipId: who.membershipId, createdByUserId: who.userId, publishedAt: command.state === "PUBLISHED" ? new Date() : null } });
    if (lines.length) await tx.serviceMaterialPolicyLine.createMany({ data: lines.map((line, position) => ({ id: randomUUID(), tenantId: who.tenantId, policyVersionId: row.id, materialId: line.materialId, assetModelId: line.assetModelId, materialClass: line.materialClass, disposition: line.disposition, proportion: line.proportion, chargeType: line.chargeType, preparationRule: line.preparationRule, maintenanceRule: line.maintenanceRule, deteriorationRule: line.deteriorationRule, replacementRule: line.replacementRule, conditions: line.conditions, position })) });
    await journal(tx, who, command, row.versionRef, version, "SERVICE_MATERIAL_POLICY", command.state === "PUBLISHED" ? "MATERIAL_POLICY_PUBLISHED" : "MATERIAL_POLICY_VERSION_CREATED", { code: stable.code, version, state: command.state, lineCount: lines.length });
    return Object.freeze({ policy: publicPolicy(await policyByVersionRef(tx, who.tenantId, row.versionRef)), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}

async function scopedCase(tx, who, caseRef) { const row = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, publicRef: caseRef, ...(who.role === "V" ? { ownerMembershipId: who.membershipId, ownerUserId: who.userId } : {}) }, select: { id: true, publicRef: true, mode: true } }); if (!row) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return row; }
function publicCaseConfiguration(row) { if (!row) return null; return Object.freeze({ configurationRef: row.configurationRef, revision: row.revision, mode: row.modeCodeSnapshot, serviceSelectionRef: row.serviceSelectionRef, serviceSelectionRevision: row.serviceSelectionRevision, packageRef: row.packageRefSnapshot, packageVersion: row.packageVersionSnapshot, materialPolicyRef: row.materialPolicyRefSnapshot, materialPolicyVersion: row.materialPolicyVersionSnapshot, surveyPublicationRef: row.surveyPublicationRef, commercialAgreementRef: row.commercialAgreementRef, preference: row.preferenceSnapshot, duration: row.durationSnapshot, precedence: row.precedenceSnapshot, source: row.source, createdAt: row.createdAt, items: Object.freeze(row.items.map((item) => Object.freeze({ itemRef: item.itemRef, kind: item.kind, source: item.source, authorityRef: item.authorityRef, code: item.codeSnapshot, name: item.nameSnapshot, quantity: item.quantity === null ? null : Number(item.quantity), unitCode: item.unitCode, hours: item.hours === null ? null : Number(item.hours), days: item.days === null ? null : Number(item.days), disposition: item.disposition, chargeType: item.chargeType, proportion: item.proportion === null ? null : Number(item.proportion), details: item.details }))), conflicts: Object.freeze(row.conflicts.map((item) => Object.freeze({ conflictRef: item.conflictRef, kind: item.kind, state: item.state }))) }); }
const caseConfigInclude = { items: { orderBy: { position: "asc" } }, conflicts: { orderBy: { createdAt: "asc" } } };
export async function getCaseServiceConfiguration(context, caseRef, database = prisma) { try { return await transaction(database, async (tx) => { const who = await actor(tx, context, PERMS.SERVICES_CASE_CONFIG_VIEW); const pipelineCase = await scopedCase(tx, who, caseRef); const current = await tx.caseServiceConfigurationRevision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, include: caseConfigInclude, orderBy: { revision: "desc" } }); const packages = await tx.servicePackageVersion.findMany({ where: { tenantId: who.tenantId, state: "PUBLISHED", modes: { some: { mode: { code: pipelineCase.mode } } } }, include: packageInclude, orderBy: [{ package: { code: "asc" } }] }); const policies = await tx.serviceMaterialPolicyVersion.findMany({ where: { tenantId: who.tenantId, state: "PUBLISHED", OR: [{ modeId: null }, { mode: { code: pipelineCase.mode } }] }, include: policyInclude, orderBy: [{ policy: { code: "asc" } }] }); return Object.freeze({ caseRef: pipelineCase.publicRef, mode: pipelineCase.mode, current: publicCaseConfiguration(current), packages: Object.freeze(packages.map(publicPackage)), materialPolicies: Object.freeze(policies.map(publicPolicy)), precedence: Object.freeze(["CASE_OVERRIDE", "COMMERCIAL_AGREEMENT", "SERVICE_PACKAGE", "SERVICE_MODE_DEFAULT", "MANUAL_RESOLUTION"]) }); }); } catch (error) { throw databaseError(error); } }

function configItem(item, position) { return { id: randomUUID(), kind: item.kind, source: item.source, authorityRef: item.authorityRef, codeSnapshot: item.code, nameSnapshot: item.name, quantity: item.quantity, unitCode: item.unitCode, hours: item.hours, days: item.days, disposition: item.disposition, chargeType: item.chargeType, proportion: item.proportion, details: item.details || {}, position }; }
export async function saveCaseServiceConfiguration(context, caseRef, input, database = prisma) {
  const command = normalizeCaseConfigurationSave(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.SERVICES_CASE_CONFIG_UPDATE); await commandLock(tx, who.tenantId, command.requestId); const replay = await prior(tx, who.tenantId, command); if (replay) { const row = await tx.caseServiceConfigurationRevision.findFirst({ where: { tenantId: who.tenantId, configurationRef: replay.targetRef }, include: caseConfigInclude }); return Object.freeze({ configuration: publicCaseConfiguration(row), replayed: true }); }
    const pipelineCase = await scopedCase(tx, who, caseRef); const current = await tx.caseServiceConfigurationRevision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" } }); const revision = current?.revision || 0; if (revision !== command.expectedRevision) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409);
    const selection = await tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, selectionRef: command.serviceSelectionRef, revision: command.serviceSelectionRevision }, include: { items: { orderBy: { position: "asc" } } } }); if (!selection || selection.modeSnapshot !== pipelineCase.mode) fail("SERVICE_PACKAGES_SELECTION_INVALID", 409);
    const packageVersion = command.packageVersionRef ? await packageByRef(tx, who.tenantId, command.packageVersionRef) : null; if (packageVersion && packageVersion.state !== "PUBLISHED") fail("SERVICE_PACKAGES_STATE_INVALID", 409);
    const packageMode = packageVersion?.modes.some((entry) => entry.mode.code === pipelineCase.mode) ?? true; const selectedCodes = new Set(selection.items.filter((item) => item.kind !== "OTHER").map((item) => item.codeSnapshot)); const packageCodes = new Set(packageVersion?.services.map((item) => item.service.code) || []); if (!packageMode || (packageVersion && [...packageCodes].some((code) => !selectedCodes.has(code)))) fail("SERVICE_PACKAGES_PACKAGE_SELECTION_MISMATCH", 409);
    const policy = command.materialPolicyVersionRef ? await policyByVersionRef(tx, who.tenantId, command.materialPolicyVersionRef) : null; if (policy && policy.state !== "PUBLISHED") fail("SERVICE_PACKAGES_STATE_INVALID", 409); if (policy?.packageVersionId && policy.packageVersionId !== packageVersion?.id) fail("SERVICE_PACKAGES_POLICY_SCOPE_MISMATCH", 409);
    const survey = command.surveyPublicationRef ? await tx.surveyPublication.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, publicationRef: command.surveyPublicationRef, status: "CURRENT" } }) : null; if (command.surveyPublicationRef && !survey) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    const agreementContext = command.commercialAgreementRef ? await tx.pipelineCaseCommercialContextVersion.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, state: "PUBLISHED", pricingAgreement: { agreementRef: command.commercialAgreementRef, state: "PUBLISHED" } }, include: { pricingAgreement: true }, orderBy: { version: "desc" } }) : null; if (command.commercialAgreementRef && !agreementContext) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    const items = []; for (const item of selection.items.filter((entry) => entry.kind !== "OTHER")) items.push(configItem({ kind: item.kind === "PRIMARY" ? "PRIMARY_SERVICE" : "COMPLEMENTARY_SERVICE", source: "SERVICE_DEFAULT", authorityRef: item.serviceRefSnapshot, code: item.codeSnapshot, name: item.nameSnapshot, details: { catalogVersion: item.catalogVersionSnapshot } }, items.length));
    for (const item of packageVersion?.requirements || []) items.push(configItem({ kind: item.kind, source: "PACKAGE", authorityRef: item.requirementRef, code: item.code, name: item.name, quantity: item.quantity, unitCode: item.unitCode, hours: item.hours, days: item.days, disposition: item.disposition, chargeType: item.chargeType, details: { phaseCode: item.phaseCode, configuration: item.configuration } }, items.length));
    for (const line of policy?.lines || []) items.push(configItem({ kind: line.material ? "MATERIAL" : "ASSET", source: "MATERIAL_POLICY", authorityRef: line.lineRef, code: line.material?.code || line.assetModel?.code, name: line.material?.name || line.assetModel?.name, disposition: line.disposition, chargeType: line.chargeType, proportion: line.proportion, details: { materialClass: line.materialClass, conditions: line.conditions } }, items.length));
    for (const item of command.overrides) items.push(configItem(item, items.length));
    const competing = await tx.serviceMaterialPolicyVersion.findMany({ where: { tenantId: who.tenantId, state: "PUBLISHED", standardCode: policy?.standardCode, preferenceCode: policy?.preferenceCode, packageVersionId: packageVersion?.id || null, modeId: policy?.modeId || null, serviceId: policy?.serviceId || null }, select: { versionRef: true } });
    const precedence = { order: ["CASE_OVERRIDE", "COMMERCIAL_AGREEMENT", "SERVICE_PACKAGE", "SERVICE_MODE_DEFAULT", "MANUAL_RESOLUTION"], agreementApplied: Boolean(agreementContext), surveyFactsApplied: Boolean(survey), unresolvedConflict: competing.length > 1 };
    const logical = digest({ mode: pipelineCase.mode, selection: command.serviceSelectionRef, package: packageVersion?.versionRef || null, policy: policy?.versionRef || null, preference: command.preference, duration: command.duration, items: items.map(({ id: _id, ...item }) => item) });
    const row = await tx.caseServiceConfigurationRevision.create({ data: { id: randomUUID(), tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, revision: revision + 1, modeCodeSnapshot: pipelineCase.mode, serviceSelectionRef: command.serviceSelectionRef, serviceSelectionRevision: command.serviceSelectionRevision, packageVersionId: packageVersion?.id || null, packageRefSnapshot: packageVersion?.package.packageRef || null, packageVersionSnapshot: packageVersion?.version || null, materialPolicyVersionId: policy?.id || null, materialPolicyRefSnapshot: policy?.policy.policyRef || null, materialPolicyVersionSnapshot: policy?.version || null, surveyPublicationRef: survey?.publicationRef || null, commercialAgreementRef: agreementContext?.pricingAgreement?.agreementRef || null, preferenceSnapshot: command.preference, durationSnapshot: command.duration, precedenceSnapshot: precedence, logicalSha256: logical, source: command.source, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
    if (items.length) await tx.caseServiceConfigurationItem.createMany({ data: items.map((item) => ({ ...item, tenantId: who.tenantId, configurationId: row.id })) });
    if (competing.length > 1) await tx.serviceConfigurationConflict.create({ data: { id: randomUUID(), tenantId: who.tenantId, configurationId: row.id, kind: "EQUIVALENT_MATERIAL_POLICIES", competingAuthorityRefs: competing.map((entry) => entry.versionRef) } });
    await journal(tx, who, command, row.configurationRef, row.revision, "CASE_SERVICE_CONFIGURATION", competing.length > 1 ? "CASE_CONFIGURATION_CONFLICTED" : revision ? "CASE_CONFIGURATION_OVERRIDDEN" : "CASE_CONFIGURATION_CREATED", { caseRef: pipelineCase.publicRef, revision: row.revision, logicalSha256: logical, itemCount: items.length });
    const result = await tx.caseServiceConfigurationRevision.findFirst({ where: { id: row.id }, include: caseConfigInclude }); return Object.freeze({ configuration: publicCaseConfiguration(result), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}

export async function resolveServiceConfigurationConflict(context, conflictRef, input, database = prisma) {
  const command = normalizeConfigurationConflictResolve(input);
  try { return await transaction(database, async (tx) => {
    await limits(tx);
    const who = await actor(tx, context, PERMS.SERVICES_CASE_CONFIG_UPDATE);
    await commandLock(tx, who.tenantId, `CONFLICT:${conflictRef}`);
    const replay = await prior(tx, who.tenantId, command);
    if (replay) {
      const resolved = await tx.serviceConfigurationConflict.findFirst({ where: { tenantId: who.tenantId, conflictRef: replay.targetRef } });
      if (!resolved) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
      return Object.freeze({ conflict: Object.freeze({ conflictRef: resolved.conflictRef, kind: resolved.kind, state: resolved.state }), replayed: true });
    }
    const conflict = await tx.serviceConfigurationConflict.findFirst({
      where: { tenantId: who.tenantId, conflictRef },
      include: { configuration: { include: { pipelineCase: { select: { ownerMembershipId: true, ownerUserId: true } } } } },
    });
    if (!conflict) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    if (who.role === "V" && (conflict.configuration.pipelineCase.ownerMembershipId !== who.membershipId || conflict.configuration.pipelineCase.ownerUserId !== who.userId)) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
    if (conflict.state !== command.expectedState || !conflict.competingAuthorityRefs.includes(command.selectedAuthorityRef)) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409);
    const updated = await tx.serviceConfigurationConflict.updateMany({
      where: { tenantId: who.tenantId, id: conflict.id, state: command.expectedState },
      data: { state: "RESOLVED", resolution: { code: command.resolutionCode, selectedAuthorityRef: command.selectedAuthorityRef }, resolvedByMembershipId: who.membershipId, resolvedByUserId: who.userId, resolvedAt: new Date() },
    });
    if (updated.count !== 1) fail("SERVICE_PACKAGES_VERSION_CONFLICT", 409);
    await journal(tx, who, command, conflict.conflictRef, 1, "SERVICE_CONFIGURATION_CONFLICT", "CONFIGURATION_CONFLICT_RESOLVED", { kind: conflict.kind, resolutionCode: command.resolutionCode, selectedAuthorityRef: command.selectedAuthorityRef });
    return Object.freeze({ conflict: Object.freeze({ conflictRef: conflict.conflictRef, kind: conflict.kind, state: "RESOLVED" }), replayed: false });
  }, true); } catch (error) { throw databaseError(error); }
}
