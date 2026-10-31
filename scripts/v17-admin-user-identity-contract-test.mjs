import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  canonicalIdentityPayload, identityRef, normalizeEnrollmentInput, normalizeIdentityDocument,
  normalizeIdentityInput, parseProfilePhoto, requestRef,
} from "../api/_lib/adminUserIdentityContract.js";
import { ADMIN_MEMBERSHIP_ROLE_OPTIONS } from "../shared/adminMembershipCatalog.js";
import { pngChunk, syntheticPng } from "./fixtures/v17-user-identity-photo.mjs";

const results = [];
function check(name, verify) { verify(); results.push({ name, passed: true }); }
function rejects(name, verify, suffix = "INPUT_INVALID") {
  check(name, () => assert.throws(verify, (error) => error.code === `ADMIN_USER_IDENTITY_${suffix}`));
}
const png = syntheticPng();
const photo = png.toString("base64");
const enrollment = { requestId: randomUUID(), name: "Persona Sintética", email: "person@example.invalid", phone: "+18095550123", documentType: "CEDULA", documentNumber: "00000000001", role: "V" };

check("identity normalizes company contact without login fields", () => {
  assert.deepEqual(normalizeIdentityInput({ name: "  Persona   Sintética ", phone: "+1 (809) 555-0123", contactEmail: " CONTACT@EXAMPLE.INVALID ", documentType: "CEDULA", documentNumber: "000-0000000-1" }), {
    name: "Persona Sintética", phone: "+18095550123", contactEmail: "contact@example.invalid", documentType: "CEDULA", documentNumber: "00000000001",
  });
});
check("partial edit does not invent omitted fields", () => assert.deepEqual(normalizeIdentityInput({ phone: "" }, { partial: true }), { phone: "" }));
check("document type and number remain separate from stable identity refs", () => {
  assert.equal(normalizeIdentityDocument("PASSPORT", " a123-45 "), "A123-45");
  assert.equal(normalizeIdentityDocument("OTHER", null), null);
  assert.equal(identityRef(enrollment.requestId), enrollment.requestId);
  assert.equal(requestRef(enrollment.requestId), enrollment.requestId);
});
check("omitted optional identity fields use explicit empty values", () => assert.deepEqual(normalizeIdentityInput({ name: "Persona" }), { name: "Persona", phone: "", contactEmail: null, documentType: "CEDULA", documentNumber: null }));
check("enrollment email and document normalized", () => {
  const normalized = normalizeEnrollmentInput({ ...enrollment, email: " PERSON@EXAMPLE.INVALID ", documentNumber: "000-0000000-1" });
  assert.equal(normalized.email, "person@example.invalid"); assert.equal(normalized.documentNumber, "00000000001");
});
for (const { code } of ADMIN_MEMBERSHIP_ROLE_OPTIONS.filter(({ code }) => code !== "A")) {
  check(`non-admin enrollment role ${code} is deliberate`, () => assert.equal(normalizeEnrollmentInput({ ...enrollment, role: code }).role, code));
}
rejects("new administrator must use the existing governed flow", () => normalizeEnrollmentInput({ ...enrollment, role: "A" }), "ADMIN_ENROLLMENT_REQUIRED");
for (const [label, input] of [
  ["unknown role", { ...enrollment, role: "SUPERUSER" }],
  ["implicit role", { ...enrollment, role: undefined }],
  ["caller supplied access", { ...enrollment, grantedPermissions: ["users:create"] }],
  ["caller supplied tenant", { ...enrollment, tenantId: randomUUID() }],
  ["administrator supplied password", { ...enrollment, password: "Not-Allowed!" }],
  ["internal identifier", { ...enrollment, userId: randomUUID() }],
  ["replay identifier not UUID", { ...enrollment, requestId: "not-a-uuid" }],
]) rejects(label, () => normalizeEnrollmentInput(input));
for (const [label, input] of [
  ["login email cannot be edited as company identity", { email: "changed@example.invalid" }],
  ["identity cannot change access", { role: "A" }],
  ["control character name", { name: "Persona\nOtra" }],
  ["one character name", { name: "A" }],
  ["oversized name", { name: "A".repeat(161) }],
  ["ambiguous local phone", { phone: "8095550123" }],
  ["oversized phone", { phone: "+1".padEnd(18, "2") }],
  ["invalid contact email", { contactEmail: "x@" }],
  ["unknown document kind", { documentType: "LICENSE" }],
  ["invalid cedula length", { documentType: "CEDULA", documentNumber: "123" }],
  ["cedula letters", { documentType: "CEDULA", documentNumber: "ABCDEFGHIJK" }],
  ["oversized document", { documentNumber: "A".repeat(51) }],
]) rejects(label, () => normalizeIdentityInput(input, { partial: true }));
rejects("public identity reference rejects private database ids", () => identityRef("internal-id"), "NOT_FOUND");
rejects("request references reject non-v4 values", () => requestRef("00000000-0000-0000-0000-000000000000"));
check("canonical replay payload ignores property insertion order", () => assert.equal(canonicalIdentityPayload({ b: 2, a: { d: null, c: "one" } }), canonicalIdentityPayload({ a: { c: "one", d: null }, b: 2 })));

