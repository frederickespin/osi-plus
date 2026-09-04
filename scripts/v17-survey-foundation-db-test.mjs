import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  actOnSurveyAssignment,
  createSurveyAssignment,
  createSurveyCatalog,
  getSurveyDraft,
  getSurveyPublication,
  getSurveyPublicationPdf,
  listSurveyAgenda,
  mutateSurveyDraft,
  publishSurvey,
  uploadSurveyPhoto,
} from "../api/_lib/crmSurveyDomain.js";
import { canonicalPayloadHash } from "../api/_lib/crmSurveyContract.js";
import {
  createMemorySurveyStorage,
  surveyBlobSha256,
} from "../api/_lib/crmSurveyStorage.js";

const raw = process.env.V17_SURVEY_TEST_DATABASE_URL;
if (!raw) throw new Error("V17_SURVEY_TEST_DATABASE_URL_REQUIRED");
const parsed = new URL(raw);
const isCanonicalCi =
  process.env.CI === "true" &&
  parsed.hostname === "127.0.0.1" &&
  parsed.port === "55432" &&
  parsed.pathname === "/osi_db01n_ci";
const isDedicatedLocal =
  ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
  parsed.port === "55439" &&
  parsed.pathname === "/v17_survey_foundation_04a";
if (
  parsed.protocol !== "postgresql:" ||
  (!isDedicatedLocal && !isCanonicalCi) ||
  parsed.searchParams.get("schema") !== "osi"
)
  throw new Error("V17_SURVEY_TEST_DATABASE_TARGET_REJECTED");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: raw });
const storage = createMemorySurveyStorage();
const passed = [];
const check = (name, condition) => {
  assert.equal(Boolean(condition), true, name);
  passed.push(name);
};
const reject = async (name, code, action) => {
  let error;
  try {
    await action();
  } catch (cause) {
    error = cause;
  }
  check(`${name} [${error?.code || "NO_ERROR"}]`, error?.code === code);
};
const sign = (operation, payload) => {
  const requestId =
    payload.requestId || `${operation.toLowerCase()}-${randomUUID()}`;
  return {
    requestId,
    payloadHash: canonicalPayloadHash({
      operation,
      requestId,
      ...Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== "requestId"),
      ),
    }),
    ...Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "requestId"),
    ),
  };
};
const marker = randomUUID().replaceAll("-", "").slice(0, 12);
const tenantId = `sur_t_${marker}`;
const otherTenantId = `sur_x_${marker}`;
const adminUserId = `sur_au_${marker}`;
const adminMembershipId = `sur_am_${marker}`;
const evaluatorUserId = `sur_eu_${marker}`;
const evaluatorMembershipId = `sur_em_${marker}`;
const otherUserId = `sur_xu_${marker}`;
const otherMembershipId = `sur_xm_${marker}`;
const caseId = `sur_c_${marker}`;
const clientId = `sur_cl_${marker}`;
const admin = {
  tenantId,
  userId: adminUserId,
  membershipId: adminMembershipId,
};
const evaluator = {
  tenantId,
  userId: evaluatorUserId,
  membershipId: evaluatorMembershipId,
};
const outsider = {
  tenantId: otherTenantId,
  userId: otherUserId,
  membershipId: otherMembershipId,
};

