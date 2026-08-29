import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { issueCrmOwnerRefs, readCrmOwnerRef } from "../api/_lib/crmOwnerRef.js";
import { assertOwnerCatalogContract, OwnerCatalogContractError } from "./crm-owner-catalog-contract.mjs";

const env = Object.freeze({ CRM_PIPELINE_OWNER_REF_SECRET: "A".repeat(64) });
const now = () => 1_777_000_000_000;
const results = [];
function check(name, operation, expectedCode = null) {
  let code = null;
  try { operation(); } catch (error) { code = error instanceof OwnerCatalogContractError ? error.code : error.name; }
  const passed = expectedCode === null ? code === null : code === expectedCode;
  results.push({ name, passed });
  assert.equal(passed, true, `${name}: ${code ?? "NO_ERROR"}`);
}

function seededRandomFactory(seed) {
  let counter = 0;
  return (size) => {
    const chunks = [];
    let length = 0;
    while (length < size) {
      const chunk = createHash("sha256").update(`${seed}:${counter++}`, "utf8").digest();
      chunks.push(chunk);
      length += chunk.length;
    }
    return Buffer.concat(chunks).subarray(0, size);
  };
}

function fixture(seed, count = 100) {
  const run = `owner-catalog-diag-${createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 16)}`;
  const identities = Array.from({ length: count }, (_, index) => ({
    tenantId: `${run}-tenant-1`,
    membershipId: `${run}-m-1-${index + 1}`,
    userId: `${run}-u-1-${index + 1}`,
  }));
  const refs = issueCrmOwnerRefs(identities, { env, now, random: seededRandomFactory(seed) });
  const data = refs.map((ownerRef, index) => ({ displayName: `Vendedor ${String(index + 1).padStart(4, "0")}`, ownerRef, role: "V" }));
  const forbiddenValues = identities.flatMap((identity, index) => [
    { kind: "TENANT_ID", value: identity.tenantId },
    { kind: "MEMBERSHIP_ID", value: identity.membershipId },
    { kind: "USER_ID", value: identity.userId },
    { kind: "EMAIL", value: `seller-${index + 1}@example.test` },
    { kind: "PHONE", value: `809555${String(index).padStart(4, "0")}` },
  ]);
  const verifyOwnerRef = (value) => readCrmOwnerRef(value, { env, now });
  return { data, identities, forbiddenValues, verifyOwnerRef };
}

const requiredSeed = "owner-catalog-seed-000107";
const required = fixture(requiredSeed);
const incidental = required.data.find((entry) => /phone|email|userId/i.test(entry.ownerRef));
check("semilla requerida genera coincidencia criptográfica incidental", () => assert.ok(incidental));
check("ciphertext incidental cumple contrato estructural", () => assertOwnerCatalogContract(required.data, required));

for (let index = 1; index <= 1_000; index += 1) {
  const seeded = fixture(`owner-catalog-seed-${String(index).padStart(6, "0")}`, 5);
  assertOwnerCatalogContract(seeded.data, seeded);
}
results.push({ name: "1.000 generaciones deterministas", passed: true });

const base = fixture("owner-catalog-negative-seed", 1);
const mutate = (patch) => [{ ...base.data[0], ...patch }];
const contract = (data) => assertOwnerCatalogContract(data, base);
check("clave prohibida", () => contract(mutate({ membershipId: "internal" })), "FORBIDDEN_FIELD_NAME");
check("email real bajo displayName", () => contract(mutate({ displayName: base.forbiddenValues.find((item) => item.kind === "EMAIL").value })), "FIXTURE_VALUE_EXPOSED:EMAIL");
check("teléfono real bajo displayName", () => contract(mutate({ displayName: base.forbiddenValues.find((item) => item.kind === "PHONE").value })), "FIXTURE_VALUE_EXPOSED:PHONE");
const plaintextParts = base.data[0].ownerRef.split(".");
plaintextParts[2] = base.identities[0].membershipId;
check("PK en texto plano dentro de ownerRef", () => contract(mutate({ ownerRef: plaintextParts.join(".") })), "FIXTURE_VALUE_EXPOSED:MEMBERSHIP_ID");
check("ownerRef igual a User ID", () => contract(mutate({ ownerRef: base.identities[0].userId })), "FIXTURE_VALUE_EXPOSED:USER_ID");
check("ownerRef igual a Membership ID", () => contract(mutate({ ownerRef: base.identities[0].membershipId })), "FIXTURE_VALUE_EXPOSED:MEMBERSHIP_ID");
check("ownerRef igual a Tenant ID", () => contract(mutate({ ownerRef: base.identities[0].tenantId })), "FIXTURE_VALUE_EXPOSED:TENANT_ID");
check("ownerRef truncado", () => contract(mutate({ ownerRef: base.data[0].ownerRef.slice(0, -1) })), "OWNER_REF_FORMAT_INVALID");
const manipulated = `${base.data[0].ownerRef.slice(0, -1)}${base.data[0].ownerRef.endsWith("A") ? "B" : "A"}`;
check("ownerRef manipulado", () => contract(mutate({ ownerRef: manipulated })), "OWNER_REF_CRYPTOGRAPHICALLY_INVALID");
check("ownerRef con formato inválido", () => contract(mutate({ ownerRef: "not-an-owner-reference" })), "OWNER_REF_FORMAT_INVALID");
check("propiedad adicional", () => contract(mutate({ harmless: "visible" })), "CATALOG_FIELDS_INVALID");
check("PII bajo clave aparentemente inocente", () => contract(mutate({ displayName: base.forbiddenValues.find((item) => item.kind === "EMAIL").value })), "FIXTURE_VALUE_EXPOSED:EMAIL");
check("clave prohibida anidada", () => contract(mutate({ metadata: { profile: { uuid: "internal" } } })), "FORBIDDEN_FIELD_NAME");

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, deterministicGenerations: 1_000, requiredSeed, results })}\n`);