check("valid bounded RGBA PNG is preserved and hashed", () => {
  const parsed = parseProfilePhoto(photo);
  assert.deepEqual(parsed.bytes, png);
  assert.equal(parsed.sha256, createHash("sha256").update(png).digest("hex"));
});
check("RGB PNG is supported", () => assert.ok(parseProfilePhoto(syntheticPng({ colorType: 2 }).toString("base64")).bytes));
check("photo omission and explicit removal are distinct", () => {
  assert.equal(parseProfilePhoto(undefined), undefined);
  assert.deepEqual(parseProfilePhoto(null), { bytes: null, sha256: null });
});
check("photo ancillary metadata is stripped before hash/storage", () => {
  const withMetadata = syntheticPng({ beforeData: [pngChunk("tEXt", Buffer.from("Comment\0synthetic private contact")), pngChunk("eXIf", Buffer.from("synthetic EXIF"))] });
  assert.deepEqual(parseProfilePhoto(withMetadata.toString("base64")), parseProfilePhoto(photo));
});
check("maximum allowed dimensions decode with a bounded buffer", () => assert.ok(parseProfilePhoto(syntheticPng({ width: 512, height: 512 }).toString("base64")).bytes));
const corruptCrc = Buffer.from(png); corruptCrc[29] ^= 1;
const trailingCompressed = Buffer.concat([deflateSync(Buffer.from([0, 80, 80, 80, 80])), Buffer.from([1, 2, 3])]);
for (const [label, value] of [
  ["remote image URL", "https://example.invalid/avatar.png"],
  ["data URL", `data:image/png;base64,${photo}`],
  ["SVG disguised as image", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>').toString("base64")],
  ["base64 whitespace", `${photo}\n`],
  ["empty image", ""],
  ["nonstring image", {}],
  ["decoded size exceeds 256KiB", Buffer.alloc(262145).toString("base64")],
  ["corrupt CRC", corruptCrc.toString("base64")],
  ["zero width", syntheticPng({ width: 0 }).toString("base64")],
  ["excessive width", syntheticPng({ width: 513 }).toString("base64")],
  ["excessive height", syntheticPng({ height: 513 }).toString("base64")],
  ["interlacing", syntheticPng({ interlace: 1 }).toString("base64")],
  ["unsupported bit depth", syntheticPng({ bitDepth: 16 }).toString("base64")],
  ["unsupported palette", syntheticPng({ colorType: 3 }).toString("base64")],
  ["unknown critical chunk", syntheticPng({ beforeData: [pngChunk("ABCD")] }).toString("base64")],
  ["high-bit chunk name with valid CRC", syntheticPng({ beforeData: [pngChunk("\u00e1EXt", Buffer.from("metadata"))] }).toString("base64")],
  ["reserved PNG chunk bit", syntheticPng({ beforeData: [pngChunk("texT", Buffer.from("metadata"))] }).toString("base64")],
  ["animated PNG", syntheticPng({ beforeData: [pngChunk("acTL", Buffer.alloc(8))] }).toString("base64")],
  ["missing IEND", syntheticPng({ ending: false }).toString("base64")],
  ["truncated bytes", png.subarray(0, png.length - 1).toString("base64")],
  ["bytes after IEND", Buffer.concat([png, Buffer.from([1])]).toString("base64")],
  ["excessive chunk count", syntheticPng({ beforeData: Array.from({ length: 128 }, () => pngChunk("tEXt")) }).toString("base64")],
  ["invalid scanline filter", syntheticPng({ filter: 5 }).toString("base64")],
  ["oversized inflate output", syntheticPng({ rawPixels: Buffer.alloc(1024 * 1024) }).toString("base64")],
  ["short inflate output", syntheticPng({ rawPixels: Buffer.from([0]) }).toString("base64")],
  ["invalid deflate data", syntheticPng({ compressedData: Buffer.from([1, 2, 3]) }).toString("base64")],
  ["trailing compressed stream data", syntheticPng({ compressedData: trailingCompressed }).toString("base64")],
]) rejects(`photo rejects ${label}`, () => parseProfilePhoto(value), "PHOTO_INVALID");

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