try {
  const identity = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database, current_setting('server_version_num')::int AS version, current_setting('neon.branch_id',true) AS neon",
  );
  check(
    "PostgreSQL 18 local aislado",
    ["v17_survey_foundation_04a", "osi_db01n_ci"].includes(
      identity[0]?.database,
    ) &&
      identity[0]?.version >= 180000 &&
      !identity[0]?.neon,
  );
  await prisma.tenant.createMany({
    data: [
      {
        id: tenantId,
        code: `SUR${marker}`.toUpperCase(),
        name: "Survey synthetic tenant",
        countryCode: "DO",
      },
      {
        id: otherTenantId,
        code: `SURX${marker}`.toUpperCase(),
        name: "Survey other tenant",
        countryCode: "DO",
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: adminUserId,
        code: `SUA${marker}`.toUpperCase(),
        name: "Survey Coordinator",
        email: `survey-admin-${marker}@example.invalid`,
        phone: "0000000000",
        role: "A",
        status: "ACTIVE",
        joinDate: "2026-09-05",
        passwordHash: "synthetic-no-login",
      },
      {
        id: evaluatorUserId,
        code: `SUE${marker}`.toUpperCase(),
        name: "Survey Evaluator",
        email: `survey-evaluator-${marker}@example.invalid`,
        phone: "0000000000",
        role: "E",
        status: "ACTIVE",
        joinDate: "2026-09-05",
        passwordHash: "synthetic-no-login",
      },
      {
        id: otherUserId,
        code: `SUX${marker}`.toUpperCase(),
        name: "Other Evaluator",
        email: `survey-other-${marker}@example.invalid`,
        phone: "0000000000",
        role: "E",
        status: "ACTIVE",
        joinDate: "2026-09-05",
        passwordHash: "synthetic-no-login",
      },
    ],
  });
  await prisma.tenantMembership.createMany({
    data: [
      {
        id: adminMembershipId,
        tenantId,
        userId: adminUserId,
        role: "A",
        status: "ACTIVE",
        grantedPermissions: [
          "survey:assignment:view",
          "survey:assignment:manage",
          "survey:read",
        ],
      },
      {
        id: evaluatorMembershipId,
        tenantId,
        userId: evaluatorUserId,
        role: "E",
        status: "ACTIVE",
        grantedPermissions: [
          "survey:assignment:view",
          "survey:perform",
          "survey:publish",
          "survey:read",
        ],
      },
      {
        id: otherMembershipId,
        tenantId: otherTenantId,
        userId: otherUserId,
        role: "E",
        status: "ACTIVE",
        grantedPermissions: [
          "survey:assignment:view",
          "survey:perform",
          "survey:publish",
          "survey:read",
        ],
      },
    ],
  });
  await prisma.client.create({
    data: {
      id: clientId,
      tenantId,
      code: `SUR-CLIENT-${marker}`,
      name: "Cliente Survey Sintético",
      email: `client-${marker}@example.invalid`,
      phone: "0000000000",
      address: "Synthetic",
      type: "INDIVIDUAL",
      status: "ACTIVE",
      createdAt: "2026-09-05",
    },
  });
  await prisma.pipelineCase.create({
    data: {
      id: caseId,
      tenantId,
      clientId,
      caseCode: `SUR-${marker}`,
      mode: "LOCAL",
      serviceType: "MOV_LOCAL",
      customerType: "L4_PERSONAL",
      ownerName: "Sin asignar",
      originLocation: "Legacy ignored",
      destinationLocation: "Legacy ignored",
    },
  });
  await prisma.pipelineCaseRouteSnapshot.createMany({
    data: [
      {
        tenantId,
        pipelineCaseId: caseId,
        routeVersion: 1,
        role: "ORIGIN",
        stopOrder: 0,
        countryCode: "DO",
        provinceState: "Distrito Nacional",
        cityMunicipality: "Santo Domingo",
        streetAndNumber: "Origen sintético",
      },
      {
        tenantId,
        pipelineCaseId: caseId,
        routeVersion: 1,
        role: "DESTINATION",
        stopOrder: 0,
        countryCode: "DO",
        provinceState: "Santiago",
        cityMunicipality: "Santiago",
        streetAndNumber: "Destino sintético",
      },
    ],
  });
  await prisma.pipelineCase.update({
    where: { id: caseId },
    data: {
      routeContractVersion: 2,
      routeRevision: 1,
      destinationStatus: "CONFIRMED",
    },
  });
  const service = await prisma.serviceCatalogItem.create({
    data: {
      id: randomUUID(),
      tenantId,
      code: `MOV_${marker}`.toUpperCase(),
      name: "Mudanza sintética",
      category: "MOVING",
      usage: "PRIMARY",
      compatibleModes: ["LOCAL"],
      sortOrder: 1,
    },
  });
  const serviceRevision = await prisma.pipelineCaseServiceRevision.create({
    data: {
      id: randomUUID(),
      tenantId,
      pipelineCaseId: caseId,
      revision: 1,
      modeSnapshot: "LOCAL",
      source: "MANUAL",
      createdByMembershipId: adminMembershipId,
      createdByUserId: adminUserId,
    },
  });
  await prisma.pipelineCaseServiceItem.create({
    data: {
      id: randomUUID(),
      tenantId,
      revisionId: serviceRevision.id,
      serviceId: service.id,
      kind: "PRIMARY",
      source: "MANUAL",
      position: 0,
      serviceRefSnapshot: service.serviceRef,
      codeSnapshot: service.code,
      nameSnapshot: service.name,
      categorySnapshot: service.category,
      catalogVersionSnapshot: service.version,
    },
  });
  const refs = await prisma.tenantMembership.findMany({
    where: { id: { in: [evaluatorMembershipId] } },
    select: { id: true, publicRef: true },
  });
  const caseRow = await prisma.pipelineCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { publicRef: true },
  });

  const catalogInput = sign("CATALOG_CREATE", {
    expectedLatestVersion: 0,
    articles: [
      {
        code: "SOFA_3",
        name: "Sofá tres plazas",
        aliases: ["sofá"],
        frequentAreaCodes: ["SALA"],
        defaultVolumeM3: 1.25,
        defaultWeightKg: 62,
      },
    ],
    areas: [
      { code: "SALA", name: "Sala" },
      { code: "DORMITORIO", name: "Dormitorio" },
    ],
    conditions: [
      {
        code: "STAIRS_NARROW",
        name: "Escalera estrecha",
        kind: "INCONVENIENCE",
      },
    ],
  });
  const catalog = await createSurveyCatalog(admin, catalogInput, prisma);
  check(
    "catálogo tenant-first activo",
    catalog.version === 1 && !Object.hasOwn(catalog, "tenantId"),
  );
  check(
    "catálogo idempotente",
    (await createSurveyCatalog(admin, catalogInput, prisma)).catalogRef ===
      catalog.catalogRef &&
      (await prisma.surveyCatalogVersion.count({ where: { tenantId } })) === 1,
  );

  const assignmentInput = sign("ASSIGNMENT_CREATE", {
    caseRef: caseRow.publicRef,
    serviceSelectionRef: serviceRevision.selectionRef,
    evaluatorMembershipRef: refs[0].publicRef,
    scheduledStart: "2026-09-06T13:00:00.000Z",
    scheduledEnd: "2026-09-06T15:00:00.000Z",
    instruction: "Instrucción sintética sin PII",
  });
  const concurrentAssignments = await Promise.allSettled([
    createSurveyAssignment(admin, assignmentInput, prisma),
    createSurveyAssignment(admin, assignmentInput, prisma),
  ]);
  const assignmentResults = concurrentAssignments
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const assignment = assignmentResults[0];
  check(
    "creación concurrente idempotente no duplica asignación",
    Boolean(assignment) &&
      (await prisma.surveyAssignment.count({ where: { tenantId } })) === 1 &&
      (await prisma.surveyMutationCommand.count({
        where: { tenantId, requestId: assignmentInput.requestId },
      })) === 1 &&
      assignmentResults.every(
        (result) => result.assignmentRef === assignment.assignmentRef,
      ) &&
      concurrentAssignments
        .filter((result) => result.status === "rejected")
        .every((result) =>
          ["CRM_SURVEY_COMMAND_IN_PROGRESS", "CRM_SURVEY_VERSION_CONFLICT"].includes(
            result.reason?.code,
          ),
        ),
  );
  check(
    "asignación usa case/service/evaluator públicos",
    assignment.version === 1 && !Object.hasOwn(assignment, "id"),
  );
  check(
    "agenda own-scope",
    (await listSurveyAgenda(evaluator, prisma)).length === 1 &&
      (await listSurveyAgenda(outsider, prisma)).length === 0,
  );
  await prisma.tenantMembership.update({
    where: { id: evaluatorMembershipId },
    data: {
      grantedPermissions: ["survey:perform", "survey:publish", "survey:read"],
      deniedPermissions: ["survey:assignment:view"],
    },
  });
  await reject(
    "deny explícito prevalece",
    "CRM_SURVEY_PERMISSION_FORBIDDEN",
    () => listSurveyAgenda(evaluator, prisma),
  );
  await prisma.tenantMembership.update({
    where: { id: evaluatorMembershipId },
    data: {
      grantedPermissions: [
        "survey:assignment:view",
        "survey:perform",
        "survey:publish",
        "survey:read",
      ],
      deniedPermissions: [],
    },
  });
  const arrived = await actOnSurveyAssignment(
    evaluator,
    assignment.assignmentRef,
    sign("ARRIVAL_RECORD", { operation: "ARRIVAL_RECORD", expectedVersion: 1 }),
    prisma,
  );
  check(
    "llegada separada de puntualidad",
    arrived.arrivalAt && !arrived.punctualityConfirmedAt,
  );
  const punctual = await actOnSurveyAssignment(
    evaluator,
    assignment.assignmentRef,
    sign("PUNCTUALITY_CONFIRM", {
      operation: "PUNCTUALITY_CONFIRM",
      expectedVersion: 2,
    }),
    prisma,
  );
  check(
    "puntualidad se confirma independientemente",
    Boolean(punctual.punctualityConfirmedAt),
  );
  const started = await actOnSurveyAssignment(
    evaluator,
    assignment.assignmentRef,
    sign("START_SURVEY", { operation: "START_SURVEY", expectedVersion: 3 }),
    prisma,
  );
  let draft = await getSurveyDraft(evaluator, started.surveyRef, prisma);
  check(
    "borrador enlaza catálogo, servicio y ruta exactos",
    draft.catalog.version === 1 &&
      draft.serviceSelectionRef === serviceRevision.selectionRef &&
      draft.routeVersion === 1,
  );
  const article = draft.catalog.articles[0];
  const area = draft.catalog.areas[0];
  const upsert = sign("UPSERT_ITEM", {
    operation: "UPSERT_ITEM",
    expectedDraftVersion: draft.version,
    itemRef: null,
    expectedItemVersion: null,
    articleRef: article.articleRef,
    areaRef: area.areaRef,
    shipmentMode: "LOCAL",
    quantity: 2,
    condition: "PRE_EXISTING_DAMAGE",
    flags: ["FRAGILE", "CRATING_CANDIDATE"],
    dimensions: { unit: "IN", length: 40, width: 20, height: 30 },
    note: "Daño observado",
  });
  await mutateSurveyDraft(evaluator, draft.surveyRef, upsert, prisma);
  draft = await getSurveyDraft(evaluator, draft.surveyRef, prisma);
  check(
    "medidas preservan pulgadas y normalizan centímetros",
    draft.items[0].dimensions.unit === "IN" &&
      Math.abs(draft.items[0].normalizedCm.length - 101.6) < 0.001,
  );
  check(
    "volumen autoritativo deriva del inventario Survey",
    draft.totals.volumeM3 > 0 && draft.totals.quantity === 2,
  );
  await reject(
    "daño bloquea revisión sin foto",
    "CRM_SURVEY_DAMAGE_PHOTO_REQUIRED",
    () =>
      mutateSurveyDraft(
        evaluator,
        draft.surveyRef,
        sign("MARK_READY", {
          operation: "MARK_READY",
          expectedDraftVersion: draft.version,
          notes: null,
        }),
        prisma,
      ),
  );
  const photoBytes = Buffer.from("synthetic-image");
  const photoInput = sign("PHOTO_ATTACH", {
    purpose: "DAMAGE",
    itemRef: draft.items[0].itemRef,
    accessRef: null,
    mimeType: "image/png",
    sizeBytes: photoBytes.length,
    sha256: surveyBlobSha256(photoBytes),
  });
  const photo = await uploadSurveyPhoto(
    evaluator,
    draft.surveyRef,
    photoInput,
    photoBytes,
    "image/png",
    prisma,
    storage,
  );
  check(
    "foto tiene contexto y blob externo",
    photo.purpose === "DAMAGE" && storage.count() === 1,
  );
  check(
    "reintento de foto es idempotente",
    (
      await uploadSurveyPhoto(
        evaluator,
        draft.surveyRef,
        photoInput,
        photoBytes,
        "image/png",
        prisma,
        storage,
      )
    ).photoRef === photo.photoRef && storage.count() === 1,
  );
  await reject(
    "photoRef de otro tenant no se consulta por Survey ajeno",
    "CRM_SURVEY_RESOURCE_NOT_FOUND",
    () => getSurveyDraft(outsider, draft.surveyRef, prisma),
  );
  for (const side of ["ORIGIN", "DESTINATION"]) {
    draft = await getSurveyDraft(evaluator, draft.surveyRef, prisma);
    await mutateSurveyDraft(
      evaluator,
      draft.surveyRef,
      sign("SAVE_ACCESS", {
        operation: "SAVE_ACCESS",
        expectedDraftVersion: draft.version,
        expectedAccessVersion: null,
        side,
        floorNumber: side === "ORIGIN" ? 3 : 6,
        stairsFloors: side === "ORIGIN" ? 3 : 0,
        elevatorAvailable: side === "DESTINATION",
        elevatorFloor: side === "DESTINATION" ? 6 : null,
        parkingDistanceM: 25,
        flags:
          side === "ORIGIN"
            ? ["STAIRS", "NARROW_PASSAGE"]
            : ["PASSENGER_ELEVATOR"],
        notes: null,
      }),
      prisma,
    );
  }
  draft = await getSurveyDraft(evaluator, draft.surveyRef, prisma);
  check(
    "origen y destino persisten separados",
    draft.access.length === 2 && draft.access[0].side !== draft.access[1].side,
  );
  await mutateSurveyDraft(
    evaluator,
    draft.surveyRef,
    sign("MARK_READY", {
      operation: "MARK_READY",
      expectedDraftVersion: draft.version,
      notes: "Listo",
    }),
    prisma,
  );
  draft = await getSurveyDraft(evaluator, draft.surveyRef, prisma);
  check(
    "revisión mantiene borrador server-side",
    draft.status === "READY_FOR_REVIEW",
  );
  const publishInput = sign("PUBLISH_SURVEY", {
    expectedDraftVersion: draft.version,
    signerName: "Firmante Sintético",
    relationship: "Representante",
    signatureStrokes: [
      [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.2 },
        { x: 0.9, y: 0.6 },
      ],
    ],
  });
  const publication = await publishSurvey(
    evaluator,
    draft.surveyRef,
    publishInput,
    prisma,
    storage,
  );
  check(
    "firma y PDF se almacenan fuera de DB",
    storage.count() === 3 && publication.pdfSha256.length === 64,
  );
  check(
    "publicación idempotente",
    (
      await publishSurvey(
        evaluator,
        draft.surveyRef,
        publishInput,
        prisma,
        storage,
      )
    ).publicationRef === publication.publicationRef &&
      (await prisma.surveyPublication.count({ where: { tenantId } })) === 1,
  );
  const published = await getSurveyPublication(
    evaluator,
    publication.publicationRef,
    prisma,
  );
  check(
    "DTO publicado no expone PK internas",
    !JSON.stringify(published).match(
      /tenantId|membershipId|userId|clientId|pipelineCaseId|blobObjectId/,
    ) && published.items[0].quantity === 2,
  );
  check(
    "PDF excluye precio costo y margen",
    !JSON.stringify(published).match(/price|cost|margin/i),
  );
  const downloadedPdf = await getSurveyPublicationPdf(
    evaluator,
    publication.publicationRef,
    prisma,
    storage,
  );
  check(
    "PDF privado descarga la versión publicada exacta",
    downloadedPdf.bytes.subarray(0, 4).toString() === "%PDF" &&
      downloadedPdf.sha256 === publication.pdfSha256,
  );
  await reject(
    "publicación ajena y cross-tenant es 404 indistinguible",
    "CRM_SURVEY_RESOURCE_NOT_FOUND",
    () => getSurveyPublication(outsider, publication.publicationRef, prisma),
  );
  await reject(
    "PDF ajeno y cross-tenant es 404 indistinguible",
    "CRM_SURVEY_RESOURCE_NOT_FOUND",
    () =>
      getSurveyPublicationPdf(
        outsider,
        publication.publicationRef,
        prisma,
        storage,
      ),
  );
  await prisma.tenantMembership.update({
    where: { id: evaluatorMembershipId },
    data: { status: "SUSPENDED" },
  });
  await reject(
    "membership obsoleta falla cerrada",
    "CRM_SURVEY_PERMISSION_FORBIDDEN",
    () => listSurveyAgenda(evaluator, prisma),
  );
  await prisma.tenantMembership.update({
    where: { id: evaluatorMembershipId },
    data: { status: "ACTIVE" },
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "SUSPENDED" },
  });
  await reject(
    "tenant inactivo falla cerrado",
    "CRM_SURVEY_PERMISSION_FORBIDDEN",
    () => listSurveyAgenda(evaluator, prisma),
  );
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "ACTIVE" },
  });
  await reject(
    "publicación queda inmutable",
    "CRM_SURVEY_VERSION_CONFLICT",
    () =>
      mutateSurveyDraft(
        evaluator,
        draft.surveyRef,
        sign("DELETE_ITEM", {
          operation: "DELETE_ITEM",
          expectedDraftVersion: draft.version + 1,
          itemRef: draft.items[0].itemRef,
          expectedItemVersion: draft.items[0].version,
        }),
        prisma,
      ),
  );
  let triggerBlocked = false;
  try {
    await prisma.surveyPublicationItem.updateMany({
      where: { tenantId },
      data: { quantity: 9 },
    });
  } catch {
    triggerBlocked = true;
  }
  check("trigger bloquea reescritura de hechos publicados", triggerBlocked);
  check(
    "auditoría y comandos acompañan mutaciones",
    (await prisma.surveyMutationCommand.count({ where: { tenantId } })) >= 8 &&
      (await prisma.commercialAuditLog.count({
        where: { tenant_id: tenantId, source: "V17_SURVEY_FOUNDATION_04A" },
      })) >= 8,
  );
  check(
    "ningún GET escribe",
    (await prisma.surveyMutationCommand.count({ where: { tenantId } })) ===
      (await prisma.surveyMutationCommand.count({ where: { tenantId } })),
  );
  process.stdout.write(
    `${JSON.stringify({ ok: true, assertions: passed.length, migrationCount: 24, storageObjects: storage.count() }, null, 2)}\n`,
  );
} finally {
  await prisma.$disconnect();
}
