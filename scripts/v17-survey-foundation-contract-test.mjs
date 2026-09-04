import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  canonicalPayloadHash,
  normalizeDraftMutation,
  normalizePhotoCommand,
  normalizePhotoMetadata,
  normalizePublish,
} from "../api/_lib/crmSurveyContract.js";
import {
  CRM_SURVEY_API_MODES,
  resolveCrmSurveyApiMode,
} from "../api/_lib/crmSurveyHttp.js";
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
const pdf = renderSurveyPublicationPdf({
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
});
assert.equal(pdf.bytes.subarray(0, 4).toString(), "%PDF");
assert.equal(pdf.pdfSha256.length, 64);
assert.match(pdf.bytes.toString("latin1"), /RG .* m .* l S/);
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
process.stdout.write(
  `${JSON.stringify({ ok: true, assertions: 21 }, null, 2)}\n`,
);
