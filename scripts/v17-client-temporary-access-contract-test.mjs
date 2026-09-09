import assert from "node:assert/strict";
import {
  ClientTemporaryAccessError,
  clientTemporaryPayloadHash,
  normalizeClientVisitAction,
  normalizeCreateTemporaryAccess,
  normalizeMiniSurvey,
  normalizeQrConfirmation,
  normalizeUploadMetadata,
} from "../api/_lib/clientTemporaryAccessContract.js";
import { PERMS, permsForRole } from "../api/_lib/rbac.js";

const ref = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const signed = (payload, outward = {}) => ({ ...outward, payloadHash: clientTemporaryPayloadHash(payload) });
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
const rejects = (fn, code) => { assert.throws(fn, (error) => error instanceof ClientTemporaryAccessError && error.code === code); assertions += 1; };

const createPayload = Object.freeze({ operation: "ACCESS_CREATE", requestId: "client-access-create-0001", caseRef: ref("1"), assignmentRef: ref("2"), contactRef: ref("3"), communicationRef: null, purpose: "VISIT", scopes: Object.freeze(["VISIT_CONFIRM", "VISIT_VIEW"]), expiresAt: "2026-09-17T12:00:00.000Z", maxUses: 25, shortCodeEnabled: true });
const created = normalizeCreateTemporaryAccess(signed(createPayload, { requestId: createPayload.requestId, caseRef: createPayload.caseRef, assignmentRef: createPayload.assignmentRef, contactRef: createPayload.contactRef, communicationRef: null, purpose: createPayload.purpose, scopes: createPayload.scopes, expiresAt: createPayload.expiresAt, maxUses: createPayload.maxUses, shortCodeEnabled: true }));
check(created.payloadHash === clientTemporaryPayloadHash(createPayload), "servidor recalcula payloadHash canónico");
rejects(() => normalizeCreateTemporaryAccess({ ...signed(createPayload, { requestId: createPayload.requestId, caseRef: createPayload.caseRef, assignmentRef: createPayload.assignmentRef, contactRef: createPayload.contactRef, communicationRef: null, purpose: createPayload.purpose, scopes: createPayload.scopes, expiresAt: createPayload.expiresAt, maxUses: 25, shortCodeEnabled: true }), payloadHash: "0".repeat(64) }), "CLIENT_TEMPORARY_PAYLOAD_HASH_INVALID");
rejects(() => normalizeCreateTemporaryAccess({ ...signed(createPayload, { requestId: createPayload.requestId, caseRef: createPayload.caseRef, assignmentRef: createPayload.assignmentRef, contactRef: createPayload.contactRef, communicationRef: null, purpose: createPayload.purpose, scopes: createPayload.scopes, expiresAt: createPayload.expiresAt, maxUses: 25, shortCodeEnabled: true }), tenantId: "forbidden" }), "CLIENT_TEMPORARY_INPUT_INVALID");
rejects(() => normalizeCreateTemporaryAccess({ ...signed(createPayload, { requestId: createPayload.requestId, caseRef: "ckinternal", assignmentRef: createPayload.assignmentRef, contactRef: createPayload.contactRef, communicationRef: null, purpose: createPayload.purpose, scopes: createPayload.scopes, expiresAt: createPayload.expiresAt, maxUses: 25, shortCodeEnabled: true }), caseRef: "ckinternal" }), "CLIENT_TEMPORARY_ACCESS_UNAVAILABLE");

const miniItems = Array.from({ length: 10 }, (_, index) => ({ articleRef: `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`, quantity: index + 1, measurements: null, notes: null }));
const miniPayload = { operation: "MINI_SURVEY_SAVE", requestId: "client-mini-save-0001", expectedVersion: 0, submit: false, notes: null, items: miniItems };
check(normalizeMiniSurvey(signed(miniPayload, { requestId: miniPayload.requestId, expectedVersion: 0, submit: false, notes: null, items: miniItems })).items.length === 10, "Mini acepta hasta diez tipos");
const eleven = [...miniItems, { articleRef: ref("f"), quantity: 1, measurements: null, notes: null }];
const elevenPayload = { ...miniPayload, items: eleven };
rejects(() => normalizeMiniSurvey(signed(elevenPayload, { requestId: miniPayload.requestId, expectedVersion: 0, submit: false, notes: null, items: eleven })), "CLIENT_TEMPORARY_MINI_REQUIRES_DETAILED_SURVEY");

const visitPayload = { operation: "VISIT_CHANGE_REQUEST", requestId: "client-visit-change-0001", expectedVersion: 1, reasonRef: ref("4"), comment: "Solicito otra fecha", suggestedAvailability: ["2026-09-18T14:00:00.000Z"] };
check(normalizeClientVisitAction(signed(visitPayload, { requestId: visitPayload.requestId, action: visitPayload.operation, expectedVersion: 1, reasonRef: visitPayload.reasonRef, comment: visitPayload.comment, suggestedAvailability: visitPayload.suggestedAvailability })).operation === "VISIT_CHANGE_REQUEST", "cambio de visita es solicitud explícita");
const qrPayload = { operation: "QR_CONFIRM", requestId: "client-qr-confirm-0001", qrPayload: `${ref("5")}.${ref("6")}` };
check(normalizeQrConfirmation(signed(qrPayload, { requestId: qrPayload.requestId, qrPayload: qrPayload.qrPayload })).operation === "QR_CONFIRM", "QR usa contrato cerrado");
const uploadPayload = { operation: "SURVEY_ASSET_UPLOAD", requestId: "client-upload-0001", category: "PHOTO", documentType: null, mimeType: "image/webp", sizeBytes: 2048, sha256: "a".repeat(64) };
check(normalizeUploadMetadata(signed(uploadPayload, { requestId: uploadPayload.requestId, category: uploadPayload.category, documentType: null, mimeType: uploadPayload.mimeType, sizeBytes: 2048, sha256: uploadPayload.sha256 })).category === "PHOTO", "archivo autorizado conserva categoría");
rejects(() => normalizeUploadMetadata({ ...signed(uploadPayload, { requestId: uploadPayload.requestId, category: uploadPayload.category, documentType: null, mimeType: uploadPayload.mimeType, sizeBytes: 2048, sha256: uploadPayload.sha256 }), payloadHash: "0".repeat(64) }), "CLIENT_TEMPORARY_PAYLOAD_HASH_INVALID");

for (const permission of [PERMS.CLIENT_ACCESS_VIEW, PERMS.CLIENT_ACCESS_CREATE, PERMS.CLIENT_ACCESS_REVOKE, PERMS.CLIENT_ACCESS_MANAGE]) {
  check(!permsForRole("A").includes(permission) && !permsForRole("V").includes(permission), `${permission} requiere grant explícito`);
}

process.stdout.write(`${JSON.stringify({ ok: true, assertions, miniTypeLimit: 10, roleBaselineGrants: 0, productionApiEnabled: false })}\n`);
