import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import {
  CrmIcpV2Error,
  buildCrmIcpClientSearchPlan,
  buildCrmIcpV2AtomicPlan,
  normalizeCrmIcpV2CreateInput,
  toCrmIcpClientSearchResult,
} from "./crmIcpV2Domain.js";
import { PERMS, permsForRole } from "./rbac.js";

const PUBLIC_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ICP_SOURCE = "CRM_ICP_V2_API_05B1";
const ALLOWED_ROLES = new Set(["A", "V"]);

const LEGACY_CUSTOMER_TYPE = Object.freeze({
  INDIVIDUAL: "L4_PERSONAL",
  CORPORATE: "L3_CORPORATE",
  LEAD_ACCOUNT: "L1_AGENT",
  COMMERCIAL: "L3_CORPORATE",
  DIPLOMATIC: "L2_INTL_DIRECT",
});

export class CrmIcpV2ApiError extends CrmIcpV2Error {
  constructor(code, status = 400, safeData = null, options = {}) {
    super(code, status);
    this.name = "CrmIcpV2ApiError";
    this.safeData = safeData;
    if (options.cause) this.cause = options.cause;
  }
}

function fail(code, status, safeData = null) {
  throw new CrmIcpV2ApiError(code, status, safeData);
}

function contextText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 191) {
    fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  }
  return value;
}

function caseRef(value) {
  if (typeof value !== "string" || !PUBLIC_REF.test(value)) {
    fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  }
  return value;
}

function upper(value) {
  return String(value || "").toUpperCase();
}

function effectivePermissions(role, granted, denied) {
  const blocked = new Set((Array.isArray(denied) ? denied : []).map(String));
  return new Set([
    ...permsForRole(role),
    ...(Array.isArray(granted) ? granted.map(String) : []),
  ].filter((permission) => !blocked.has(permission)));
}

async function resolveActor(database, context, permission) {
  const tenantId = contextText(context?.tenantId);
  const membershipId = contextText(context?.membershipId);
  const userId = contextText(context?.userId);
  const rows = await database.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",
      m."status"::text AS "membership_status",m."granted_permissions",m."denied_permissions",
      u."status" AS "user_status",u."name",t."status"::text AS "tenant_status",t."country_code"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR KEY SHARE OF m
  `);
  const row = rows[0];
  if (!row) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const role = upper(row.role);
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = effectivePermissions(role, row.granted_permissions, row.denied_permissions);
  if (upper(row.user_status) !== "ACTIVE" || upper(row.membership_status) !== "ACTIVE"
    || upper(row.tenant_status) !== "ACTIVE" || !ALLOWED_ROLES.has(role)
    || denied.has(permission) || !effective.has(permission)) {
    fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  }
  return Object.freeze({
    tenantId,
    membershipId: String(row.id),
    userId: String(row.user_id),
    role,
    name: String(row.name || "Usuario"),
    tenantCountryCode: row.country_code == null ? null : String(row.country_code),
    grantedPermissions: Object.freeze([...effective]),
    deniedPermissions: Object.freeze([...denied]),
    pendingDestinationAuthorized: effective.has(PERMS.PIPELINE_CREATE_PENDING_DESTINATION)
      && !denied.has(PERMS.PIPELINE_CREATE_PENDING_DESTINATION),
  });
}

async function setTransactionLimits(tx) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '250ms'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
}

async function lockRequest(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${`CRM-ICP-05B1:${tenantId}:${requestId}`},0)) AS "ok"
  `);
  if (rows[0]?.ok !== true) fail("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409);
}

async function resolveClient(tx, actor, commandClient) {
  if (commandClient.kind === "INLINE") return null;
  const client = await tx.client.findFirst({
    where: { tenantId: actor.tenantId, publicRef: commandClient.clientRef },
    select: { id: true, publicRef: true, name: true, type: true, status: true },
  });
  if (!client) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return client;
}

function addressSelections(route) {
  return [route.origin, route.destination, ...route.additionalStops.map((item) => item.selection)].filter(Boolean);
}

