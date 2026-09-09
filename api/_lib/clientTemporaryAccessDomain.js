import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { PERMS, permsForRole } from "./rbac.js";
import { createLocalSurveyStorage, surveyBlobSha256 } from "./crmSurveyStorage.js";
import {
  ClientTemporaryAccessError,
  assertAccessRef,
  assertTemporaryToken,
  normalizeClientVisitAction,
  normalizeCreateTemporaryAccess,
  normalizeMiniSurvey,
  normalizeQrConfirmation,
  normalizeRevokeTemporaryAccess,
  normalizeUploadMetadata,
} from "./clientTemporaryAccessContract.js";

const MUTATION_OPTIONS = Object.freeze({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
const ALLOWED_ROLES = new Set(["A", "V"]);
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_MIME = new Set(["application/pdf"]);
const buckets = new Map();

function fail(code, status = 400) { throw new ClientTemporaryAccessError(code, status); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function safeEqual(left, right) { const a = Buffer.from(String(left), "utf8"); const b = Buffer.from(String(right), "utf8"); return a.length === b.length && timingSafeEqual(a, b); }
function rateLimit(accessRef, action, maximum = 30) {
  const now = Date.now(); const key = digest(`${accessRef}:${action}`); const current = buckets.get(key);
  if (!current || current.until <= now) { buckets.set(key, { count: 1, until: now + 60_000 }); return; }
  current.count += 1; if (current.count > maximum) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
}
async function limits(tx) { await tx.$executeRawUnsafe("SET LOCAL lock_timeout='250ms'"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'"); }
async function lock(tx, tenantId, key) { const rows = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`CLIENT-PORTAL-16A:${tenantId}:${key}`},0)) AS ok`); if (rows[0]?.ok !== true) fail("CLIENT_TEMPORARY_COMMAND_IN_PROGRESS", 409); }
function databaseError(error) {
  if (error instanceof ClientTemporaryAccessError) return error;
  const code = [error?.meta?.code, error?.cause?.code, error?.code].find((value) => typeof value === "string");
  if (["P2002", "23505"].includes(code)) return new ClientTemporaryAccessError("CLIENT_TEMPORARY_CONFLICT", 409, { cause: error });
  if (["P2034", "40001", "40P01", "55P03", "57014"].includes(code)) return new ClientTemporaryAccessError("CLIENT_TEMPORARY_COMMAND_IN_PROGRESS", 409, { cause: error });
  if (["P2003", "P2025", "23503", "23514"].includes(code)) return new ClientTemporaryAccessError("CLIENT_TEMPORARY_STATE_INVALID", 409, { cause: error });
  return new ClientTemporaryAccessError("CLIENT_TEMPORARY_DATABASE_UNAVAILABLE", 503, { cause: error });
}

async function actor(tx, context, permission) {
  const tenantId = String(context?.tenantId || ""); const membershipId = String(context?.membershipId || ""); const userId = String(context?.userId || "");
  if (!tenantId || !membershipId || !userId) fail("CLIENT_TEMPORARY_FORBIDDEN", 403);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS role,m."status"::text AS membership_status,
      m."granted_permissions",m."denied_permissions",u."status" AS user_status,t."status"::text AS tenant_status
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m`);
  const row = rows[0]; if (!row) fail("CLIENT_TEMPORARY_FORBIDDEN", 403);
  const role = String(row.role || "").toUpperCase(); const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((item) => !denied.has(item)));
  if (String(row.user_status).toUpperCase() !== "ACTIVE" || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE" || !ALLOWED_ROLES.has(role) || denied.has(permission) || !effective.has(permission)) fail("CLIENT_TEMPORARY_FORBIDDEN", 403);
  return Object.freeze({ tenantId, membershipId, userId, role, effective, denied });
}

async function caseAuthority(tx, who, caseRef) {
  const row = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, publicRef: assertAccessRef(caseRef), ...(who.role === "V" ? { ownerMembershipId: who.membershipId, ownerUserId: who.userId } : {}) }, select: { id: true, publicRef: true, caseCode: true, clientId: true } });
  if (!row) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404); return row;
}

