const TOP_LEVEL_FIELDS = Object.freeze(["displayName", "ownerRef", "role"]);
const FORBIDDEN_FIELD_NAMES = new Set([
  "membershipid",
  "userid",
  "tenantid",
  "email",
  "phone",
  "id",
  "pk",
  "cuid",
  "uuid",
  "publicref",
]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_OWNER_REF_LENGTH = 1_024;

export class OwnerCatalogContractError extends Error {
  constructor(code, path) {
    super(code);
    this.name = "OwnerCatalogContractError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new OwnerCatalogContractError(code, path);
}

function canonicalBase64url(value, expectedBytes, path) {
  if (!BASE64URL.test(value)) fail("OWNER_REF_FORMAT_INVALID", path);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    fail("OWNER_REF_FORMAT_INVALID", path);
  }
  return decoded;
}

function assertNoForbiddenFields(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [field, nested] of Object.entries(value)) {
    const normalized = field.toLowerCase();
    if (FORBIDDEN_FIELD_NAMES.has(normalized) || normalized.endsWith("id")) {
      fail("FORBIDDEN_FIELD_NAME", `${path}.${field}`);
    }
    assertNoForbiddenFields(nested, `${path}.${field}`);
  }
}

function assertNoFixtureValues(value, forbiddenValues, path, { ownerRef = false } = {}) {
  if (typeof value !== "string") return;
  for (const fixture of forbiddenValues) {
    if (typeof fixture.value !== "string" || fixture.value.length === 0) continue;
    const exposed = ownerRef ? fixture.value.length >= 8 && value.includes(fixture.value) : value === fixture.value;
    if (exposed) fail(`FIXTURE_VALUE_EXPOSED:${fixture.kind}`, path);
  }
}

export function assertOpaqueOwnerRef(value, { path, forbiddenValues, verifyOwnerRef }) {
  if (typeof value !== "string") {
    fail("OWNER_REF_FORMAT_INVALID", path);
  }
  assertNoFixtureValues(value, forbiddenValues, path, { ownerRef: true });
  if (value.length < 32 || value.length > MAX_OWNER_REF_LENGTH || value !== value.trim()) {
    fail("OWNER_REF_FORMAT_INVALID", path);
  }
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "or1") fail("OWNER_REF_FORMAT_INVALID", path);
  canonicalBase64url(parts[1], 12, path);
  const ciphertext = canonicalBase64url(parts[2], null, path);
  canonicalBase64url(parts[3], 16, path);
  if (ciphertext.length < 1) fail("OWNER_REF_FORMAT_INVALID", path);
  try {
    verifyOwnerRef(value);
  } catch {
    fail("OWNER_REF_CRYPTOGRAPHICALLY_INVALID", path);
  }
}

export function assertOwnerCatalogContract(data, { forbiddenValues = [], verifyOwnerRef }) {
  if (!Array.isArray(data) || typeof verifyOwnerRef !== "function") fail("CATALOG_INVALID", "$");
  assertNoForbiddenFields(data);
  data.forEach((entry, index) => {
    const path = `$[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== [...TOP_LEVEL_FIELDS].sort().join(",")) {
      fail("CATALOG_FIELDS_INVALID", path);
    }
    if (typeof entry.displayName !== "string" || entry.displayName.length < 1 || entry.displayName.length > 191) {
      fail("DISPLAY_NAME_INVALID", `${path}.displayName`);
    }
    assertNoFixtureValues(entry.displayName, forbiddenValues, `${path}.displayName`);
    if (entry.role !== "V") fail("ROLE_INVALID", `${path}.role`);
    assertOpaqueOwnerRef(entry.ownerRef, { path: `${path}.ownerRef`, forbiddenValues, verifyOwnerRef });
  });
  return Object.freeze({ entries: data.length, fields: TOP_LEVEL_FIELDS.length });
}
