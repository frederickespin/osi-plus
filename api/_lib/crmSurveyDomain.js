import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";
import {
  CrmSurveyError,
  assertPublicSurveyRef,
  canonicalJson,
  normalizeAssignmentAction,
  normalizeAssignmentCreate,
  normalizeCatalogCreate,
  normalizeDraftMutation,
  normalizePhotoCommand,
  normalizePublish,
  surveyFail,
} from "./crmSurveyContract.js";
import {
  renderSurveyPublicationPdf,
  renderSurveySignatureSvg,
} from "./crmSurveyPdf.js";
import {
  createLocalSurveyStorage,
  surveyBlobSha256,
} from "./crmSurveyStorage.js";

const SOURCE = "V17_SURVEY_FOUNDATION_04A";
const MUTATION_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 3_000,
  timeout: 15_000,
});

function contextText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 191)
    surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return value;
}

async function actor(tx, context, required, { any = false } = {}) {
  const tenantId = contextText(context?.tenantId);
  const membershipId = contextText(context?.membershipId);
  const userId = contextText(context?.userId);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."public_ref",m."tenant_id",m."user_id",m."role"::text AS "role",
      m."status"::text AS "membership_status",m."granted_permissions",m."denied_permissions",
      u."status" AS "user_status",u."name" AS "user_name",t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m
  `);
  const row = rows[0];
  if (
    !row ||
    String(row.user_status).toUpperCase() !== "ACTIVE" ||
    row.membership_status !== "ACTIVE" ||
    row.tenant_status !== "ACTIVE"
  )
    surveyFail("CRM_SURVEY_PERMISSION_FORBIDDEN", 403);
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set(
    [
      ...permsForRole(row.role),
      ...(row.granted_permissions || []).map(String),
    ].filter((permission) => !denied.has(permission)),
  );
  const permissions = Array.isArray(required) ? required : [required];
  const allowed = any
    ? permissions.some((permission) => effective.has(permission))
    : permissions.every((permission) => effective.has(permission));
  if (!allowed || permissions.some((permission) => denied.has(permission)))
    surveyFail("CRM_SURVEY_PERMISSION_FORBIDDEN", 403);
  return Object.freeze({
    tenantId,
    membershipId: String(row.id),
    membershipRef: String(row.public_ref),
    userId: String(row.user_id),
    userName: String(row.user_name),
    effective,
  });
}

async function mutationLimits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '300ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
}
async function commandLock(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(
    Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`SURVEY-04A:${tenantId}:${requestId}`},0)) AS "ok"`,
  );
  if (rows[0]?.ok !== true) surveyFail("CRM_SURVEY_COMMAND_IN_PROGRESS", 409);
}
async function priorCommand(tx, tenantId, command) {
  const row = await tx.surveyMutationCommand.findFirst({
    where: { tenantId, requestId: command.requestId },
  });
  if (!row) return null;
  if (
    row.operation !== command.operation ||
    row.payloadHash !== command.payloadHash
  )
    surveyFail("CRM_SURVEY_IDEMPOTENCY_CONFLICT", 409);
  return row.resultJson;
}
async function recordCommand(
  tx,
  who,
  command,
  targetRef,
  version,
  result,
  action,
  metadata = {},
) {
  await tx.surveyMutationCommand.create({
    data: {
      tenantId: who.tenantId,
      requestId: command.requestId,
      operation: command.operation,
      payloadHash: command.payloadHash,
      targetRef,
      resultingVersion: version,
      actorMembershipId: who.membershipId,
      actorUserId: who.userId,
      resultJson: result,
    },
  });
  await appendCommercialAudit(
    tx,
    {
      tenantId: who.tenantId,
      actorKind: "MEMBERSHIP",
      actorMembershipId: who.membershipId,
    },
    {
      source: SOURCE,
      action,
      entity: "SURVEY",
      entityId: targetRef,
      requestId: command.requestId,
      correlationId: command.requestId,
      beforeJson: null,
      afterJson: { version, ...metadata },
      metadataJson: { operation: command.operation },
    },
  );
}
function databaseError(error) {
  if (error instanceof CrmSurveyError) return error;
  const code = [error?.meta?.code, error?.cause?.code, error?.code].find(
    (value) => typeof value === "string",
  );
  if (["P2002", "23505"].includes(code))
    return new CrmSurveyError("CRM_SURVEY_CONFLICT", 409, { cause: error });
  if (["P2003", "P2025", "23503", "23514"].includes(code))
    return new CrmSurveyError("CRM_SURVEY_STATE_INVALID", 409, {
      cause: error,
    });
  if (["55P03", "57014", "40001"].includes(code))
    return new CrmSurveyError("CRM_SURVEY_COMMAND_IN_PROGRESS", 409, {
      cause: error,
    });
  return new CrmSurveyError("CRM_SURVEY_DATABASE_UNAVAILABLE", 503, {
    cause: error,
  });
}
function asNumber(value) {
  return value == null ? null : Number(value);
}
function routeSummary(route) {
  if (!route) return "No disponible";
  return [
    route.streetAndNumber,
    route.sector,
    route.cityMunicipality,
    route.provinceState,
    route.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}
function publicAssignment(row) {
  return Object.freeze({
    assignmentRef: row.assignmentRef,
    caseRef: row.pipelineCase.publicRef,
    caseCode: row.pipelineCase.caseCode,
    clientDisplayName: row.pipelineCase.client?.displayName || null,
    evaluator: { displayName: row.evaluatorMembership.user.name },
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    status: row.status,
    arrivalAt: row.arrivalAt,
    punctualityConfirmedAt: row.punctualityConfirmedAt,
    context: row.contextSnapshot,
    instruction: row.instructionSnapshot,
    version: row.version,
    surveyRef: row.drafts?.[0]?.surveyRef || null,
  });
}
function publicCatalog(row) {
  return Object.freeze({
    catalogRef: row.catalogRef,
    version: row.version,
    articles: Object.freeze(
      row.articles.map((item) =>
        Object.freeze({
          articleRef: item.articleRef,
          code: item.code,
          name: item.name,
          aliases: Object.freeze(item.aliases),
          frequentAreaRefs: Object.freeze(item.frequentAreaRefs),
          defaultVolumeM3: asNumber(item.defaultVolumeM3),
          defaultWeightKg: asNumber(item.defaultWeightKg),
        }),
      ),
    ),
    areas: Object.freeze(
      row.areas.map((item) =>
        Object.freeze({
          areaRef: item.areaRef,
          code: item.code,
          name: item.name,
        }),
      ),
    ),
    conditions: Object.freeze(
      row.conditions.map((item) =>
        Object.freeze({
          conditionRef: item.conditionRef,
          code: item.code,
          name: item.name,
          kind: item.kind,
        }),
      ),
    ),
  });
}
function publicItem(item) {
  return Object.freeze({
    itemRef: item.itemRef,
    article: {
      articleRef: item.articleRefSnapshot,
      code: item.articleCodeSnapshot,
      name: item.articleNameSnapshot,
    },
    area: {
      areaRef: item.areaRefSnapshot,
      code: item.areaCodeSnapshot,
      name: item.areaNameSnapshot,
    },
    shipmentMode: item.shipmentMode,
    quantity: item.quantity,
    condition: item.condition,
    flags: Object.freeze(item.flags),
    dimensions: item.originalDimensions,
    normalizedCm:
      item.lengthCm == null
        ? null
        : {
            length: asNumber(item.lengthCm),
            width: asNumber(item.widthCm),
            height: asNumber(item.heightCm),
          },
    unitVolumeM3: asNumber(item.unitVolumeM3),
    unitWeightKg: asNumber(item.unitWeightKg),
    volumeSource: item.volumeSource,
    weightSource: item.weightSource,
    note: item.note,
    version: item.version,
    photos: Object.freeze(
      (item.photos || []).map((photo) => ({
        photoRef: photo.photoRef,
        purpose: photo.purpose,
      })),
    ),
  });
}
function publicAccess(row) {
  return Object.freeze({
    accessRef: row.accessRef,
    side: row.side,
    floorNumber: row.floorNumber,
    stairsFloors: row.stairsFloors,
    elevatorAvailable: row.elevatorAvailable,
    elevatorFloor: row.elevatorFloor,
    parkingDistanceM: asNumber(row.parkingDistanceM),
    flags: Object.freeze(row.flags),
    notes: row.notes,
    version: row.version,
    photos: Object.freeze(
      (row.photos || []).map((photo) => ({
        photoRef: photo.photoRef,
        purpose: photo.purpose,
      })),
    ),
  });
}
function totals(items) {
  return Object.freeze(
    items.reduce(
      (sum, item) => ({
        quantity: sum.quantity + item.quantity,
        volumeM3:
          sum.volumeM3 + (asNumber(item.unitVolumeM3) || 0) * item.quantity,
        weightKg:
          sum.weightKg + (asNumber(item.unitWeightKg) || 0) * item.quantity,
      }),
      { quantity: 0, volumeM3: 0, weightKg: 0 },
    ),
  );
}
function publicDraft(row) {
  const activeItems = row.items.filter((item) => !item.deletedAt);
  return Object.freeze({
    surveyRef: row.surveyRef,
    assignmentRef: row.assignment.assignmentRef,
    caseRef: row.pipelineCase.publicRef,
    caseCode: row.pipelineCase.caseCode,
    clientDisplayName: row.pipelineCase.client?.displayName || null,
    status: row.status,
    revision: row.revision,
    version: row.version,
    routeVersion: row.routeVersion,
    serviceSelectionRef: row.serviceRevision.selectionRef,
    catalog: publicCatalog(row.catalogVersion),
    items: Object.freeze(activeItems.map(publicItem)),
    access: Object.freeze(row.accessObservations.map(publicAccess)),
    totals: totals(activeItems),
    notes: row.notes,
    updatedAt: row.updatedAt,
  });
}
const draftInclude = Object.freeze({
  assignment: true,
  pipelineCase: { include: { client: true } },
  serviceRevision: true,
  catalogVersion: {
    include: {
      articles: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } },
      areas: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } },
      conditions: {
        where: { status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
  items: { orderBy: { sortOrder: "asc" }, include: { photos: true } },
  accessObservations: { orderBy: { side: "asc" }, include: { photos: true } },
});
async function scopedAssignment(
  tx,
  who,
  ref,
  permission = PERMS.SURVEY_ASSIGNMENT_VIEW,
) {
  assertPublicSurveyRef(ref);
  const tenantWide = who.effective.has(PERMS.SURVEY_ASSIGNMENT_MANAGE);
  if (!tenantWide && !who.effective.has(permission))
    surveyFail("CRM_SURVEY_PERMISSION_FORBIDDEN", 403);
  const row = await tx.surveyAssignment.findFirst({
    where: {
      tenantId: who.tenantId,
      assignmentRef: ref,
      ...(tenantWide
        ? {}
        : {
            evaluatorMembershipId: who.membershipId,
            evaluatorUserId: who.userId,
          }),
    },
    include: {
      pipelineCase: { include: { client: true } },
      evaluatorMembership: { include: { user: true } },
      drafts: { orderBy: { revision: "desc" }, take: 1 },
    },
  });
  if (!row) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return row;
}
async function scopedDraft(tx, who, ref, permission = PERMS.SURVEY_PERFORM) {
  assertPublicSurveyRef(ref);
  if (!who.effective.has(permission))
    surveyFail("CRM_SURVEY_PERMISSION_FORBIDDEN", 403);
  const tenantWide = who.effective.has(PERMS.SURVEY_ASSIGNMENT_MANAGE);
  const row = await tx.surveyDraft.findFirst({
    where: {
      tenantId: who.tenantId,
      surveyRef: ref,
      ...(tenantWide
        ? {}
        : {
            assignment: {
              evaluatorMembershipId: who.membershipId,
              evaluatorUserId: who.userId,
            },
          }),
    },
    include: draftInclude,
  });
  if (!row) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return row;
}

export async function getSurveyCatalog(context, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(
        tx,
        context,
        [PERMS.SURVEY_ASSIGNMENT_VIEW, PERMS.SURVEY_PERFORM, PERMS.SURVEY_READ],
        { any: true },
      );
      const row = await tx.surveyCatalogVersion.findFirst({
        where: { tenantId: who.tenantId, status: "ACTIVE" },
        include: {
          articles: {
            where: { status: "ACTIVE" },
            orderBy: { sortOrder: "asc" },
          },
          areas: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } },
          conditions: {
            where: { status: "ACTIVE" },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!row) surveyFail("CRM_SURVEY_CATALOG_NOT_READY", 409);
      return publicCatalog(row);
    });
  } catch (error) {
    throw databaseError(error);
  }
}