async function selectedContactAuthority(tx, who, pipelineCaseId, contactRef) {
  const row = await tx.commercialEntityContact.findFirst({
    where: { tenantId: who.tenantId, contactRef, status: "ACTIVE", entity: { caseParties: { some: { context: { pipelineCaseId, state: "PUBLISHED" } } } } },
    select: { id: true, contactRef: true, displayName: true },
  });
  if (!row) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404); return row;
}

async function priorCommand(tx, tenantId, command) {
  const prior = await tx.clientTemporaryAccessCommand.findFirst({ where: { tenantId, requestId: command.requestId } });
  if (!prior) return null;
  if (prior.operation !== command.operation || prior.payloadHash !== command.payloadHash) fail("CLIENT_TEMPORARY_IDEMPOTENCY_CONFLICT", 409);
  return prior;
}

function internalDto(row) {
  return Object.freeze({ accessRef: row.accessRef, purpose: row.purpose, status: row.status, scopes: Object.freeze((row.grants || []).map((grant) => grant.scope)), expiresAt: row.expiresAt.toISOString(), maxUses: row.maxUses, useCount: row.useCount, version: row.version, contact: Object.freeze({ contactRef: row.selectedContact.contactRef, displayName: row.selectedContact.displayName }), assignmentRef: row.surveyAssignment?.assignmentRef || null, communicationRef: row.communicationRecord?.communicationRef || null, issuedAt: row.issuedAt.toISOString(), revokedAt: row.revokedAt?.toISOString() || null });
}

const internalInclude = Object.freeze({ grants: { orderBy: { scope: "asc" } }, selectedContact: { select: { contactRef: true, displayName: true } }, surveyAssignment: { select: { assignmentRef: true } }, communicationRecord: { select: { communicationRef: true } } });

export async function createClientTemporaryAccess(context, raw, database = prisma, now = new Date()) {
  const command = normalizeCreateTemporaryAccess(raw);
  if (new Date(command.expiresAt) <= now) fail("CLIENT_TEMPORARY_EXPIRY_INVALID", 409);
  try { return await database.$transaction(async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.CLIENT_ACCESS_CREATE); await lock(tx, who.tenantId, command.requestId);
    const replay = await priorCommand(tx, who.tenantId, command);
    if (replay) { const row = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: who.tenantId, id: replay.accessId }, include: internalInclude }); if (!row) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404); return Object.freeze({ access: internalDto(row), oneTimeCredentials: null, replayed: true }); }
    const pipelineCase = await caseAuthority(tx, who, command.caseRef);
    const contact = await selectedContactAuthority(tx, who, pipelineCase.id, command.contactRef);
    const assignment = command.assignmentRef ? await tx.surveyAssignment.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, assignmentRef: command.assignmentRef }, select: { id: true, assignmentRef: true } }) : null;
    if (command.assignmentRef && !assignment) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404);
    const communication = command.communicationRef ? await tx.communicationRecord.findFirst({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, communicationRef: command.communicationRef, status: "PREPARED", recipientRef: contact.contactRef }, select: { id: true } }) : null;
    if (command.communicationRef && !communication) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404);
    const token = randomBytes(32).toString("base64url"); const tokenHash = digest(token);
    const shortCode = command.shortCodeEnabled ? String(randomInt(0, 1_000_000)).padStart(6, "0") : null;
    const shortCodeSalt = shortCode ? randomBytes(16).toString("hex") : null;
    const shortCodeHash = shortCode ? scryptSync(shortCode, shortCodeSalt, 32).toString("hex") : null;
    const shortCodeExpiresAt = shortCode ? new Date(Math.min(new Date(command.expiresAt).valueOf(), now.valueOf() + 15 * 60_000)) : null;
    const row = await tx.clientTemporaryAccess.create({ data: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id, clientId: pipelineCase.clientId, surveyAssignmentId: assignment?.id || null, selectedContactId: contact.id, communicationRecordId: communication?.id || null, tokenHash, shortCodeHash, shortCodeSalt, shortCodeExpiresAt, purpose: command.purpose, expiresAt: new Date(command.expiresAt), maxUses: command.maxUses, issuedByMembershipId: who.membershipId, issuedByUserId: who.userId, grants: { create: command.scopes.map((scope) => ({ scope })) }, events: { create: { eventType: "ACCESS_CREATED", actorKind: "EMPLOYEE", actorMembershipId: who.membershipId, actorUserId: who.userId, metadata: { purpose: command.purpose, scopeCount: command.scopes.length, communicationPrepared: Boolean(communication) } } } }, include: internalInclude });
    await tx.clientTemporaryAccessCommand.create({ data: { tenantId: who.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: { accessRef: row.accessRef } } });
    return Object.freeze({ access: internalDto(row), oneTimeCredentials: Object.freeze({ link: `/client-access/${row.accessRef}#token=${token}`, shortCode }), replayed: false });
  }, MUTATION_OPTIONS); } catch (error) { throw databaseError(error); }
}

