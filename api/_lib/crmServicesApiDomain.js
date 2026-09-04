import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";
import {
  CrmServicesError,
  normalizeCaseServiceSelection,
  normalizeServiceCatalogCreate,
  normalizeServiceCatalogUpdate,
  normalizeServiceDefaults,
  serviceFail,
  serviceRef,
} from "./crmServicesContract.js";

const ALLOWED_ROLES = new Set(["A", "V"]);
const SOURCE = "V17_SERVICES_TENANT_FIRST_03A";

function contextText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 191) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
  return value;
}

async function actor(tx, context, permission, { manage = false } = {}) {
  const tenantId = contextText(context?.tenantId);
  const membershipId = contextText(context?.membershipId);
  const userId = contextText(context?.userId);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",m."status"::text AS "membership_status",
      m."granted_permissions",m."denied_permissions",u."status" AS "user_status",t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m
  `);
  const row = rows[0];
  if (!row) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
  const role = String(row.role || "").toUpperCase();
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((item) => !denied.has(item)));
  if (String(row.user_status).toUpperCase() !== "ACTIVE" || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE"
    || !ALLOWED_ROLES.has(role) || (manage && role !== "A") || denied.has(permission) || !effective.has(permission)) {
    serviceFail("CRM_SERVICES_PERMISSION_FORBIDDEN", 403);
  }
  return Object.freeze({ tenantId, membershipId: String(row.id), userId: String(row.user_id), role });
}

async function limits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '250ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
}
async function lock(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`SERVICES-03A:${tenantId}:${requestId}`},0)) AS "ok"`);
  if (rows[0]?.ok !== true) serviceFail("CRM_SERVICES_COMMAND_IN_PROGRESS", 409);
}
async function prior(tx, tenantId, command) {
  const row = await tx.serviceMutationCommand.findFirst({ where: { tenantId, requestId: command.requestId } });
  if (!row) return null;
  if (row.operation !== command.operation || row.payloadHash !== command.payloadHash) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409);
  return row;
}
async function journal(tx, who, command, targetRef, resultingVersion, action, beforeJson, afterJson) {
  await tx.serviceMutationCommand.create({ data: {
    id: randomUUID(), tenantId: who.tenantId, requestId: command.requestId, operation: command.operation,
    payloadHash: command.payloadHash, targetRef, resultingVersion,
    actorMembershipId: who.membershipId, actorUserId: who.userId,
  } });
  await appendCommercialAudit(tx, { tenantId: who.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: who.membershipId }, {
    source: SOURCE, action, entity: "SERVICE_CONFIGURATION", entityId: targetRef,
    requestId: command.requestId, correlationId: command.requestId, beforeJson, afterJson,
    metadataJson: { resultingVersion },
  });
}
function databaseError(error) {
  if (error instanceof CrmServicesError) return error;
  const code = [error?.meta?.code, error?.cause?.code, error?.code].find((value) => typeof value === "string");
  if (["P2002", "23505"].includes(code)) return new CrmServicesError("CRM_SERVICES_CONFLICT", 409, { cause: error });
  if (["P2003", "P2025", "23503", "23514"].includes(code)) return new CrmServicesError("CRM_SERVICES_STATE_INVALID", 409, { cause: error });
  if (["55P03", "57014"].includes(code)) return new CrmServicesError("CRM_SERVICES_COMMAND_IN_PROGRESS", 409, { cause: error });
  return new CrmServicesError("CRM_SERVICES_DATABASE_UNAVAILABLE", 503, { cause: error });
}
function publicCatalog(item, usageCount = 0, allowedComplementaryRefs = []) {
  return Object.freeze({ serviceRef: item.serviceRef, code: item.code, name: item.name, category: item.category,
    usage: item.usage, compatibleModes: Object.freeze([...item.compatibleModes]), status: item.status,
    sortOrder: item.sortOrder, version: item.version, usageCount, allowedComplementaryRefs: Object.freeze(allowedComplementaryRefs) });
}
async function catalogByRef(tx, tenantId, ref, options = {}) {
  const item = await tx.serviceCatalogItem.findFirst({ where: { tenantId, serviceRef: serviceRef(ref), ...(options.active ? { status: "ACTIVE" } : {}) } });
  if (!item) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
  return item;
}
async function publicCatalogByRef(tx, tenantId, ref) {
  const item = await tx.serviceCatalogItem.findFirst({
    where: { tenantId, serviceRef: serviceRef(ref) },
    include: {
      _count: { select: { caseServiceItems: true } },
      allowedAsPrimary: { include: { complementaryService: { select: { serviceRef: true } } } },
    },
  });
  if (!item) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
  return publicCatalog(item, item._count.caseServiceItems, item.allowedAsPrimary.map((link) => link.complementaryService.serviceRef));
}
async function compatibleItems(tx, tenantId, primaryId, refs) {
  if (!refs.length) return [];
  const rows = await tx.serviceCatalogCompatibility.findMany({
    where: { tenantId, primaryServiceId: primaryId, complementaryService: { serviceRef: { in: refs }, status: "ACTIVE" } },
    include: { complementaryService: true },
  });
  const byRef = new Map(rows.map((row) => [row.complementaryService.serviceRef, row.complementaryService]));
  if (byRef.size !== refs.length) serviceFail("CRM_SERVICES_COMPLEMENTARY_NOT_ALLOWED", 409);
  return refs.map((ref) => byRef.get(ref));
}
async function replaceCompatibility(tx, who, primary, refs) {
  const complementaries = await Promise.all(refs.map((ref) => catalogByRef(tx, who.tenantId, ref, { active: true })));
  if (complementaries.some((item) => !["COMPLEMENTARY", "BOTH"].includes(item.usage) || item.id === primary.id)) serviceFail("CRM_SERVICES_COMPLEMENTARY_NOT_ALLOWED", 409);
  const retained = new Set(complementaries.map((item) => item.id));
  const inUse = await tx.serviceDefaultCombinationItem.count({ where: { tenantId: who.tenantId, combination: { primaryServiceId: primary.id }, serviceId: { notIn: [...retained] } } });
  if (inUse > 0) serviceFail("CRM_SERVICES_DEFAULTS_REQUIRE_ALLOWED_ITEMS", 409);
  await tx.serviceCatalogCompatibility.deleteMany({ where: { tenantId: who.tenantId, primaryServiceId: primary.id } });
  if (complementaries.length) await tx.serviceCatalogCompatibility.createMany({ data: complementaries.map((item) => ({ id: randomUUID(), tenantId: who.tenantId, primaryServiceId: primary.id, complementaryServiceId: item.id })) });
}