export async function createSurveyCatalog(context, input, database = prisma) {
  const command = normalizeCatalogCreate(input);
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SURVEY_ASSIGNMENT_MANAGE);
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const latest = await tx.surveyCatalogVersion.findFirst({
        where: { tenantId: who.tenantId },
        orderBy: { version: "desc" },
        include: { articles: true, areas: true, conditions: true },
      });
      if ((latest?.version || 0) !== command.expectedLatestVersion)
        surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
      const version = (latest?.version || 0) + 1;
      const row = await tx.surveyCatalogVersion.create({
        data: {
          tenantId: who.tenantId,
          version,
          status: "DRAFT",
          createdByMembershipId: who.membershipId,
          createdByUserId: who.userId,
        },
      });
      const priorArticles = new Map(
        (latest?.articles || []).map((entry) => [entry.code, entry.articleRef]),
      );
      const priorAreas = new Map(
        (latest?.areas || []).map((entry) => [entry.code, entry.areaRef]),
      );
      const priorConditions = new Map(
        (latest?.conditions || []).map((entry) => [
          entry.code,
          entry.conditionRef,
        ]),
      );
      const areas = command.areas.map((entry) => ({
        ...entry,
        id: randomUUID(),
        areaRef: priorAreas.get(entry.code) || randomUUID(),
        tenantId: who.tenantId,
        catalogVersionId: row.id,
      }));
      const areaRefs = new Map(
        areas.map((entry) => [entry.code, entry.areaRef]),
      );
      await tx.surveyAreaCatalogItem.createMany({ data: areas });
      await tx.surveyArticleCatalogItem.createMany({
        data: command.articles.map((entry) => ({
          id: randomUUID(),
          articleRef: priorArticles.get(entry.code) || randomUUID(),
          tenantId: who.tenantId,
          catalogVersionId: row.id,
          code: entry.code,
          name: entry.name,
          aliases: [...entry.aliases],
          frequentAreaRefs: entry.frequentAreaCodes.map((code) =>
            areaRefs.get(code),
          ),
          defaultVolumeM3: entry.defaultVolumeM3,
          defaultWeightKg: entry.defaultWeightKg,
          weightSource: entry.defaultWeightKg == null ? null : "CATALOG",
          sortOrder: entry.sortOrder,
        })),
      });
      if (command.conditions.length)
        await tx.surveyConditionCatalogItem.createMany({
          data: command.conditions.map((entry) => ({
            id: randomUUID(),
            conditionRef: priorConditions.get(entry.code) || randomUUID(),
            tenantId: who.tenantId,
            catalogVersionId: row.id,
            ...entry,
          })),
        });
      if (latest?.status === "ACTIVE")
        await tx.surveyCatalogVersion.update({
          where: { id: latest.id },
          data: { status: "RETIRED", retiredAt: new Date() },
        });
      await tx.surveyCatalogVersion.update({
        where: { id: row.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });
      const result = { catalogRef: row.catalogRef, version, replayed: false };
      await recordCommand(
        tx,
        who,
        command,
        row.catalogRef,
        version,
        result,
        "SURVEY_CATALOG_PUBLISHED",
        {
          articleCount: command.articles.length,
          areaCount: command.areas.length,
          conditionCount: command.conditions.length,
        },
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function listSurveyAgenda(context, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(
        tx,
        context,
        [PERMS.SURVEY_ASSIGNMENT_VIEW, PERMS.SURVEY_ASSIGNMENT_MANAGE],
        { any: true },
      );
      const tenantWide = who.effective.has(PERMS.SURVEY_ASSIGNMENT_MANAGE);
      const rows = await tx.surveyAssignment.findMany({
        where: {
          tenantId: who.tenantId,
          ...(tenantWide
            ? {}
            : {
                evaluatorMembershipId: who.membershipId,
                evaluatorUserId: who.userId,
              }),
        },
        orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
        include: {
          pipelineCase: { include: { client: true } },
          evaluatorMembership: { include: { user: true } },
          drafts: { orderBy: { revision: "desc" }, take: 1 },
        },
      });
      return Object.freeze(rows.map(publicAssignment));
    });
  } catch (error) {
    throw databaseError(error);
  }
}