export async function listClientTemporaryAccess(context, caseRef, database = prisma) {
  try { return await database.$transaction(async (tx) => { const who = await actor(tx, context, PERMS.CLIENT_ACCESS_VIEW); const pipelineCase = await caseAuthority(tx, who, caseRef); const rows = await tx.clientTemporaryAccess.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: pipelineCase.id }, include: internalInclude, orderBy: { issuedAt: "desc" }, take: 100 }); return Object.freeze(rows.map(internalDto)); }); } catch (error) { throw databaseError(error); }
}

export async function revokeClientTemporaryAccess(context, accessRef, raw, database = prisma, now = new Date()) {
  const command = normalizeRevokeTemporaryAccess(raw); const ref = assertAccessRef(accessRef);
  try { return await database.$transaction(async (tx) => {
    await limits(tx); const who = await actor(tx, context, PERMS.CLIENT_ACCESS_REVOKE); await lock(tx, who.tenantId, command.requestId); const replay = await priorCommand(tx, who.tenantId, command);
    if (replay) { const row = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: who.tenantId, id: replay.accessId }, include: internalInclude }); return Object.freeze({ access: internalDto(row), replayed: true }); }
    const row = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: who.tenantId, accessRef: ref }, include: { pipelineCase: { select: { ownerMembershipId: true, ownerUserId: true } } } });
    if (!row || who.role === "V" && (row.pipelineCase.ownerMembershipId !== who.membershipId || row.pipelineCase.ownerUserId !== who.userId)) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404);
    if (row.status !== "ACTIVE" || row.version !== command.expectedVersion) fail("CLIENT_TEMPORARY_VERSION_CONFLICT", 409);
    const changed = await tx.clientTemporaryAccess.updateMany({ where: { tenantId: who.tenantId, id: row.id, status: "ACTIVE", version: command.expectedVersion }, data: { status: "REVOKED", revokedAt: now, revocationReason: command.reason, version: { increment: 1 } } });
    if (changed.count !== 1) fail("CLIENT_TEMPORARY_VERSION_CONFLICT", 409);
    await tx.clientTemporaryAccessEvent.create({ data: { tenantId: who.tenantId, accessId: row.id, eventType: "ACCESS_REVOKED", actorKind: "EMPLOYEE", actorMembershipId: who.membershipId, actorUserId: who.userId, metadata: { reasonRecorded: true } } });
    await tx.clientTemporaryAccessCommand.create({ data: { tenantId: who.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: { accessRef: row.accessRef, status: "REVOKED" } } });
    const result = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: who.tenantId, id: row.id }, include: internalInclude }); return Object.freeze({ access: internalDto(result), replayed: false });
  }, MUTATION_OPTIONS); } catch (error) { throw databaseError(error); }
}

const publicInclude = Object.freeze({
  grants: { orderBy: { scope: "asc" } }, selectedContact: { select: { displayName: true } }, visitResponse: { select: { id: true, state: true, version: true } },
  pipelineCase: { select: { caseCode: true, routeContractVersion: true, routeRevision: true, routeSnapshots: { orderBy: [{ role: "asc" }, { stopOrder: "asc" }] } } },
  surveyAssignment: { include: { evaluationDecision: { select: { method: true } }, visitReason: { select: { reasonRef: true, name: true, visibleToClient: true } }, evaluatorMembership: { select: { user: { select: { name: true } }, employeeProfile: { select: { profileRef: true, jobTitle: true } } } }, visitFees: { where: { communicationStatus: "COMMUNICATED" }, orderBy: { version: "desc" }, take: 1 } } },
  contributions: { orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { sortOrder: "asc" } }, assets: { orderBy: { createdAt: "asc" }, select: { assetRef: true, category: true, documentType: true } } } },
});