export async function listServiceCatalog(context, query = {}, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_VIEW, { manage: true });
      const where = { tenantId: who.tenantId };
      if (["PRIMARY", "COMPLEMENTARY", "BOTH"].includes(query.usage)) where.usage = query.usage;
      if (["ACTIVE", "INACTIVE"].includes(query.status)) where.status = query.status;
      const rows = await tx.serviceCatalogItem.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { _count: { select: { caseServiceItems: true } }, allowedAsPrimary: { include: { complementaryService: { select: { serviceRef: true } } } } } });
      return Object.freeze(rows.map((row) => publicCatalog(row, row._count.caseServiceItems, row.allowedAsPrimary.map((link) => link.complementaryService.serviceRef))));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) { throw databaseError(error); }
}

export async function createServiceCatalogItem(context, input, database = prisma) {
  const command = normalizeServiceCatalogCreate(input);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx); await lock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_MANAGE, { manage: true });
      const replay = await prior(tx, who.tenantId, command);
      if (replay) return Object.freeze({ item: await publicCatalogByRef(tx, who.tenantId, replay.targetRef), replayed: true });
      const item = await tx.serviceCatalogItem.create({ data: { id: randomUUID(), tenantId: who.tenantId, code: command.code, name: command.name, category: command.category, usage: command.usage, compatibleModes: command.compatibleModes, sortOrder: command.sortOrder } });
      if (["PRIMARY", "BOTH"].includes(item.usage)) await replaceCompatibility(tx, who, item, command.allowedComplementaryRefs);
      await journal(tx, who, command, item.serviceRef, 1, "SERVICE_CATALOG_CREATED", null, { code: item.code, usage: item.usage, modes: item.compatibleModes, status: item.status });
      return Object.freeze({ item: await publicCatalogByRef(tx, who.tenantId, item.serviceRef), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) { throw databaseError(error); }
}