export async function createSurveyAssignment(
  context,
  input,
  database = prisma,
) {
  const command = normalizeAssignmentCreate(input);
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SURVEY_ASSIGNMENT_MANAGE);
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const pipelineCase = await tx.pipelineCase.findFirst({
        where: { tenantId: who.tenantId, publicRef: command.caseRef },
        include: {
          client: true,
          routeSnapshots: {
            where: { routeVersion: { gt: 0 } },
            orderBy: [{ routeVersion: "desc" }, { stopOrder: "asc" }],
          },
        },
      });
      if (!pipelineCase) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      const serviceRevision = await tx.pipelineCaseServiceRevision.findFirst({
        where: {
          tenantId: who.tenantId,
          pipelineCaseId: pipelineCase.id,
          selectionRef: command.serviceSelectionRef,
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
      if (!serviceRevision) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      const evaluator = await tx.tenantMembership.findFirst({
        where: {
          tenantId: who.tenantId,
          publicRef: command.evaluatorMembershipRef,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
        include: { user: true },
      });
      if (!evaluator) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      const denied = new Set(evaluator.deniedPermissions);
      const effective = new Set(
        [
          ...permsForRole(evaluator.role),
          ...evaluator.grantedPermissions,
        ].filter((permission) => !denied.has(permission)),
      );
      if (!effective.has(PERMS.SURVEY_PERFORM))
        surveyFail("CRM_SURVEY_EVALUATOR_INVALID", 409);
      const routeVersion = pipelineCase.routeSnapshots[0]?.routeVersion || 0;
      if (routeVersion < 1) surveyFail("CRM_SURVEY_ROUTE_REQUIRED", 409);
      const routes = pipelineCase.routeSnapshots.filter(
        (route) => route.routeVersion === routeVersion,
      );
      const origin = routes.find((route) => route.role === "ORIGIN");
      const destination = routes.find((route) => route.role === "DESTINATION");
      const contextSnapshot = {
        caseCode: pipelineCase.caseCode,
        clientDisplayName: pipelineCase.client?.displayName || null,
        company: null,
        leadAccount: null,
        booker: null,
        origin: routeSummary(origin),
        destination: routeSummary(destination),
        routeVersion,
        serviceSelectionRef: serviceRevision.selectionRef,
        services: serviceRevision.items.map((item) => ({
          kind: item.kind,
          code: item.codeSnapshot,
          name: item.nameSnapshot,
        })),
      };
      const row = await tx.surveyAssignment.create({
        data: {
          tenantId: who.tenantId,
          pipelineCaseId: pipelineCase.id,
          serviceRevisionId: serviceRevision.id,
          routeVersion,
          evaluatorMembershipId: evaluator.id,
          evaluatorUserId: evaluator.userId,
          scheduledStart: new Date(command.scheduledStart),
          scheduledEnd: command.scheduledEnd
            ? new Date(command.scheduledEnd)
            : null,
          contextSnapshot,
          instructionSnapshot: command.instruction,
          createdByMembershipId: who.membershipId,
          createdByUserId: who.userId,
        },
      });
      const result = {
        assignmentRef: row.assignmentRef,
        version: row.version,
        replayed: false,
      };
      await recordCommand(
        tx,
        who,
        command,
        row.assignmentRef,
        row.version,
        result,
        "SURVEY_ASSIGNED",
        { scheduled: true, evaluatorMembershipRef: evaluator.publicRef },
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function actOnSurveyAssignment(
  context,
  assignmentRef,
  input,
  database = prisma,
) {
  const command = normalizeAssignmentAction(input);
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(
        tx,
        context,
        command.operation === "CANCEL_ASSIGNMENT"
          ? PERMS.SURVEY_ASSIGNMENT_MANAGE
          : PERMS.SURVEY_PERFORM,
      );
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const row = await scopedAssignment(
        tx,
        who,
        assignmentRef,
        PERMS.SURVEY_PERFORM,
      );
      if (row.version !== command.expectedVersion)
        surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
      let result;
      let action;
      if (command.operation === "ARRIVAL_RECORD") {
        if (row.arrivalAt || row.status !== "ASSIGNED")
          surveyFail("CRM_SURVEY_STATE_INVALID", 409);
        const updated = await tx.surveyAssignment.update({
          where: { id: row.id },
          data: {
            arrivalAt: new Date(),
            status: "ARRIVED",
            version: { increment: 1 },
          },
        });
        result = {
          assignmentRef,
          status: updated.status,
          arrivalAt: updated.arrivalAt,
          version: updated.version,
        };
        action = "SURVEY_ARRIVAL_RECORDED";
      } else if (command.operation === "PUNCTUALITY_CONFIRM") {
        if (!row.arrivalAt || row.punctualityConfirmedAt)
          surveyFail("CRM_SURVEY_STATE_INVALID", 409);
        const updated = await tx.surveyAssignment.update({
          where: { id: row.id },
          data: {
            punctualityConfirmedAt: new Date(),
            version: { increment: 1 },
          },
        });
        result = {
          assignmentRef,
          status: updated.status,
          punctualityConfirmedAt: updated.punctualityConfirmedAt,
          version: updated.version,
        };
        action = "SURVEY_PUNCTUALITY_CONFIRMED";
      } else if (command.operation === "CANCEL_ASSIGNMENT") {
        if (["COMPLETED", "CANCELLED"].includes(row.status))
          surveyFail("CRM_SURVEY_STATE_INVALID", 409);
        const updated = await tx.surveyAssignment.update({
          where: { id: row.id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        result = {
          assignmentRef,
          status: updated.status,
          version: updated.version,
        };
        action = "SURVEY_ASSIGNMENT_CANCELLED";
      } else {
        if (!["ASSIGNED", "ARRIVED", "IN_PROGRESS"].includes(row.status))
          surveyFail("CRM_SURVEY_STATE_INVALID", 409);
        let draft = await tx.surveyDraft.findFirst({
          where: {
            tenantId: who.tenantId,
            assignmentId: row.id,
            status: { in: ["IN_PROGRESS", "READY_FOR_REVIEW"] },
          },
          orderBy: { revision: "desc" },
        });
        if (!draft) {
          const catalog = await tx.surveyCatalogVersion.findFirst({
            where: { tenantId: who.tenantId, status: "ACTIVE" },
            orderBy: { version: "desc" },
          });
          if (!catalog) surveyFail("CRM_SURVEY_CATALOG_NOT_READY", 409);
          const revision =
            (
              await tx.surveyDraft.aggregate({
                where: { tenantId: who.tenantId, assignmentId: row.id },
                _max: { revision: true },
              })
            )._max.revision || 0;
          draft = await tx.surveyDraft.create({
            data: {
              tenantId: who.tenantId,
              assignmentId: row.id,
              pipelineCaseId: row.pipelineCaseId,
              serviceRevisionId: row.serviceRevisionId,
              catalogVersionId: catalog.id,
              routeVersion: row.routeVersion,
              revision: revision + 1,
            },
          });
        }
        const updated =
          row.status === "IN_PROGRESS"
            ? row
            : await tx.surveyAssignment.update({
                where: { id: row.id },
                data: { status: "IN_PROGRESS", version: { increment: 1 } },
              });
        result = {
          assignmentRef,
          surveyRef: draft.surveyRef,
          status: updated.status,
          version: updated.version,
        };
        action = "SURVEY_STARTED";
      }
      result.replayed = false;
      await recordCommand(
        tx,
        who,
        command,
        assignmentRef,
        result.version,
        result,
        action,
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getSurveyDraft(context, surveyRef, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(
        tx,
        context,
        [PERMS.SURVEY_PERFORM, PERMS.SURVEY_READ],
        { any: true },
      );
      return publicDraft(
        await scopedDraft(
          tx,
          who,
          surveyRef,
          who.effective.has(PERMS.SURVEY_PERFORM)
            ? PERMS.SURVEY_PERFORM
            : PERMS.SURVEY_READ,
        ),
      );
    });
  } catch (error) {
    throw databaseError(error);
  }
}

export async function mutateSurveyDraft(
  context,
  surveyRef,
  input,
  database = prisma,
) {
  const command = normalizeDraftMutation(input);
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SURVEY_PERFORM);
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const draft = await scopedDraft(tx, who, surveyRef);
      if (
        draft.status === "PUBLISHED" ||
        draft.version !== command.expectedDraftVersion
      )
        surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
      let itemRef = null;
      if (command.operation === "UPSERT_ITEM") {
        const article = draft.catalogVersion.articles.find(
          (entry) => entry.articleRef === command.articleRef,
        );
        const area = draft.catalogVersion.areas.find(
          (entry) => entry.areaRef === command.areaRef,
        );
        if (!article || !area) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
        const volume = command.dimensions
          ? (command.dimensions.lengthCm *
              command.dimensions.widthCm *
              command.dimensions.heightCm) /
            1_000_000
          : asNumber(article.defaultVolumeM3);
        const weight = asNumber(article.defaultWeightKg);
        if (command.itemRef) {
          const current = draft.items.find(
            (entry) => entry.itemRef === command.itemRef && !entry.deletedAt,
          );
          if (!current) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
          if (current.version !== command.expectedItemVersion)
            surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
          const updated = await tx.surveyDraftItem.update({
            where: { id: current.id },
            data: {
              catalogItemId: article.id,
              areaCatalogItemId: area.id,
              articleRefSnapshot: article.articleRef,
              articleCodeSnapshot: article.code,
              articleNameSnapshot: article.name,
              areaRefSnapshot: area.areaRef,
              areaCodeSnapshot: area.code,
              areaNameSnapshot: area.name,
              shipmentMode: command.shipmentMode,
              quantity: command.quantity,
              condition: command.condition,
              flags: [...command.flags],
              originalUnit: command.dimensions?.original.unit || null,
              originalDimensions:
                command.dimensions?.original || Prisma.JsonNull,
              lengthCm: command.dimensions?.lengthCm || null,
              widthCm: command.dimensions?.widthCm || null,
              heightCm: command.dimensions?.heightCm || null,
              unitVolumeM3: volume,
              unitWeightKg: weight,
              volumeSource: command.dimensions
                ? "MEASURED"
                : volume == null
                  ? null
                  : "CATALOG",
              weightSource: weight == null ? null : "CATALOG",
              note: command.note,
              version: { increment: 1 },
            },
          });
          itemRef = updated.itemRef;
        } else {
          const next =
            (
              await tx.surveyDraftItem.aggregate({
                where: { tenantId: who.tenantId, draftId: draft.id },
                _max: { sortOrder: true },
              })
            )._max.sortOrder ?? -1;
          const created = await tx.surveyDraftItem.create({
            data: {
              tenantId: who.tenantId,
              draftId: draft.id,
              catalogVersionId: draft.catalogVersionId,
              catalogItemId: article.id,
              areaCatalogItemId: area.id,
              articleRefSnapshot: article.articleRef,
              articleCodeSnapshot: article.code,
              articleNameSnapshot: article.name,
              areaRefSnapshot: area.areaRef,
              areaCodeSnapshot: area.code,
              areaNameSnapshot: area.name,
              shipmentMode: command.shipmentMode,
              quantity: command.quantity,
              condition: command.condition,
              flags: [...command.flags],
              originalUnit: command.dimensions?.original.unit || null,
              originalDimensions:
                command.dimensions?.original || Prisma.JsonNull,
              lengthCm: command.dimensions?.lengthCm || null,
              widthCm: command.dimensions?.widthCm || null,
              heightCm: command.dimensions?.heightCm || null,
              unitVolumeM3: volume,
              unitWeightKg: weight,
              volumeSource: command.dimensions
                ? "MEASURED"
                : volume == null
                  ? null
                  : "CATALOG",
              weightSource: weight == null ? null : "CATALOG",
              note: command.note,
              sortOrder: next + 1,
            },
          });
          itemRef = created.itemRef;
        }
      } else if (command.operation === "DELETE_ITEM") {
        const current = draft.items.find(
          (entry) => entry.itemRef === command.itemRef && !entry.deletedAt,
        );
        if (!current) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
        if (current.version !== command.expectedItemVersion)
          surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
        await tx.surveyDraftItem.update({
          where: { id: current.id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        itemRef = current.itemRef;
      } else if (command.operation === "SAVE_ACCESS") {
        const current = draft.accessObservations.find(
          (entry) => entry.side === command.side,
        );
        if (current && current.version !== command.expectedAccessVersion)
          surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
        const data = {
          floorNumber: command.floorNumber,
          stairsFloors: command.stairsFloors,
          elevatorAvailable: command.elevatorAvailable,
          elevatorFloor: command.elevatorFloor,
          parkingDistanceM: command.parkingDistanceM,
          flags: [...command.flags],
          notes: command.notes,
        };
        if (current)
          await tx.surveyAccessObservation.update({
            where: { id: current.id },
            data: { ...data, version: { increment: 1 } },
          });
        else
          await tx.surveyAccessObservation.create({
            data: {
              tenantId: who.tenantId,
              draftId: draft.id,
              side: command.side,
              ...data,
            },
          });
      } else {
        const damaged = draft.items.filter(
          (entry) =>
            !entry.deletedAt &&
            ["DAMAGED", "PRE_EXISTING_DAMAGE"].includes(entry.condition),
        );
        if (
          damaged.some(
            (item) => !item.photos.some((photo) => photo.purpose === "DAMAGE"),
          )
        )
          surveyFail("CRM_SURVEY_DAMAGE_PHOTO_REQUIRED", 409);
        if (!draft.items.some((entry) => !entry.deletedAt))
          surveyFail("CRM_SURVEY_INVENTORY_REQUIRED", 409);
        await tx.surveyDraft.update({
          where: { id: draft.id },
          data: { status: "READY_FOR_REVIEW", notes: command.notes },
        });
      }
      const updated = await tx.surveyDraft.update({
        where: { id: draft.id },
        data: { version: { increment: 1 } },
        include: draftInclude,
      });
      const result = {
        surveyRef,
        version: updated.version,
        itemRef,
        status: updated.status,
        replayed: false,
      };
      await recordCommand(
        tx,
        who,
        command,
        surveyRef,
        updated.version,
        result,
        command.operation === "MARK_READY"
          ? "SURVEY_READY_FOR_REVIEW"
          : `SURVEY_${command.operation}`,
        { itemChanged: Boolean(itemRef) },
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function uploadSurveyPhoto(
  context,
  surveyRef,
  metadata,
  bytes,
  mimeType,
  database = prisma,
  storage = createLocalSurveyStorage(),
) {
  const command = normalizePhotoCommand({
    ...metadata,
    mimeType,
    sizeBytes: bytes.length,
    sha256: surveyBlobSha256(bytes),
  });
  let stored;
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SURVEY_PERFORM);
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const draft = await scopedDraft(tx, who, surveyRef);
      if (draft.status === "PUBLISHED") surveyFail("CRM_SURVEY_IMMUTABLE", 409);
      const item = command.itemRef
        ? draft.items.find(
            (entry) => entry.itemRef === command.itemRef && !entry.deletedAt,
          )
        : null;
      const access = command.accessRef
        ? draft.accessObservations.find(
            (entry) => entry.accessRef === command.accessRef,
          )
        : null;
      if ((command.itemRef && !item) || (command.accessRef && !access))
        surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      if (
        (command.purpose === "ORIGIN_ACCESS" && access.side !== "ORIGIN") ||
        (command.purpose === "DESTINATION_ACCESS" &&
          access.side !== "DESTINATION")
      )
        surveyFail("CRM_SURVEY_PHOTO_CONTEXT_INVALID", 409);
      stored = await storage.put({
        tenantId: who.tenantId,
        kind: "photo",
        mimeType,
        bytes,
      });
      const blob = await tx.surveyBlobObject.create({
        data: {
          id: randomUUID(),
          tenantId: who.tenantId,
          provider: storage.provider,
          ...stored,
        },
      });
      const photo = await tx.surveyPhoto.create({
        data: {
          tenantId: who.tenantId,
          draftId: draft.id,
          draftItemId: item?.id || null,
          accessId: access?.id || null,
          blobObjectId: blob.id,
          purpose: command.purpose,
        },
      });
      const result = Object.freeze({
        photoRef: photo.photoRef,
        purpose: photo.purpose,
        replayed: false,
      });
      await recordCommand(
        tx,
        who,
        command,
        surveyRef,
        draft.version,
        result,
        "SURVEY_PHOTO_ATTACHED",
        {
          purpose: command.purpose,
          photoRef: photo.photoRef,
          mimeType,
          sizeBytes: bytes.length,
        },
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    if (stored?.storageKey) await storage.remove(stored.storageKey);
    throw databaseError(error);
  }
}

function signatureSnapshot(command) {
  return {
    strokes: command.signatureStrokes,
    signerName: command.signerName,
    relationship: command.relationship,
  };
}
export async function publishSurvey(
  context,
  surveyRef,
  input,
  database = prisma,
  storage = createLocalSurveyStorage(),
) {
  const command = normalizePublish(input);
  const storedKeys = [];
  try {
    return await database.$transaction(async (tx) => {
      await mutationLimits(tx);
      await commandLock(tx, contextText(context?.tenantId), command.requestId);
      const who = await actor(tx, context, PERMS.SURVEY_PUBLISH);
      const replay = await priorCommand(tx, who.tenantId, command);
      if (replay) return replay;
      const draft = await scopedDraft(tx, who, surveyRef, PERMS.SURVEY_PUBLISH);
      if (
        draft.status !== "READY_FOR_REVIEW" ||
        draft.version !== command.expectedDraftVersion
      )
        surveyFail("CRM_SURVEY_VERSION_CONFLICT", 409);
      const items = draft.items.filter((item) => !item.deletedAt);
      if (!items.length) surveyFail("CRM_SURVEY_INVENTORY_REQUIRED", 409);
      if (
        items.some(
          (item) =>
            ["DAMAGED", "PRE_EXISTING_DAMAGE"].includes(item.condition) &&
            !item.photos.some((photo) => photo.purpose === "DAMAGE"),
        )
      )
        surveyFail("CRM_SURVEY_DAMAGE_PHOTO_REQUIRED", 409);
      const origin = draft.accessObservations.find(
        (row) => row.side === "ORIGIN",
      );
      const destination = draft.accessObservations.find(
        (row) => row.side === "DESTINATION",
      );
      if (!origin || !destination)
        surveyFail("CRM_SURVEY_ACCESS_REQUIRED", 409);
      const current = await tx.surveyPublication.findFirst({
        where: {
          tenantId: who.tenantId,
          pipelineCaseId: draft.pipelineCaseId,
          status: "CURRENT",
        },
        orderBy: { revision: "desc" },
      });
      const revision =
        (
          await tx.surveyPublication.aggregate({
            where: {
              tenantId: who.tenantId,
              pipelineCaseId: draft.pipelineCaseId,
            },
            _max: { revision: true },
          })
        )._max.revision || 0;
      const publicationRef = randomUUID();
      const publishedAt = new Date();
      const metricTotals = totals(items);
      const logical = {
        publicationRef,
        revision: revision + 1,
        surveyRef,
        caseRef: draft.pipelineCase.publicRef,
        caseCode: draft.pipelineCase.caseCode,
        clientDisplayName: draft.pipelineCase.client?.displayName || null,
        serviceSelectionRef: draft.serviceRevision.selectionRef,
        catalogVersion: draft.catalogVersion.version,
        routeVersion: draft.routeVersion,
        items: items.map((item) => ({
          articleRef: item.articleRefSnapshot,
          articleCode: item.articleCodeSnapshot,
          articleName: item.articleNameSnapshot,
          areaRef: item.areaRefSnapshot,
          areaCode: item.areaCodeSnapshot,
          areaName: item.areaNameSnapshot,
          shipmentMode: item.shipmentMode,
          quantity: item.quantity,
          condition: item.condition,
          flags: item.flags,
          measurements: item.originalDimensions,
          unitVolumeM3: asNumber(item.unitVolumeM3),
          unitWeightKg: asNumber(item.unitWeightKg),
          metricSources: {
            volume: item.volumeSource,
            weight: item.weightSource,
          },
          note: item.note,
          photoRefs: item.photos.map((photo) => photo.photoRef),
        })),
        access: draft.accessObservations.map((row) => ({
          side: row.side,
          facts: publicAccess(row),
          photoRefs: row.photos.map((photo) => photo.photoRef),
        })),
        totals: metricTotals,
        signature: signatureSnapshot(command),
        publishedAt: publishedAt.toISOString(),
      };
      const logicalSha256 = createHash("sha256")
        .update(canonicalJson(logical), "utf8")
        .digest("hex");
      const signatureBytes = renderSurveySignatureSvg(command.signatureStrokes);
      const signatureStored = await storage.put({
        tenantId: who.tenantId,
        kind: "signature",
        mimeType: "image/svg+xml",
        bytes: signatureBytes,
      });
      storedKeys.push(signatureStored.storageKey);
      const pdfInput = {
        publicationRef,
        caseCode: draft.pipelineCase.caseCode,
        clientDisplayName: draft.pipelineCase.client?.displayName || null,
        serviceDescription: draft.serviceRevision.selectionRef,
        originSummary: String(
          draft.assignment.contextSnapshot?.origin || "No disponible",
        ),
        destinationSummary: String(
          draft.assignment.contextSnapshot?.destination || "No disponible",
        ),
        evaluatorDisplayName: who.userName,
        signerName: command.signerName,
        relationship: command.relationship,
        signatureStrokes: command.signatureStrokes,
        publishedAt: publishedAt.toISOString(),
        totalQuantity: metricTotals.quantity,
        totalVolumeM3: metricTotals.volumeM3,
        totalWeightKg: metricTotals.weightKg,
        items: logical.items.map((item) => ({
          ...item,
          totalVolumeM3: (item.unitVolumeM3 || 0) * item.quantity,
        })),
        access: logical.access.map((row) => ({
          side: row.side,
          summary: JSON.stringify({
            floorNumber: row.facts.floorNumber,
            stairsFloors: row.facts.stairsFloors,
            elevatorAvailable: row.facts.elevatorAvailable,
            flags: row.facts.flags,
          }),
        })),
      };
      const pdf = renderSurveyPublicationPdf(pdfInput);
      const pdfStored = await storage.put({
        tenantId: who.tenantId,
        kind: "publication",
        mimeType: pdf.mimeType,
        bytes: pdf.bytes,
      });
      storedKeys.push(pdfStored.storageKey);
      const signatureBlob = await tx.surveyBlobObject.create({
        data: {
          id: randomUUID(),
          tenantId: who.tenantId,
          provider: storage.provider,
          ...signatureStored,
        },
      });
      const pdfBlob = await tx.surveyBlobObject.create({
        data: {
          id: randomUUID(),
          tenantId: who.tenantId,
          provider: storage.provider,
          ...pdfStored,
        },
      });
      if (current)
        await tx.surveyPublication.update({
          where: { id: current.id },
          data: { status: "SUPERSEDED" },
        });
      const publication = await tx.surveyPublication.create({
        data: {
          id: randomUUID(),
          publicationRef,
          tenantId: who.tenantId,
          draftId: draft.id,
          pipelineCaseId: draft.pipelineCaseId,
          serviceRevisionId: draft.serviceRevisionId,
          revision: revision + 1,
          routeVersion: draft.routeVersion,
          catalogVersion: draft.catalogVersion.version,
          serviceSelectionRef: draft.serviceRevision.selectionRef,
          contextSnapshot: draft.assignment.contextSnapshot,
          totalsSnapshot: metricTotals,
          logicalSha256,
          pdfBlobObjectId: pdfBlob.id,
          pdfSha256: pdf.pdfSha256,
          replacesPublicationId: current?.id || null,
          publishedByMembershipId: who.membershipId,
          publishedByUserId: who.userId,
          publishedAt,
        },
      });
      await tx.surveyPublicationItem.createMany({
        data: logical.items.map((item, position) => ({
          id: randomUUID(),
          tenantId: who.tenantId,
          publicationId: publication.id,
          position,
          ...item,
        })),
      });
      await tx.surveyPublicationAccess.createMany({
        data: logical.access.map((row) => ({
          id: randomUUID(),
          tenantId: who.tenantId,
          publicationId: publication.id,
          side: row.side,
          factsSnapshot: row.facts,
          photoRefs: row.photoRefs,
        })),
      });
      await tx.surveyPublicationSignature.create({
        data: {
          id: randomUUID(),
          tenantId: who.tenantId,
          publicationId: publication.id,
          blobObjectId: signatureBlob.id,
          signerName: command.signerName,
          relationship: command.relationship,
          signedAt: publishedAt,
        },
      });
      await tx.surveyDraft.update({
        where: { id: draft.id },
        data: { status: "PUBLISHED", version: { increment: 1 } },
      });
      await tx.surveyAssignment.update({
        where: { id: draft.assignmentId },
        data: { status: "COMPLETED", version: { increment: 1 } },
      });
      const result = {
        publicationRef,
        surveyRef,
        revision: publication.revision,
        logicalSha256,
        pdfSha256: pdf.pdfSha256,
        publishedAt,
        replayed: false,
      };
      await recordCommand(
        tx,
        who,
        command,
        publicationRef,
        publication.revision,
        result,
        current ? "SURVEY_SUPERSEDED" : "SURVEY_PUBLISHED",
        {
          itemCount: items.length,
          totalQuantity: metricTotals.quantity,
          signed: true,
          pdfGenerated: true,
        },
      );
      return result;
    }, MUTATION_OPTIONS);
  } catch (error) {
    await Promise.allSettled(storedKeys.map((key) => storage.remove(key)));
    throw databaseError(error);
  }
}

export async function getSurveyPublication(
  context,
  publicationRef,
  database = prisma,
) {
  assertPublicSurveyRef(publicationRef);
  try {
    return await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SURVEY_READ);
      const row = await tx.surveyPublication.findFirst({
        where: { tenantId: who.tenantId, publicationRef },
        include: {
          pipelineCase: { include: { client: true } },
          items: { orderBy: { position: "asc" } },
          accessSnapshots: { orderBy: { side: "asc" } },
          signature: true,
        },
      });
      if (!row) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      return Object.freeze({
        publicationRef: row.publicationRef,
        caseRef: row.pipelineCase.publicRef,
        caseCode: row.pipelineCase.caseCode,
        clientDisplayName: row.pipelineCase.client?.displayName || null,
        revision: row.revision,
        status: row.status,
        catalogVersion: row.catalogVersion,
        serviceSelectionRef: row.serviceSelectionRef,
        routeVersion: row.routeVersion,
        totals: row.totalsSnapshot,
        logicalSha256: row.logicalSha256,
        pdfSha256: row.pdfSha256,
        publishedAt: row.publishedAt,
        items: Object.freeze(
          row.items.map((item) => ({
            articleRef: item.articleRef,
            articleCode: item.articleCode,
            articleName: item.articleName,
            areaRef: item.areaRef,
            areaCode: item.areaCode,
            areaName: item.areaName,
            shipmentMode: item.shipmentMode,
            quantity: item.quantity,
            condition: item.condition,
            flags: Object.freeze(item.flags),
            measurements: item.measurements,
            unitVolumeM3: asNumber(item.unitVolumeM3),
            unitWeightKg: asNumber(item.unitWeightKg),
            metricSources: item.metricSources,
            note: item.note,
            photoRefs: Object.freeze(item.photoRefs),
          })),
        ),
        access: Object.freeze(
          row.accessSnapshots.map((item) => ({
            side: item.side,
            facts: item.factsSnapshot,
            photoRefs: Object.freeze(item.photoRefs),
          })),
        ),
        signature: row.signature
          ? {
              signatureRef: row.signature.signatureRef,
              signerName: row.signature.signerName,
              relationship: row.signature.relationship,
              signedAt: row.signature.signedAt,
            }
          : null,
      });
    });
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getSurveyPublicationPdf(
  context,
  publicationRef,
  database = prisma,
  storage = createLocalSurveyStorage(),
) {
  assertPublicSurveyRef(publicationRef);
  try {
    const descriptor = await database.$transaction(async (tx) => {
      const who = await actor(tx, context, PERMS.SURVEY_READ);
      const row = await tx.surveyPublication.findFirst({
        where: { tenantId: who.tenantId, publicationRef },
        include: { pdfBlobObject: true },
      });
      if (!row?.pdfBlobObject || row.pdfBlobObject.status !== "ACTIVE")
        surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
      return {
        storageKey: row.pdfBlobObject.storageKey,
        mimeType: row.pdfBlobObject.mimeType,
        sizeBytes: row.pdfBlobObject.sizeBytes,
        sha256: row.pdfSha256,
      };
    });
    const bytes = await storage.get(descriptor.storageKey);
    if (
      bytes.length !== descriptor.sizeBytes ||
      surveyBlobSha256(bytes) !== descriptor.sha256
    )
      surveyFail("CRM_SURVEY_BLOB_INTEGRITY_FAILED", 503);
    return Object.freeze({
      bytes,
      mimeType: descriptor.mimeType,
      sha256: descriptor.sha256,
    });
  } catch (error) {
    throw databaseError(error);
  }
}