async function locateAccess(database, accessRef, token, { scope, consume = false, now = new Date() } = {}) {
  const ref = assertAccessRef(accessRef); const secret = assertTemporaryToken(token); rateLimit(ref, scope || "VIEW"); const tokenHash = digest(secret);
  const locator = await database.clientTemporaryAccess.findUnique({ where: { accessRef: ref }, select: { tenantId: true, tokenHash: true } });
  if (!locator || !safeEqual(locator.tokenHash, tokenHash)) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
  return database.$transaction(async (tx) => {
    await limits(tx); if (consume) await lock(tx, locator.tenantId, `USE:${ref}`);
    const row = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: locator.tenantId, accessRef: ref, tokenHash }, include: publicInclude });
    const scopes = new Set(row?.grants.map((grant) => grant.scope) || []);
    if (!row || row.status !== "ACTIVE" || row.expiresAt <= now || row.useCount >= row.maxUses || scope && !scopes.has(scope)) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    if (consume) {
      const nextCount = row.useCount + 1; const changed = await tx.clientTemporaryAccess.updateMany({ where: { tenantId: row.tenantId, id: row.id, status: "ACTIVE", useCount: row.useCount, version: row.version }, data: { useCount: nextCount, lastUsedAt: now, status: nextCount >= row.maxUses ? "EXHAUSTED" : "ACTIVE", version: { increment: 1 } } });
      if (changed.count !== 1) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
      await tx.clientTemporaryAccessEvent.create({ data: { tenantId: row.tenantId, accessId: row.id, eventType: "ACCESS_USED", actorKind: "CLIENT_TEMPORARY", metadata: { credential: "TOKEN", useOrdinal: nextCount } } });
      row.useCount = nextCount; row.version += 1;
    }
    return row;
  }, MUTATION_OPTIONS);
}

function publicRoute(row) { return row.pipelineCase.routeSnapshots.filter((item) => item.routeVersion === row.surveyAssignment?.routeVersion).map((item) => Object.freeze({ role: item.role, order: item.stopOrder, countryCode: item.countryCode, provinceState: item.provinceState, cityMunicipality: item.cityMunicipality, sector: item.sector, streetAndNumber: item.streetAndNumber, buildingResidential: item.buildingResidential, floorUnit: item.floorUnit, arrivalReference: item.arrivalReference })); }
function contributionDto(value) { if (!value) return null; return Object.freeze({ contributionRef: value.contributionRef, revision: value.revision, version: value.version, status: value.status, source: value.source, notes: value.notes, estimatedWeightKg: Number(value.estimatedWeightKg), estimatedVolumeM3: Number(value.estimatedVolumeM3), metricLabel: "Información suministrada por el cliente / Mini Survey", items: Object.freeze(value.items.map((item) => Object.freeze({ itemRef: item.itemRef, articleRef: item.articleRefSnapshot, name: item.articleNameSnapshot, quantity: item.quantity, measurements: item.clientMeasurements, notes: item.notes, unitWeightKg: item.unitWeightKg === null ? null : Number(item.unitWeightKg), unitVolumeM3: item.unitVolumeM3 === null ? null : Number(item.unitVolumeM3) }))), assets: Object.freeze(value.assets) }); }
async function clientReasons(database, row) { return database.visitReason.findMany({ where: { tenantId: row.tenantId, status: "ACTIVE", visibleToClient: true, OR: [{ requesterOrigin: "CLIENT" }, { requesterOrigin: null }] }, select: { reasonRef: true, name: true, kind: true }, orderBy: { sortOrder: "asc" }, take: 50 }); }
async function miniCatalog(database, row) { if (!row.grants.some((grant) => grant.scope === "MINI_SURVEY_EDIT")) return []; const version = await database.surveyCatalogVersion.findFirst({ where: { tenantId: row.tenantId, status: "ACTIVE" }, orderBy: { version: "desc" }, include: { articles: { where: { status: "ACTIVE" }, select: { articleRef: true, name: true }, orderBy: { sortOrder: "asc" }, take: 100 } } }); return version?.articles || []; }
function publicAccessDto(row, reasons, catalog, credentialKind = "TOKEN") {
  const assignment = row.surveyAssignment; const fee = assignment?.visitFees?.[0]; const scopes = row.grants.map((grant) => grant.scope);
  return Object.freeze({ accessRef: row.accessRef, purpose: row.purpose, expiresAt: row.expiresAt.toISOString(), credentialKind, scopes: Object.freeze(scopes), contactName: row.selectedContact.displayName, case: Object.freeze({ caseCode: row.pipelineCase.caseCode }), visit: assignment ? Object.freeze({ visitRef: assignment.assignmentRef, method: assignment.evaluationDecision?.method || null, scheduledStart: assignment.scheduledStart.toISOString(), scheduledEnd: assignment.scheduledEnd?.toISOString() || null, status: assignment.status, instructions: assignment.instructionSnapshot, reason: assignment.visitReason?.visibleToClient ? assignment.visitReason.name : null, evaluator: Object.freeze({ evaluatorRef: assignment.evaluatorMembership.employeeProfile?.profileRef || null, displayName: assignment.evaluatorMembership.user.name, role: assignment.evaluatorMembership.employeeProfile?.jobTitle || "Evaluador autorizado" }), route: Object.freeze(publicRoute(row)), fee: fee && fee.suggestedAmount !== null && fee.currency ? Object.freeze({ disposition: fee.disposition, amount: Number(fee.suggestedAmount), currency: fee.currency }) : null, clientResponse: Object.freeze({ state: row.visitResponse?.state || "PENDING", version: row.visitResponse?.version || 0 }) }) : null, reasons: Object.freeze(reasons), miniCatalog: Object.freeze(catalog), contribution: contributionDto(row.contributions[0]), notices: Object.freeze({ surveySource: "CLIENT_SUPPLIED", quoteAcceptanceAvailable: false, externalTransportEnabled: false }) });
}