export async function updateServiceCatalogItem(context, ref, input, database = prisma) {
  const command = normalizeServiceCatalogUpdate(input); serviceRef(ref);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx); await lock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_MANAGE, { manage: true });
      const replay = await prior(tx, who.tenantId, command);
      if (replay) { if (replay.targetRef !== ref) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409); return Object.freeze({ item: await publicCatalogByRef(tx, who.tenantId, ref), replayed: true }); }
      const current = await catalogByRef(tx, who.tenantId, ref);
      if (current.version !== command.expectedVersion) serviceFail("CRM_SERVICES_VERSION_CONFLICT", 409);
      if (current.usage !== command.usage && await tx.pipelineCaseServiceItem.count({ where: { tenantId: who.tenantId, serviceId: current.id } }) > 0) serviceFail("CRM_SERVICES_USED_TYPE_IMMUTABLE", 409);
      const item = await tx.serviceCatalogItem.update({ where: { id: current.id }, data: { name: command.name, category: command.category, usage: command.usage, compatibleModes: command.compatibleModes, status: command.status, sortOrder: command.sortOrder, version: { increment: 1 } } });
      if (["PRIMARY", "BOTH"].includes(item.usage)) await replaceCompatibility(tx, who, item, command.allowedComplementaryRefs);
      else if (command.allowedComplementaryRefs.length) serviceFail("CRM_SERVICES_COMPLEMENTARY_NOT_ALLOWED", 409);
      await journal(tx, who, command, item.serviceRef, item.version, item.status === current.status ? "SERVICE_CATALOG_UPDATED" : item.status === "ACTIVE" ? "SERVICE_CATALOG_ACTIVATED" : "SERVICE_CATALOG_DEACTIVATED", { version: current.version, status: current.status }, { version: item.version, status: item.status });
      return Object.freeze({ item: await publicCatalogByRef(tx, who.tenantId, item.serviceRef), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) { throw databaseError(error); }
}

export async function getServiceCatalogHistory(context, ref, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_VIEW, { manage: true });
      const item = await catalogByRef(tx, who.tenantId, ref);
      const rows = await tx.commercialAuditLog.findMany({ where: { tenant_id: who.tenantId, entity: "SERVICE_CONFIGURATION", entityId: item.serviceRef, source: SOURCE }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { action: true, after_json: true, createdAt: true } });
      return Object.freeze({ serviceRef: item.serviceRef, events: Object.freeze(rows.map((row) => Object.freeze({ action: row.action, version: Number(row.after_json?.version || 1), createdAt: row.createdAt }))) });
    });
  } catch (error) { throw databaseError(error); }
}

export async function listServiceDefaults(context, primaryRef, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_VIEW, { manage: true });
      const primary = await catalogByRef(tx, who.tenantId, primaryRef);
      const rows = await tx.serviceDefaultCombination.findMany({ where: { tenantId: who.tenantId, primaryServiceId: primary.id }, include: { items: { orderBy: { position: "asc" }, include: { service: true } } }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] });
      return Object.freeze(rows.map((row) => Object.freeze({ combinationRef: row.combinationRef, code: row.code, name: row.name, status: row.status, isDefault: row.isDefault, version: row.version, complementaries: Object.freeze(row.items.map((item) => publicCatalog(item.service))) })));
    });
  } catch (error) { throw databaseError(error); }
}

export async function saveServiceDefaults(context, input, database = prisma) {
  const command = normalizeServiceDefaults(input);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx); await lock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SERVICES_CATALOG_MANAGE, { manage: true });
      const replay = await prior(tx, who.tenantId, command);
      if (replay) return Object.freeze({ combinationRef: replay.targetRef, version: replay.resultingVersion, replayed: true });
      const primary = await catalogByRef(tx, who.tenantId, command.primaryServiceRef, { active: true });
      if (!["PRIMARY", "BOTH"].includes(primary.usage)) serviceFail("CRM_SERVICES_PRIMARY_INVALID", 409);
      const items = await compatibleItems(tx, who.tenantId, primary.id, command.complementaryRefs);
      let row;
      let before = null;
      if (command.combinationRef) {
        const current = await tx.serviceDefaultCombination.findFirst({ where: { tenantId: who.tenantId, combinationRef: command.combinationRef, primaryServiceId: primary.id } });
        if (!current) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
        if (current.code !== command.code) serviceFail("CRM_SERVICES_IDENTITY_IMMUTABLE", 409);
        if (current.version !== command.expectedVersion) serviceFail("CRM_SERVICES_VERSION_CONFLICT", 409);
        before = { version: current.version, status: current.status, isDefault: current.isDefault };
        row = await tx.serviceDefaultCombination.update({ where: { id: current.id }, data: { name: command.name, status: command.status, isDefault: command.isDefault, version: { increment: 1 } } });
        await tx.serviceDefaultCombinationItem.deleteMany({ where: { tenantId: who.tenantId, combinationId: current.id } });
      } else {
        if (command.expectedVersion !== null) serviceFail("CRM_SERVICES_INPUT_INVALID");
        row = await tx.serviceDefaultCombination.create({ data: { id: randomUUID(), tenantId: who.tenantId, primaryServiceId: primary.id, code: command.code, name: command.name, status: command.status, isDefault: command.isDefault } });
      }
      if (items.length) await tx.serviceDefaultCombinationItem.createMany({ data: items.map((item, position) => ({ id: randomUUID(), tenantId: who.tenantId, combinationId: row.id, serviceId: item.id, position })) });
      await journal(tx, who, command, row.combinationRef, row.version, "SERVICE_DEFAULTS_CHANGED", before, { version: row.version, status: row.status, isDefault: row.isDefault, complementaryCodes: items.map((item) => item.code) });
      return Object.freeze({ combinationRef: row.combinationRef, version: row.version, replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) { throw databaseError(error); }
}