async function resolveClientAddresses(tx, actor, clientId, route) {
  const refs = [...new Set(addressSelections(route)
    .filter((selection) => selection.kind === "CLIENT_ADDRESS")
    .map((selection) => selection.addressRef))];
  if (refs.length === 0) return new Map();
  const rows = await tx.clientAddress.findMany({
    where: { tenantId: actor.tenantId, clientId, addressRef: { in: refs } },
    select: {
      addressRef: true,
      status: true,
      countryCode: true,
      provinceState: true,
      cityMunicipality: true,
      sector: true,
      streetAndNumber: true,
      buildingResidential: true,
      floorUnit: true,
      arrivalReference: true,
      locationContactName: true,
      locationContactPhone: true,
    },
  });
  return new Map(rows.map((row) => [row.addressRef, Object.freeze({
    addressRef: row.addressRef,
    tenantMatched: true,
    active: row.status === "ACTIVE",
    address: Object.freeze({
      countryCode: row.countryCode,
      provinceState: row.provinceState,
      cityMunicipality: row.cityMunicipality,
      sector: row.sector,
      streetAndNumber: row.streetAndNumber,
      buildingResidential: row.buildingResidential,
      floorUnit: row.floorUnit,
      arrivalReference: row.arrivalReference,
      locationContactName: row.locationContactName,
      locationContactPhone: row.locationContactPhone,
    }),
  })]));
}

function duplicateFingerprint(tenantId, client, candidates) {
  if (candidates.length === 0) return null;
  const material = JSON.stringify({
    tenantId,
    candidateRefs: candidates.map((candidate) => candidate.publicRef).sort(),
    name: client.displayName.toLocaleLowerCase("en-US"),
    taxId: client.taxId?.normalized || null,
    phone: client.phoneNormalized,
    email: client.emailNormalized,
  });
  return createHash("sha256").update(material, "utf8").digest("hex");
}

async function assessInlineDuplicate(tx, actor, client) {
  if (client.kind !== "INLINE") {
    return Object.freeze({ exactTaxId: false, exactPhoneEmail: false, partialMatch: false, matchFingerprint: null });
  }
  const partialOr = [
    { name: { equals: client.displayName, mode: "insensitive" } },
    { normalizedPhone: client.phoneNormalized },
  ];
  if (client.emailNormalized) partialOr.push({ normalizedEmail: client.emailNormalized });
  if (client.taxId?.normalized) partialOr.push({ taxIdNormalized: client.taxId.normalized });
  const candidates = await tx.client.findMany({
    where: { tenantId: actor.tenantId, OR: partialOr },
    select: {
      publicRef: true,
      normalizedPhone: true,
      normalizedEmail: true,
      taxIdNormalized: true,
    },
    take: 101,
  });
  if (candidates.length > 100) fail("CRM_ICP_DUPLICATE_ASSESSMENT_UNAVAILABLE", 503);
  const exactTaxId = Boolean(client.taxId?.normalized
    && candidates.some((candidate) => candidate.taxIdNormalized === client.taxId.normalized));
  const exactPhoneEmail = Boolean(client.emailNormalized && candidates.some((candidate) =>
    candidate.normalizedPhone === client.phoneNormalized
      && candidate.normalizedEmail === client.emailNormalized));
  const fingerprint = duplicateFingerprint(actor.tenantId, client, candidates);
  return Object.freeze({
    exactTaxId,
    exactPhoneEmail,
    partialMatch: candidates.length > 0,
    matchFingerprint: fingerprint,
  });
}

async function createInlineClient(tx, actor, client, profileType) {
  const codes = await tx.$queryRaw(Prisma.sql`SELECT "osi"."next_icp_client_code"() AS "code"`);
  const code = String(codes[0]?.code || "");
  if (!code) fail("CRM_ICP_CLIENT_CODE_UNAVAILABLE", 503);
  return tx.client.create({
    data: {
      tenantId: actor.tenantId,
      code,
      name: client.displayName,
      email: client.email || "",
      phone: client.phone,
      address: "",
      type: profileType,
      status: "ACTIVE",
      totalServices: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      taxId: client.taxId?.display || null,
      taxIdNormalized: client.taxId?.normalized || null,
      normalizedPhone: client.phoneNormalized,
      normalizedEmail: client.emailNormalized,
    },
    select: { id: true, publicRef: true, name: true, type: true, status: true },
  });
}

function addressData(snapshot) {
  return {
    countryCode: snapshot.countryCode,
    provinceState: snapshot.provinceState,
    cityMunicipality: snapshot.cityMunicipality,
    sector: snapshot.sector,
    streetAndNumber: snapshot.streetAndNumber,
    buildingResidential: snapshot.buildingResidential,
    floorUnit: snapshot.floorUnit,
    arrivalReference: snapshot.arrivalReference,
    locationContactName: snapshot.locationContactName,
    locationContactPhone: snapshot.locationContactPhone,
  };
}

async function saveReusableAddresses(tx, actor, client, snapshots) {
  for (const snapshot of snapshots.filter((item) => item.saveForClient)) {
    await tx.clientAddress.create({
      data: {
        tenantId: actor.tenantId,
        clientId: client.id,
        label: snapshot.label,
        status: "ACTIVE",
        ...addressData(snapshot),
      },
      select: { addressRef: true },
    });
  }
}