export async function openClientTemporaryAccess(accessRef, token, database = prisma, now = new Date()) {
  try { const row = await locateAccess(database, accessRef, token, { consume: true, now }); const [reasons, catalog] = await Promise.all([clientReasons(database, row), miniCatalog(database, row)]); return publicAccessDto(row, reasons, catalog); } catch (error) { throw databaseError(error); }
}

export async function openClientTemporaryAccessByCode(accessRef, code, database = prisma, now = new Date()) {
  const ref = assertAccessRef(accessRef); rateLimit(ref, "SHORT_CODE", 6);
  if (!/^\d{6}$/.test(String(code || ""))) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
  try { const outcome = await database.$transaction(async (tx) => {
    await limits(tx); await lock(tx, "PUBLIC", `CODE:${ref}`); const locator = await tx.clientTemporaryAccess.findUnique({ where: { accessRef: ref }, select: { tenantId: true } }); if (!locator) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    const row = await tx.clientTemporaryAccess.findFirst({ where: { tenantId: locator.tenantId, accessRef: ref }, include: publicInclude });
    if (!row || row.status !== "ACTIVE" || row.expiresAt <= now || !row.shortCodeHash || !row.shortCodeSalt || !row.shortCodeExpiresAt || row.shortCodeExpiresAt <= now || row.shortCodeLockedUntil && row.shortCodeLockedUntil > now) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    const candidate = scryptSync(String(code), row.shortCodeSalt, 32).toString("hex");
    if (!safeEqual(row.shortCodeHash, candidate)) { const failures = row.shortCodeFailedCount + 1; await tx.clientTemporaryAccess.update({ where: { id: row.id }, data: { shortCodeFailedCount: failures, shortCodeLockedUntil: failures >= 5 ? new Date(now.valueOf() + 15 * 60_000) : null, version: { increment: 1 } } }); return Object.freeze({ unavailable: true }); }
    const [reasons, catalog] = await Promise.all([clientReasons(tx, row), miniCatalog(tx, row)]); return publicAccessDto(row, reasons, catalog, "SHORT_CODE");
  }, MUTATION_OPTIONS); if (outcome?.unavailable === true) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404); return outcome; } catch (error) { throw databaseError(error); }
}