async function scopedCase(tx, who, ref) {
  const where = { tenantId: who.tenantId, publicRef: serviceRef(ref), ...(who.role === "V" ? { ownerMembershipId: who.membershipId, ownerUserId: who.userId } : {}) };
  const row = await tx.pipelineCase.findFirst({ where, select: { id: true, publicRef: true, mode: true } });
  if (!row) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
  return row;
}
function publicSelection(row, historyCount) {
  if (!row) return Object.freeze({ revision: 0, selectionRef: null, mode: null, source: null, defaultCombinationRef: null, primary: null, complementaries: Object.freeze([]), otherServices: Object.freeze([]), historyCount: 0 });
  const base = (item) => Object.freeze({ serviceRef: item.serviceRefSnapshot, code: item.codeSnapshot, name: item.nameSnapshot, category: item.categorySnapshot, catalogVersion: item.catalogVersionSnapshot, source: item.source });
  return Object.freeze({ revision: row.revision, selectionRef: row.selectionRef, mode: row.modeSnapshot, source: row.source, defaultCombinationRef: row.defaultCombinationRef,
    primary: base(row.items.find((item) => item.kind === "PRIMARY")),
    complementaries: Object.freeze(row.items.filter((item) => item.kind === "COMPLEMENTARY").map(base)),
    otherServices: Object.freeze(row.items.filter((item) => item.kind === "OTHER").map((item) => Object.freeze({ description: item.nameSnapshot, classificationStatus: item.classificationStatus }))), historyCount });
}

export async function getCaseServiceWorkspace(context, caseReference, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SERVICES_CASE_VIEW);
      const pipelineCase = await scopedCase(tx, who, caseReference);
      const revisions = await tx.pipelineCaseServiceRevision.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } } } });
      const primaries = await tx.serviceCatalogItem.findMany({ where: { tenantId: who.tenantId, status: "ACTIVE", usage: { in: ["PRIMARY", "BOTH"] }, compatibleModes: { has: pipelineCase.mode } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
      const primaryIds = primaries.map((item) => item.id);
      const links = await tx.serviceCatalogCompatibility.findMany({ where: { tenantId: who.tenantId, primaryServiceId: { in: primaryIds }, complementaryService: { status: "ACTIVE" } }, include: { complementaryService: true } });
      const defaults = await tx.serviceDefaultCombination.findMany({ where: { tenantId: who.tenantId, primaryServiceId: { in: primaryIds }, status: "ACTIVE" }, include: { items: { orderBy: { position: "asc" }, include: { service: true } } } });
      return Object.freeze({ caseRef: pipelineCase.publicRef, mode: pipelineCase.mode, selection: publicSelection(revisions[0], await tx.pipelineCaseServiceRevision.count({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id } })),
        primaries: Object.freeze(primaries.map((item) => publicCatalog(item))),
        allowedComplementaries: Object.freeze(links.map((link) => Object.freeze({ primaryServiceRef: primaries.find((item) => item.id === link.primaryServiceId)?.serviceRef, service: publicCatalog(link.complementaryService) }))),
        defaults: Object.freeze(defaults.map((row) => Object.freeze({ combinationRef: row.combinationRef, primaryServiceRef: primaries.find((item) => item.id === row.primaryServiceId)?.serviceRef, name: row.name, isDefault: row.isDefault, version: row.version, complementaryRefs: Object.freeze(row.items.map((item) => item.service.serviceRef)) }))),
      });
    });
  } catch (error) { throw databaseError(error); }
}