function legacyCustomerType(profileType) {
  const value = LEGACY_CUSTOMER_TYPE[profileType];
  if (!value) fail("CRM_ICP_INPUT_INVALID", 400);
  return value;
}

function newCaseCode() {
  return `CS-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").toUpperCase()}`;
}

async function insertCommand(tx, actor, pipelineCase, command, owner) {
  await tx.pipelineCaseCommand.create({
    data: {
      tenantId: actor.tenantId,
      pipelineCaseId: pipelineCase.id,
      requestId: command.requestId,
      commandType: "CREATE",
      payloadHash: command.payloadHash,
      expectedVersion: 0,
      resultingVersion: 1,
      previousStatus: "NEW_INBOX",
      resultingStatus: "NEW_INBOX",
      previousOwnerMembershipId: null,
      previousOwnerUserId: null,
      resultingOwnerMembershipId: owner.membershipId,
      resultingOwnerUserId: owner.userId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      reasonCode: null,
      evidenceType: null,
      evidenceId: null,
    },
    select: { id: true },
  });
}

function publicAddress(row) {
  return Object.freeze({
    role: row.role,
    stopOrder: row.stopOrder,
    sourceAddressRef: row.sourceAddressRef,
    countryCode: row.countryCode,
    provinceState: row.provinceState,
    cityMunicipality: row.cityMunicipality,
    sector: row.sector,
    streetAndNumber: row.streetAndNumber,
    buildingResidential: row.buildingResidential,
    floorUnit: row.floorUnit,
    arrivalReference: row.arrivalReference,
    locationContactName: row.locationContactName,
    locationContactPhone: row.locationContactPhone,
  });
}