async function accessCommand(tx, row, command) { const prior = await priorCommand(tx, row.tenantId, command); if (prior && prior.accessId !== row.id) fail("CLIENT_TEMPORARY_IDEMPOTENCY_CONFLICT", 409); return prior; }
async function refreshPublic(tx, rowId) { return tx.clientTemporaryAccess.findFirst({ where: { id: rowId }, include: publicInclude }); }

export async function applyClientVisitAction(accessRef, token, raw, database = prisma, now = new Date()) {
  const command = normalizeClientVisitAction(raw); const requiredScope = command.operation;
  try { const access = await locateAccess(database, accessRef, token, { scope: requiredScope, now }); return await database.$transaction(async (tx) => {
    await limits(tx); await lock(tx, access.tenantId, command.requestId); const prior = await accessCommand(tx, access, command); if (prior) return Object.freeze({ ...prior.resultJson, replayed: true });
    const row = await refreshPublic(tx, access.id); if (!row?.surveyAssignment) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    const current = row.visitResponse; if ((current?.version || 0) !== command.expectedVersion) fail("CLIENT_TEMPORARY_VERSION_CONFLICT", 409);
    const state = command.operation === "VISIT_CONFIRM" ? "CONFIRMED" : command.operation === "VISIT_CHANGE_REQUEST" ? "CHANGE_REQUESTED" : "CANCEL_REQUESTED";
    const reason = command.reasonRef ? await tx.visitReason.findFirst({ where: { tenantId: row.tenantId, reasonRef: command.reasonRef, status: "ACTIVE", visibleToClient: true, requesterOrigin: "CLIENT", kind: command.operation === "VISIT_CHANGE_REQUEST" ? "RESCHEDULE" : "CANCELLATION" }, select: { id: true } }) : null;
    if (command.reasonRef && !reason) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404);
    const timestamps = state === "CONFIRMED" ? { confirmedAt: now } : state === "CHANGE_REQUESTED" ? { changeRequestedAt: now } : { cancellationRequestedAt: now };
    const response = current ? await tx.clientTemporaryVisitResponse.update({ where: { id: current.id }, data: { state, visitReasonId: reason?.id || null, comment: command.comment, suggestedAvailability: command.suggestedAvailability, ...timestamps, version: { increment: 1 } } }) : await tx.clientTemporaryVisitResponse.create({ data: { tenantId: row.tenantId, accessId: row.id, surveyAssignmentId: row.surveyAssignment.id, state, visitReasonId: reason?.id || null, comment: command.comment, suggestedAvailability: command.suggestedAvailability, ...timestamps } });
    if (state !== "CANCEL_REQUESTED") await tx.surveyAssignment.updateMany({ where: { tenantId: row.tenantId, id: row.surveyAssignment.id, version: row.surveyAssignment.version }, data: { clientConfirmation: state === "CONFIRMED" ? "CONFIRMED" : "CHANGE_REQUESTED", version: { increment: 1 } } });
    const eventType = state === "CONFIRMED" ? "VISIT_CONFIRMED" : state === "CHANGE_REQUESTED" ? "CHANGE_REQUESTED" : "CANCELLATION_REQUESTED";
    await tx.clientTemporaryAccessEvent.create({ data: { tenantId: row.tenantId, accessId: row.id, eventType, actorKind: "CLIENT_TEMPORARY", metadata: { responseRef: response.responseRef, state, origin: "CLIENT", schedulingRequired: state !== "CONFIRMED" } } });
    const result = Object.freeze({ state, version: response.version, accepted: true, schedulingChanged: false, replayed: false });
    await tx.clientTemporaryAccessCommand.create({ data: { tenantId: row.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: result } }); return result;
  }, MUTATION_OPTIONS); } catch (error) { throw databaseError(error); }
}

