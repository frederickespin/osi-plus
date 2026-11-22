import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  canonicalPayloadHash,
  normalizeCatalogCreate,
  normalizeDraftMutation,
  normalizePhotoCommand,
  normalizePhotoMetadata,
  normalizePublish,
} from "../api/_lib/crmSurveyContract.js";
import {
  CRM_SURVEY_API_MODES,
  CRM_SURVEY_CATALOG_MAX_JSON_BYTES,
  createCrmSurveyHandler,
  resolveCrmSurveyApiMode,
} from "../api/_lib/crmSurveyHttp.js";
import { actOnSurveyAssignment, getSurveyCatalog } from "../api/_lib/crmSurveyDomain.js";
import {
  renderSurveyPublicationPdf,
  renderSurveySignatureSvg,
} from "../api/_lib/crmSurveyPdf.js";
import { createMemorySurveyStorage } from "../api/_lib/crmSurveyStorage.js";

const sign = (operation, payload) => {
  const requestId = randomUUID();
  return {
    requestId,
    payloadHash: canonicalPayloadHash({ operation, requestId, ...payload }),
    ...payload,
  };
};
const articleRef = randomUUID();
const areaRef = randomUUID();
const item = normalizeDraftMutation(
  sign("UPSERT_ITEM", {
    operation: "UPSERT_ITEM",
    expectedDraftVersion: 1,
    itemRef: null,
    expectedItemVersion: null,
    articleRef,
    areaRef,
    shipmentMode: "SEA",
    quantity: 999,
    condition: "GOOD",
    flags: ["FRAGILE"],
    dimensions: { unit: "IN", length: 10, width: 20, height: 30 },
    note: null,
  }),
);
assert.equal(item.dimensions.original.unit, "IN");
assert.equal(item.dimensions.lengthCm, 25.4);
assert.throws(
  () =>
    normalizeDraftMutation(
      sign("UPSERT_ITEM", {
        ...item,
        requestId: undefined,
        payloadHash: undefined,
        quantity: 1000,
        dimensions: { unit: "CM", length: 1, width: 1, height: 1 },
      }),
    ),
  /CRM_SURVEY_INPUT_INVALID/,
);
assert.throws(
  () =>
    normalizePhotoMetadata({
      purpose: "DAMAGE",
      itemRef: null,
      accessRef: null,
    }),
  /CRM_SURVEY_PHOTO_CONTEXT_INVALID/,
);
assert.equal(
  normalizePhotoMetadata({
    purpose: "ORIGIN_ACCESS",
    itemRef: null,
    accessRef: randomUUID(),
  }).purpose,
  "ORIGIN_ACCESS",
);
const photoBytes = Buffer.from("synthetic-photo");
const photoPayload = {
  purpose: "DAMAGE",
  itemRef: articleRef,
  accessRef: null,
  mimeType: "image/png",
  sizeBytes: photoBytes.length,
  sha256: "0".repeat(64),
};
assert.equal(
  normalizePhotoCommand(sign("PHOTO_ATTACH", photoPayload)).purpose,
  "DAMAGE",
);
assert.throws(
  () =>
    normalizePhotoCommand({
      ...sign("PHOTO_ATTACH", photoPayload),
      payloadHash: "f".repeat(64),
    }),
  /CRM_SURVEY_PAYLOAD_HASH_MISMATCH/,
);
assert.throws(
  () =>
    normalizePublish(
      sign("PUBLISH_SURVEY", {
        expectedDraftVersion: 1,
        signerName: "Firmante",
        relationship: "Cliente",
        signatureStrokes: [],
      }),
    ),
  /CRM_SURVEY_SIGNATURE_REQUIRED/,
);
const storage = createMemorySurveyStorage();
const stored = await storage.put({
  tenantId: "tenant-synthetic",
  kind: "photo",
  mimeType: "image/png",
  bytes: Buffer.from("fixture"),
});
assert.equal((await storage.get(stored.storageKey)).toString(), "fixture");
await assert.rejects(
  () =>
    storage.put({
      tenantId: "t",
      kind: "photo",
      mimeType: "text/html",
      bytes: Buffer.from("x"),
    }),
  /CRM_SURVEY_BLOB_INVALID/,
);
await assert.rejects(
  () =>
    storage.put({
      tenantId: "t",
      kind: "photo",
      mimeType: "image/png",
      bytes: Buffer.alloc(12 * 1024 * 1024 + 1),
    }),
  /CRM_SURVEY_BLOB_INVALID/,
);
await storage.remove(stored.storageKey);
assert.equal(storage.count(), 0);
const signature = renderSurveySignatureSvg([
  [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
]);
assert.match(signature.toString(), /polyline/);
const pdfInput = {
  publicationRef: randomUUID(),
  caseCode: "SUR-1",
  clientDisplayName: "Cliente",
  serviceDescription: "Servicio",
  originSummary: "Origen",
  destinationSummary: "Destino",
  evaluatorDisplayName: "Evaluador",
  signerName: "Firmante",
  relationship: "Representante",
  signatureStrokes: [[{ x: 0.1, y: 0.8 }, { x: 0.9, y: 0.2 }]],
  publishedAt: "2026-09-05T12:00:00.000Z",
  totalQuantity: 1,
  totalVolumeM3: 1.2,
  totalWeightKg: 10,
  items: [
    {
      quantity: 1,
      articleName: "Sofá",
      areaName: "Sala",
      condition: "GOOD",
      totalVolumeM3: 1.2,
      photoRefs: [],
    },
  ],
  access: [{ side: "ORIGIN", summary: "Piso 1", photoRefs: [] }],
};
const pdf = renderSurveyPublicationPdf(pdfInput);
assert.equal(pdf.bytes.subarray(0, 4).toString(), "%PDF");
assert.equal(pdf.pdfSha256.length, 64);
assert.match(pdf.bytes.toString("latin1"), /RG .* m .* l S/);
assert.match(pdf.bytes.toString("latin1"), /10\.00 kg/);
const withoutWeight = renderSurveyPublicationPdf({ ...pdfInput, totalWeightKg: null });
assert.match(withoutWeight.bytes.toString("latin1"), /Peso volumetrico pendiente segun el servicio/);
assert.doesNotMatch(withoutWeight.bytes.toString("latin1"), /\b0\.00 kg/);
assert.throws(
  () => renderSurveyPublicationPdf({ price: 10 }),
  /CRM_SURVEY_PDF_PRIVATE_FIELD/,
);
assert.throws(() => resolveCrmSurveyApiMode({}, {}), /CRM_SURVEY_DISABLED/);
assert.throws(
  () =>
    resolveCrmSurveyApiMode(
      { CRM_SURVEY_API_MODE: "LOCAL_ONLY", VERCEL: "1" },
      {
        socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1" },
      },
    ),
  /CRM_SURVEY_CONFIGURATION_INVALID/,
);
assert.equal(
  resolveCrmSurveyApiMode(
    { CRM_SURVEY_API_MODE: CRM_SURVEY_API_MODES.LOCAL_ONLY },
    {
      socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
      headers: { host: "127.0.0.1:4196" },
    },
  ),
  "LOCAL_ONLY",
);
const previewEnv = {
  CRM_SURVEY_API_MODE: CRM_SURVEY_API_MODES.PREVIEW_REHEARSAL,
  CRM_SURVEY_API_BATCH: "V17-SURVEY-FOUNDATION-04A-PREVIEW",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  MT01B_AUTH_MODE: "LEGACY",
  MT01B_TENANT_SWITCH_ENABLED: "false",
  VITE_MT01B2_CLIENT_ENABLED: "false",
};
assert.equal(
  resolveCrmSurveyApiMode({ ...previewEnv, VERCEL_GIT_COMMIT_REF: "feature/v17-storage-commercial-contract-22a" }, {}),
  "PREVIEW_REHEARSAL",
);
assert.throws(
  () => resolveCrmSurveyApiMode({ ...previewEnv, VERCEL_GIT_COMMIT_REF: "main" }, {}),
  /CRM_SURVEY_CONFIGURATION_INVALID/,
);

const catalogContext = { tenantId: "tenant", membershipId: "membership", userId: "user" };
const catalogVersion = { catalogRef: randomUUID(), version: 1, articles: [], areas: [], conditions: [] };
function catalogDatabase(granted, denied = [], activeVersion = catalogVersion) {
  return {
    $transaction: (run) => run({
      $queryRaw: async () => [{
        id: catalogContext.membershipId, public_ref: randomUUID(), user_id: catalogContext.userId,
        user_name: "Persona de prueba", role: "A", user_status: "ACTIVE",
        membership_status: "ACTIVE", tenant_status: "ACTIVE",
        granted_permissions: granted, denied_permissions: denied,
      }],
      surveyCatalogVersion: { findFirst: async () => activeVersion },
    }),
  };
}
const management = "survey:assignment:manage";
const reading = "survey:assignment:view";
assert.deepEqual(await getSurveyCatalog(catalogContext, catalogDatabase([management])), catalogVersion);
assert.deepEqual(await getSurveyCatalog(catalogContext, catalogDatabase([reading], [management])), catalogVersion);
await assert.rejects(
  getSurveyCatalog(catalogContext, catalogDatabase([management], [reading])),
  { code: "CRM_SURVEY_PERMISSION_FORBIDDEN", status: 403 },
);
await assert.rejects(
  getSurveyCatalog(catalogContext, catalogDatabase([management], [], null)),
  { code: "CRM_SURVEY_CATALOG_NOT_READY", status: 409 },
);

const assignmentRef = randomUUID();
const evaluator = { ...catalogContext, membershipId: "evaluator", userId: "evaluating-user" };
const assignment = {
  id: "assignment",
  evaluatorMembershipId: evaluator.membershipId,
  evaluatorUserId: evaluator.userId,
  contextSnapshot: { zone: { type: "INTERIOR" } },
  scheduledStart: new Date(),
  status: "COMPLETED",
  version: 1,
};
const commands = new Map();
const auditActions = [];
const returnDatabase = {
  $transaction: (run) => run({
    $executeRawUnsafe: async () => {},
    $executeRaw: async () => {},
    $queryRaw: async (sql) => {
      if (sql.text.includes("pg_try_advisory_xact_lock")) return [{ ok: true }];
      if (sql.text.includes("FOR KEY SHARE")) return [{
        id: sql.values[1], public_ref: randomUUID(), user_id: sql.values[2],
        user_name: "Persona de prueba", role: "A", user_status: "ACTIVE",
        membership_status: "ACTIVE", tenant_status: "ACTIVE",
        granted_permissions: [management, "survey:perform"], denied_permissions: [],
      }];
      if (sql.text.includes("commercial_audit_logs")) {
        auditActions.push(sql.values[5]);
        return [{ action: sql.values[5] }];
      }
      return [{ id: evaluator.membershipId, tenant_id: evaluator.tenantId, user_id: evaluator.userId, role: "A", status: "ACTIVE" }];
    },
    surveyAssignment: {
      findFirst: async () => assignment,
      update: async ({ data }) => {
        assignment.contextSnapshot = data.contextSnapshot;
        assignment.version += data.version.increment;
        return assignment;
      },
    },
    surveyMutationCommand: {
      findFirst: async ({ where }) => commands.get(where.requestId),
      create: async ({ data }) => commands.set(data.requestId, data),
    },
  }),
};
const returnCommand = sign("RETURN_TO_METRO", { operation: "RETURN_TO_METRO", expectedVersion: 1 });
await assert.rejects(actOnSurveyAssignment(catalogContext, assignmentRef, returnCommand, returnDatabase), {
  code: "CRM_SURVEY_RESOURCE_NOT_FOUND", status: 404,
});
const reportedReturn = await actOnSurveyAssignment(evaluator, assignmentRef, returnCommand, returnDatabase);
assert.equal(reportedReturn.returnedToMetroAt, assignment.contextSnapshot.metroReturnRecordedAt);
assert.equal(reportedReturn.version, 2);
assert.deepEqual(await actOnSurveyAssignment(evaluator, assignmentRef, returnCommand, returnDatabase), reportedReturn);
assert.deepEqual(auditActions, ["SURVEY_METRO_RETURN_RECORDED"]);
await assert.rejects(actOnSurveyAssignment(catalogContext, assignmentRef, returnCommand, returnDatabase), {
  code: "CRM_SURVEY_IDEMPOTENCY_CONFLICT", status: 409,
});

const batch = sign("CATALOG_CREATE", {
  expectedLatestVersion: 1,
  articles: Array.from({ length: 500 }, (_, index) => ({
    code: `ART_${index}`, name: `Artículo ${index}`,
    aliases: Array.from({ length: 10 }, (_, number) => `Descripción de búsqueda ${index} variante ${number}`),
    frequentAreaCodes: [], defaultVolumeM3: 1.25, defaultWeightKg: null,
  })),
  areas: [{ code: "GENERAL", name: "General" }],
  conditions: [],
});
assert.ok(Buffer.byteLength(JSON.stringify(batch)) > 128 * 1024);
function catalogResponse() {
  return {
    statusCode: null, body: null, setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}
const config = {
  env: { ...previewEnv, VERCEL_GIT_COMMIT_REF: "feature/v17-storage-commercial-contract-22a" },
  methods: ["POST"],
  resolveContext: async () => catalogContext,
  execute: ({ input }) => normalizeCatalogCreate(input).articles.length,
};
const request = { method: "POST", headers: { "content-type": "application/json" }, body: batch };
const standardResponse = catalogResponse();
await createCrmSurveyHandler(config)(request, standardResponse);
assert.equal(standardResponse.statusCode, 413);
const batchResponse = catalogResponse();
await createCrmSurveyHandler({ ...config, maxJsonBytes: CRM_SURVEY_CATALOG_MAX_JSON_BYTES })(request, batchResponse);
assert.equal(batchResponse.statusCode, 201);
assert.equal(batchResponse.body.data, 500);
process.stdout.write(
  `${JSON.stringify({ ok: true, assertions: 37 }, null, 2)}\n`,
);