export async function saveCaseServiceSelection(context, caseReference, input, database = prisma) {
  const command = normalizeCaseServiceSelection(input);
  try {
    return await database.$transaction(async (tx) => {
      await limits(tx); await lock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SERVICES_CASE_UPDATE);
      const replay = await prior(tx, who.tenantId, command);
      const pipelineCase = await scopedCase(tx, who, caseReference);
      if (replay) {
        if (replay.targetRef !== caseReference) serviceFail("CRM_SERVICES_IDEMPOTENCY_CONFLICT", 409);
        const rows = await tx.pipelineCaseServiceRevision.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } } } });
        return Object.freeze({ selection: publicSelection(rows[0], await tx.pipelineCaseServiceRevision.count({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id } })), replayed: true });
      }
      const current = await tx.pipelineCaseServiceRevision.aggregate({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, _max: { revision: true } });
      const revision = current._max.revision || 0;
      if (revision !== command.expectedRevision) serviceFail("CRM_SERVICES_VERSION_CONFLICT", 409);
      const primary = await catalogByRef(tx, who.tenantId, command.primaryServiceRef, { active: true });
      if (!["PRIMARY", "BOTH"].includes(primary.usage) || !primary.compatibleModes.includes(pipelineCase.mode)) serviceFail("CRM_SERVICES_PRIMARY_INCOMPATIBLE", 409);
      const complementaries = await compatibleItems(tx, who.tenantId, primary.id, command.complementaryRefs);
      let defaultCombination = null;
      if (command.defaultCombinationRef) {
        defaultCombination = await tx.serviceDefaultCombination.findFirst({ where: { tenantId: who.tenantId, combinationRef: command.defaultCombinationRef, primaryServiceId: primary.id, status: "ACTIVE" }, include: { items: { include: { service: true } } } });
        if (!defaultCombination) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404);
      }
      const defaultRefs = new Set((defaultCombination?.items || []).map((item) => item.service.serviceRef));
      const header = await tx.pipelineCaseServiceRevision.create({ data: { id: randomUUID(), tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, revision: revision + 1, modeSnapshot: pipelineCase.mode, source: defaultCombination ? "DEFAULT_COMBINATION" : "MANUAL", defaultCombinationRef: defaultCombination?.combinationRef || null, createdByMembershipId: who.membershipId, createdByUserId: who.userId } });
      const items = [{ id: randomUUID(), tenantId: who.tenantId, revisionId: header.id, serviceId: primary.id, kind: "PRIMARY", source: "MANUAL", position: 0, serviceRefSnapshot: primary.serviceRef, codeSnapshot: primary.code, nameSnapshot: primary.name, categorySnapshot: primary.category, catalogVersionSnapshot: primary.version, classificationStatus: null },
        ...complementaries.map((item, index) => ({ id: randomUUID(), tenantId: who.tenantId, revisionId: header.id, serviceId: item.id, kind: "COMPLEMENTARY", source: defaultRefs.has(item.serviceRef) ? "DEFAULT" : "MANUAL", position: index + 1, serviceRefSnapshot: item.serviceRef, codeSnapshot: item.code, nameSnapshot: item.name, categorySnapshot: item.category, catalogVersionSnapshot: item.version, classificationStatus: null })),
        ...command.otherServices.map((item, index) => ({ id: randomUUID(), tenantId: who.tenantId, revisionId: header.id, serviceId: null, kind: "OTHER", source: "OTHER", position: complementaries.length + index + 1, serviceRefSnapshot: null, codeSnapshot: "OTHER", nameSnapshot: item.description, categorySnapshot: null, catalogVersionSnapshot: null, classificationStatus: "PENDING" }))];
      await tx.pipelineCaseServiceItem.createMany({ data: items });
      await journal(tx, who, command, caseReference, revision + 1, revision ? "CASE_SERVICE_SELECTION_CHANGED" : "CASE_SERVICE_SELECTION_CREATED", { revision }, { revision: revision + 1, mode: pipelineCase.mode, primaryCode: primary.code, complementaryCodes: complementaries.map((item) => item.code), otherPendingCount: command.otherServices.length });
      return Object.freeze({ selection: publicSelection({ ...header, items }, revision + 1), replayed: false });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) { throw databaseError(error); }
}