export async function saveClientMiniSurvey(accessRef, token, raw, database = prisma, now = new Date()) {
  const command = normalizeMiniSurvey(raw);
  try { const access = await locateAccess(database, accessRef, token, { scope: "MINI_SURVEY_EDIT", now }); return await database.$transaction(async (tx) => {
    await limits(tx); await lock(tx, access.tenantId, command.requestId); const prior = await accessCommand(tx, access, command); if (prior) return Object.freeze({ ...prior.resultJson, replayed: true });
    const row = await refreshPublic(tx, access.id); if (!row?.surveyAssignment) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    const current = row.contributions[0]; if ((current?.version || 0) !== command.expectedVersion) fail("CLIENT_TEMPORARY_VERSION_CONFLICT", 409);
    const catalog = await tx.surveyCatalogVersion.findFirst({ where: { tenantId: row.tenantId, status: "ACTIVE" }, orderBy: { version: "desc" }, include: { articles: { where: { articleRef: { in: command.items.map((item) => item.articleRef) }, status: "ACTIVE" } } } });
    if (!catalog || catalog.articles.length !== command.items.length) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404);
    const byRef = new Map(catalog.articles.map((item) => [item.articleRef, item]));
    const items = command.items.map((item, index) => { const authority = byRef.get(item.articleRef); const unitVolume = authority.defaultVolumeM3 === null ? null : Number(authority.defaultVolumeM3); const unitWeight = authority.defaultWeightKg === null ? null : Number(authority.defaultWeightKg); return { catalogVersionId: catalog.id, catalogItemId: authority.id, articleRefSnapshot: authority.articleRef, articleCodeSnapshot: authority.code, articleNameSnapshot: authority.name, quantity: item.quantity, unitVolumeM3: unitVolume, unitWeightKg: unitWeight, totalVolumeM3: unitVolume === null ? null : unitVolume * item.quantity, totalWeightKg: unitWeight === null ? null : unitWeight * item.quantity, clientMeasurements: item.measurements === null ? Prisma.DbNull : item.measurements, notes: item.notes, sortOrder: index }; });
    const estimatedVolumeM3 = items.reduce((sum, item) => sum + (item.totalVolumeM3 || 0), 0); const estimatedWeightKg = items.reduce((sum, item) => sum + (item.totalWeightKg || 0), 0);
    if (current) await tx.clientTemporarySurveyContribution.update({ where: { id: current.id }, data: { status: "SUPERSEDED", version: { increment: 1 } } });
    const createdContribution = await tx.clientTemporarySurveyContribution.create({ data: { tenantId: row.tenantId, accessId: row.id, surveyAssignmentId: row.surveyAssignment.id, catalogVersionId: catalog.id, revision: (current?.revision || 0) + 1, status: command.submit ? "SUBMITTED" : "DRAFT", source: "CLIENT_SUPPLIED", notes: command.notes, estimatedWeightKg, estimatedVolumeM3, submittedAt: command.submit ? now : null } });
    await tx.clientTemporarySurveyContributionItem.createMany({ data: items.map((item) => ({ ...item, tenantId: row.tenantId, contributionId: createdContribution.id })) });
    const contribution = await tx.clientTemporarySurveyContribution.findUniqueOrThrow({ where: { id: createdContribution.id }, include: { items: { orderBy: { sortOrder: "asc" } }, assets: true } });
    const result = Object.freeze({ contribution: contributionDto(contribution), missingMetricCount: items.filter((item) => item.unitVolumeM3 === null || item.unitWeightKg === null).length, replayed: false });
    await tx.clientTemporaryAccessEvent.create({ data: { tenantId: row.tenantId, accessId: row.id, eventType: command.submit ? "MINI_SURVEY_COMPLETED" : "MINI_SURVEY_SAVED", actorKind: "CLIENT_TEMPORARY", metadata: { contributionRef: contribution.contributionRef, revision: contribution.revision, typeCount: items.length, source: "CLIENT_SUPPLIED" } } });
    await tx.clientTemporaryAccessCommand.create({ data: { tenantId: row.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: result } }); return result;
  }, MUTATION_OPTIONS); } catch (error) { throw databaseError(error); }
}