async function readCaseForActor(database, actor, ref) {
  const where = {
    tenantId: actor.tenantId,
    publicRef: ref,
    routeContractVersion: 2,
    ...(actor.role === "V" ? { ownerMembershipId: actor.membershipId, ownerUserId: actor.userId } : {}),
  };
  const item = await database.pipelineCase.findFirst({
    where,
    select: {
      id: true,
      publicRef: true,
      caseCode: true,
      status: true,
      version: true,
      mode: true,
      serviceType: true,
      requiresSurvey: true,
      surveyMethod: true,
      caseContactName: true,
      caseContactPhone: true,
      caseContactEmail: true,
      intakeChannel: true,
      clientProfileType: true,
      routeContractVersion: true,
      routeRevision: true,
      destinationStatus: true,
      ownerName: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { publicRef: true, name: true, type: true, status: true } },
    },
  });
  if (!item) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const snapshots = await database.pipelineCaseRouteSnapshot.findMany({
    where: { tenantId: actor.tenantId, pipelineCaseId: item.id, routeVersion: item.routeRevision },
    orderBy: [{ role: "asc" }, { stopOrder: "asc" }],
    select: {
      role: true,
      stopOrder: true,
      sourceAddressRef: true,
      countryCode: true,
      provinceState: true,
      cityMunicipality: true,
      sector: true,
      streetAndNumber: true,
      buildingResidential: true,
      floorUnit: true,
      arrivalReference: true,
      locationContactName: true,
      locationContactPhone: true,
    },
  });
  const origin = snapshots.find((row) => row.role === "ORIGIN");
  const destination = snapshots.find((row) => row.role === "DESTINATION");
  if (!origin || (item.destinationStatus !== "PENDING" && !destination)) {
    fail("CRM_ICP_STATE_CONFLICT", 409);
  }
  return Object.freeze({
    caseRef: item.publicRef,
    caseCode: item.caseCode,
    status: item.status,
    version: item.version,
    mode: item.mode,
    serviceType: item.serviceType,
    volume: Object.freeze({ status: "PENDING_SOURCE", estimatedCbm: null, source: null }),
    requiresSurvey: item.requiresSurvey,
    surveyMethod: item.surveyMethod,
    intakeChannel: item.intakeChannel,
    clientProfileType: item.clientProfileType,
    ownerName: item.ownerName,
    caseContact: Object.freeze({
      displayName: item.caseContactName,
      phone: item.caseContactPhone,
      email: item.caseContactEmail,
    }),
    client: item.client ? Object.freeze({
      clientRef: item.client.publicRef,
      displayName: item.client.name,
      type: item.client.type,
      status: item.client.status,
    }) : null,
    route: Object.freeze({
      contractVersion: item.routeContractVersion,
      revision: item.routeRevision,
      destinationStatus: item.destinationStatus,
      origin: publicAddress(origin),
      destination: destination ? publicAddress(destination) : null,
      additionalStops: Object.freeze(snapshots.filter((row) => row.role === "ADDITIONAL_STOP").map(publicAddress)),
    }),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

async function replayCreate(tx, actor, command) {
  const prior = await tx.pipelineCaseCommand.findFirst({
    where: { tenantId: actor.tenantId, requestId: command.requestId },
    select: {
      commandType: true,
      payloadHash: true,
      actorMembershipId: true,
      actorUserId: true,
      pipelineCase: { select: { publicRef: true } },
    },
  });
  if (!prior) return null;
  if (prior.commandType !== "CREATE" || prior.payloadHash !== command.payloadHash
    || prior.actorMembershipId !== actor.membershipId || prior.actorUserId !== actor.userId) {
    fail("CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409);
  }
  return Object.freeze({
    case: await readCaseForActor(tx, actor, prior.pipelineCase.publicRef),
    replayed: true,
  });
}

function mapDatabaseError(error) {
  if (error instanceof CrmIcpV2Error) return error;
  const code = [error?.meta?.code, error?.cause?.code, error?.code].find((value) => typeof value === "string");
  if (["P2002", "23505"].includes(code)) return new CrmIcpV2ApiError("CRM_ICP_CLIENT_DUPLICATE", 409);
  if (["P2003", "P2025", "23503", "23514"].includes(code)) return new CrmIcpV2ApiError("CRM_ICP_STATE_CONFLICT", 409);
  if (["55P03", "57014"].includes(code)) return new CrmIcpV2ApiError("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409);
  return new CrmIcpV2ApiError("CRM_ICP_DATABASE_UNAVAILABLE", 503, null, { cause: error });
}

export async function createCrmIcpV2Case(context, input, database = prisma) {
  const command = normalizeCrmIcpV2CreateInput(input);
  try {
    return await database.$transaction(async (tx) => {
      await setTransactionLimits(tx);
      const tenantId = contextText(context?.tenantId);
      await lockRequest(tx, tenantId, command.requestId);
      const actor = await resolveActor(tx, context, PERMS.PIPELINE_CREATE);
      const replay = await replayCreate(tx, actor, command);
      if (replay) return replay;

      let client = await resolveClient(tx, actor, command.client);
      const duplicateAssessment = await assessInlineDuplicate(tx, actor, command.client);
      const addressMap = client
        ? await resolveClientAddresses(tx, actor, client.id, command.route)
        : new Map();
      let plan;
      try {
        plan = buildCrmIcpV2AtomicPlan(command, {
          tenantCountryCode: actor.tenantCountryCode,
          pendingDestinationAuthorized: actor.pendingDestinationAuthorized,
          resolveClient: (ref) => client?.publicRef === ref,
          resolveAddress: (ref) => addressMap.get(ref) || null,
          duplicateAssessment,
        });
      } catch (error) {
        if (error?.code === "CRM_ICP_CLIENT_DUPLICATE_CONFIRMATION_REQUIRED"
          && /^[0-9a-f]{64}$/.test(String(duplicateAssessment.matchFingerprint || ""))) {
          fail(error.code, error.status, { matchFingerprint: duplicateAssessment.matchFingerprint });
        }
        throw error;
      }

      if (!client) client = await createInlineClient(tx, actor, command.client, command.clientProfileType);
      await saveReusableAddresses(tx, actor, client, plan.snapshots);
      const owner = actor.role === "V"
        ? Object.freeze({ membershipId: actor.membershipId, userId: actor.userId })
        : Object.freeze({ membershipId: null, userId: null });
      const pipelineCase = await tx.pipelineCase.create({
        data: {
          tenantId: actor.tenantId,
          clientId: client.id,
          caseCode: newCaseCode(),
          clientName: null,
          mode: command.mode,
          serviceType: command.serviceType,
          customerType: legacyCustomerType(command.clientProfileType),
          status: "NEW_INBOX",
          version: 1,
          ownerId: owner.userId,
          ownerMembershipId: owner.membershipId,
          ownerUserId: owner.userId,
          ownerName: actor.role === "V" ? actor.name : "Sin asignar",
          estimatedCbm: 0,
          requiresSurvey: command.requiresSurvey,
          surveyMethod: command.surveyMethod,
          originLocation: "ICP_V2_STRUCTURED_ROUTE",
          destinationLocation: command.route.destinationStatus === "PENDING" ? "PENDING" : "ICP_V2_STRUCTURED_ROUTE",
          destinationContracted: command.route.destinationStatus !== "PENDING",
          caseContactName: command.caseContact.displayName,
          caseContactPhone: command.caseContact.phone,
          caseContactPhoneNormalized: command.caseContact.phoneNormalized,
          caseContactEmail: command.caseContact.email,
          caseContactEmailNormalized: command.caseContact.emailNormalized,
          intakeChannel: command.intakeChannel,
          clientProfileType: command.clientProfileType,
          routeContractVersion: 1,
          routeRevision: 0,
          destinationStatus: null,
        },
        select: { id: true, publicRef: true },
      });
      await tx.pipelineCaseRouteSnapshot.createMany({
        data: plan.snapshots.map((snapshot) => ({
          tenantId: actor.tenantId,
          pipelineCaseId: pipelineCase.id,
          routeVersion: plan.nextRouteRevision,
          role: snapshot.role,
          stopOrder: snapshot.stopOrder,
          sourceAddressRef: snapshot.sourceAddressRef,
          ...addressData(snapshot),
        })),
      });
      const promoted = await tx.pipelineCase.updateMany({
        where: { id: pipelineCase.id, tenantId: actor.tenantId, routeContractVersion: 1, routeRevision: 0 },
        data: { routeContractVersion: 2, routeRevision: plan.nextRouteRevision, destinationStatus: command.route.destinationStatus },
      });
      if (promoted.count !== 1) fail("CRM_ICP_STATE_CONFLICT", 409);
      await insertCommand(tx, actor, pipelineCase, command, owner);
      await appendCommercialAudit(tx, {
        tenantId: actor.tenantId,
        actorKind: "MEMBERSHIP",
        actorMembershipId: actor.membershipId,
      }, {
        source: ICP_SOURCE,
        action: plan.audit.action,
        entity: "PIPELINE_CASE",
        entityId: pipelineCase.id,
        requestId: command.requestId,
        correlationId: command.requestId,
        beforeJson: null,
        afterJson: { version: 1, routeContractVersion: 2, routeRevision: 1, destinationStatus: command.route.destinationStatus },
        metadataJson: plan.audit,
      });
      return Object.freeze({
        case: await readCaseForActor(tx, actor, pipelineCase.publicRef),
        replayed: false,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 12_000 });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

function searchWhere(tenantId, query) {
  const tax = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const phone = query.replace(/[^0-9+]/g, "");
  const email = query.toLowerCase();
  const matches = [{ name: { contains: query, mode: "insensitive" } }];
  if (tax.length >= 2) matches.push({ taxIdNormalized: { contains: tax } });
  if (phone.length >= 2) matches.push({ normalizedPhone: { contains: phone } });
  if (email.length >= 2) matches.push({ normalizedEmail: { contains: email, mode: "insensitive" } });
  return { tenantId, OR: matches };
}

export async function searchCrmIcpClients(context, input, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const actor = await resolveActor(tx, context, PERMS.PIPELINE_VIEW);
      const plan = buildCrmIcpClientSearchPlan(input, {
        tenantId: actor.tenantId,
        userActive: true,
        membershipActive: true,
        tenantActive: true,
        role: actor.role,
        grantedPermissions: actor.grantedPermissions,
        deniedPermissions: actor.deniedPermissions,
      });
      const where = searchWhere(actor.tenantId, plan.query);
      const [total, rows] = await Promise.all([
        tx.client.count({ where }),
        tx.client.findMany({
          where,
          orderBy: [{ name: "asc" }, { publicRef: "asc" }],
          skip: plan.skip,
          take: plan.take,
          select: { publicRef: true, name: true, type: true, status: true, taxId: true, phone: true, email: true },
        }),
      ]);
      return Object.freeze({
        total,
        page: Math.floor(plan.skip / plan.take) + 1,
        pageSize: plan.take,
        data: Object.freeze(rows.map((row) => toCrmIcpClientSearchResult({
          publicRef: row.publicRef,
          displayName: row.name,
          type: row.type,
          status: row.status,
          taxId: row.taxId,
          phone: row.phone,
          email: row.email,
        }))),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 5_000 });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function findCrmIcpV2Case(context, ref, database = prisma) {
  try {
    return await database.$transaction(async (tx) => {
      const actor = await resolveActor(tx, context, PERMS.PIPELINE_VIEW);
      return readCaseForActor(tx, actor, caseRef(ref));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 5_000 });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export const CRM_ICP_V2_API_SOURCE = ICP_SOURCE;
export const CRM_ICP_V2_PENDING_DESTINATION_PERMISSION = PERMS.PIPELINE_CREATE_PENDING_DESTINATION;