export async function confirmClientVisitQr(accessRef, token, raw, database = prisma, now = new Date()) {
  const command = normalizeQrConfirmation(raw);
  try { const access = await locateAccess(database, accessRef, token, { scope: "VISIT_QR_CONFIRM", now }); return await database.$transaction(async (tx) => {
    await limits(tx); await lock(tx, access.tenantId, command.requestId); const prior = await accessCommand(tx, access, command); if (prior) return Object.freeze({ ...prior.resultJson, replayed: true }); const row = await refreshPublic(tx, access.id); const assignment = row?.surveyAssignment; const evaluatorRef = assignment?.evaluatorMembership.employeeProfile?.profileRef;
    if (!assignment || !evaluatorRef) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404); const expected = `osi-visit:v1:${assignment.assignmentRef}:${evaluatorRef}`; const verified = safeEqual(expected, command.qrPayload);
    const confirmation = await tx.clientTemporaryQrConfirmation.create({ data: { tenantId: row.tenantId, accessId: row.id, surveyAssignmentId: assignment.id, visitRefSnapshot: assignment.assignmentRef, evaluatorRefSnapshot: evaluatorRef, result: verified ? "VERIFIED" : "REJECTED" } });
    const result = Object.freeze({ confirmationRef: confirmation.confirmationRef, verified, replayed: false });
    await tx.clientTemporaryAccessEvent.create({ data: { tenantId: row.tenantId, accessId: row.id, eventType: "QR_VALIDATED", actorKind: "CLIENT_TEMPORARY", metadata: { confirmationRef: confirmation.confirmationRef, verified } } }); await tx.clientTemporaryAccessCommand.create({ data: { tenantId: row.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: result } }); return result;
  }, MUTATION_OPTIONS); } catch (error) { throw databaseError(error); }
}

export async function uploadClientSurveyAsset(accessRef, token, rawMetadata, bytes, database = prisma, storage = createLocalSurveyStorage(), now = new Date()) {
  const sha256 = surveyBlobSha256(bytes); const command = normalizeUploadMetadata({ ...rawMetadata, sizeBytes: bytes.length, sha256 }); let stored;
  if (rawMetadata.sizeBytes !== undefined || rawMetadata.sha256 !== undefined) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const allowedMime = command.category === "PHOTO" ? PHOTO_MIME : DOCUMENT_MIME; if (!allowedMime.has(command.mimeType) || command.category === "PHOTO" && bytes.length > 10 * 1024 * 1024) fail("CLIENT_TEMPORARY_BLOB_INVALID", 400);
  try { const access = await locateAccess(database, accessRef, token, { scope: "SURVEY_INFO_UPLOAD", now }); return await database.$transaction(async (tx) => {
    await limits(tx); await lock(tx, access.tenantId, command.requestId); const prior = await accessCommand(tx, access, command); if (prior) return Object.freeze({ ...prior.resultJson, replayed: true }); const row = await refreshPublic(tx, access.id); if (!row?.surveyAssignment) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
    let contribution = row.contributions[0]; if (!contribution || contribution.status === "SUPERSEDED") { const catalog = await tx.surveyCatalogVersion.findFirst({ where: { tenantId: row.tenantId, status: "ACTIVE" }, orderBy: { version: "desc" } }); if (!catalog) fail("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", 404); contribution = await tx.clientTemporarySurveyContribution.create({ data: { tenantId: row.tenantId, accessId: row.id, surveyAssignmentId: row.surveyAssignment.id, catalogVersionId: catalog.id } }); }
    stored = await storage.put({ tenantId: row.tenantId, kind: command.category === "PHOTO" ? "client-photo" : "client-document", mimeType: command.mimeType, bytes });
    const blob = await tx.surveyBlobObject.create({ data: { tenantId: row.tenantId, provider: storage.provider, ...stored } }); const asset = await tx.clientTemporarySurveyContributionAsset.create({ data: { tenantId: row.tenantId, contributionId: contribution.id, blobObjectId: blob.id, category: command.category, documentType: command.documentType, source: "CLIENT_SUPPLIED" } });
    const result = Object.freeze({ assetRef: asset.assetRef, category: asset.category, documentType: asset.documentType, source: asset.source, replayed: false }); await tx.clientTemporaryAccessEvent.create({ data: { tenantId: row.tenantId, accessId: row.id, eventType: "SURVEY_ASSET_UPLOADED", actorKind: "CLIENT_TEMPORARY", metadata: { assetRef: asset.assetRef, category: asset.category, mimeType: command.mimeType, sizeBytes: bytes.length } } }); await tx.clientTemporaryAccessCommand.create({ data: { tenantId: row.tenantId, accessId: row.id, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, resultJson: result } }); return result;
  }, MUTATION_OPTIONS); } catch (error) { if (stored?.storageKey) await storage.remove(stored.storageKey); throw databaseError(error); }
}
