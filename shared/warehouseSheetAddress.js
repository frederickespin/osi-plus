// Shared presentation rules for the worksheet. Persisted location identities,
// permissions and code allocation remain server responsibilities.
export const WAREHOUSE_ADDRESS_KINDS = Object.freeze(["WAREHOUSE_ROOT", "ZONE", "AISLE", "RACK", "LEVEL", "BIN"]);
export const WAREHOUSE_ADDRESS_LIMITS = Object.freeze({ WAREHOUSE_ROOT: 99, ZONE: 999, AISLE: 99, RACK: 676, LEVEL: 9, BIN: 4 });
const fields = Object.freeze({ ZONE: "zoneNumber", AISLE: "aisleNumber", RACK: "rackCode", LEVEL: "levelNumber", BIN: "positionNumber" });
const empty = Object.freeze({ zoneNumber: 0, aisleNumber: 0, rackCode: null, levelNumber: 0, positionNumber: 0 });

function fail(code) {
  const error = new Error(code);
  error.name = "WarehouseAddressError";
  error.code = code;
  throw error;
}

function requireOrdinal(kind, ordinal) {
  if (!Object.hasOwn(WAREHOUSE_ADDRESS_LIMITS, kind) || !Number.isSafeInteger(ordinal)
    || ordinal < 1 || ordinal > WAREHOUSE_ADDRESS_LIMITS[kind]) fail("ADDRESS_INPUT_INVALID");
}

function validatedSegments(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("ADDRESS_INPUT_INVALID");
  const { warehouseNumber, zoneNumber, aisleNumber, rackCode, levelNumber, positionNumber } = value;
  const zoneCode = value.zoneCode ?? null;
  for (const [number, minimum, maximum] of [
    [warehouseNumber, 1, 99], [zoneNumber, 0, 999], [aisleNumber, 0, 99], [levelNumber, 0, 9], [positionNumber, 0, 4],
  ]) if (!Number.isSafeInteger(number) || number < minimum || number > maximum) fail("ADDRESS_INPUT_INVALID");
  if (zoneCode !== null && (typeof zoneCode !== "string" || !/^[A-Z0-9]{3}$/u.test(zoneCode) || !/[A-Z]/u.test(zoneCode) || zoneNumber !== 0)) fail("ADDRESS_INPUT_INVALID");
  if (rackCode !== null && (typeof rackCode !== "string" || !/^[A-Z]{2}$/u.test(rackCode))) fail("ADDRESS_INPUT_INVALID");
  if (levelNumber > 0 && rackCode === null) fail("HIERARCHY_INVALID");
  return { warehouseNumber, zoneNumber, ...(value.zoneCode !== undefined ? { zoneCode } : {}), aisleNumber, rackCode, levelNumber, positionNumber };
}

export function warehouseAddressToken(kind, ordinal) {
  requireOrdinal(kind, ordinal);
  if (kind === "RACK") {
    const index = ordinal - 1;
    return String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  }
  return String(ordinal).padStart(kind === "ZONE" ? 3 : ["WAREHOUSE_ROOT", "AISLE"].includes(kind) ? 2 : 1, "0");
}

/** Convert an already allocated canonical segment back to its ordinal. */
export function warehouseAddressOrdinal(kind, token) {
  if (typeof token !== "string") fail("ADDRESS_INPUT_INVALID");
  const ordinal = kind === "RACK" && /^[A-Z]{2}$/u.test(token)
    ? (token.charCodeAt(0) - 65) * 26 + token.charCodeAt(1) - 64
    : /^\d+$/u.test(token) ? Number(token) : NaN;
  requireOrdinal(kind, ordinal);
  if (warehouseAddressToken(kind, ordinal) !== token) fail("ADDRESS_INPUT_INVALID");
  return ordinal;
}

/** Normalize an individual worksheet identifier, never a complete location code. */
export function normalizeWarehouseAddressIdentifier(kind, raw, { allowDisabled = false } = {}) {
  if (!WAREHOUSE_ADDRESS_KINDS.includes(kind) || typeof raw !== "string") fail("ADDRESS_INPUT_INVALID");
  let token = raw.trim().toUpperCase();
  const width = kind === "ZONE" ? 3 : ["WAREHOUSE_ROOT", "AISLE", "RACK"].includes(kind) ? 2 : 1;
  if (allowDisabled && kind !== "WAREHOUSE_ROOT" && (token === "" || /^0+$/u.test(token))) return "0".repeat(width);
  if (kind === "ZONE" && /[A-Z]/u.test(token)) {
    if (!/^[A-Z0-9]{3}$/u.test(token)) fail("ADDRESS_INPUT_INVALID");
    return token;
  }
  if (kind !== "RACK" && /^\d+$/u.test(token) && token.length <= width) token = token.padStart(width, "0");
  warehouseAddressOrdinal(kind, token);
  return token;
}

/** Read the fixed-width segment, including the zero marker of an omitted level. */
export function warehouseAddressIdentifier(kind, value) {
  const address = validatedSegments(value);
  if (!WAREHOUSE_ADDRESS_KINDS.includes(kind)) fail("ADDRESS_INPUT_INVALID");
  if (kind === "WAREHOUSE_ROOT") return warehouseAddressToken(kind, address.warehouseNumber);
  if (kind === "ZONE") return address.zoneCode ?? String(address.zoneNumber).padStart(3, "0");
  if (kind === "RACK") return address.rackCode ?? "00";
  return String(address[fields[kind]]).padStart(kind === "AISLE" ? 2 : 1, "0");
}

/** Zero denotes an omitted level, never a physical node to allocate. */
export function allocateWarehouseAddressOrdinal(kind, usedOrdinals) {
  requireOrdinal(kind, 1);
  if (usedOrdinals == null || typeof usedOrdinals[Symbol.iterator] !== "function") fail("ADDRESS_INPUT_INVALID");
  const used = new Set(usedOrdinals);
  for (const value of used) requireOrdinal(kind, value);
  for (let ordinal = 1; ordinal <= WAREHOUSE_ADDRESS_LIMITS[kind]; ordinal += 1) {
    if (!used.has(ordinal)) return ordinal;
  }
  fail("ADDRESS_CAPACITY_EXCEEDED");
}

/** Ancestors are ordered from the warehouse root to the proposed parent. */
export function canPlaceWarehouseAddressKind(kind, ancestorKinds) {
  if (!Array.isArray(ancestorKinds) || !WAREHOUSE_ADDRESS_KINDS.includes(kind)) return false;
  if (kind === "WAREHOUSE_ROOT") return ancestorKinds.length === 0;
  if (ancestorKinds.length === 0 || ancestorKinds[0] !== "WAREHOUSE_ROOT") return false;
  let priorRank = -1;
  let hasRack = false;
  for (const ancestor of [...ancestorKinds, kind]) {
    const rank = WAREHOUSE_ADDRESS_KINDS.indexOf(ancestor);
    if (rank <= priorRank || rank < 0 || ancestor === "LEVEL" && !hasRack) return false;
    if (ancestor === "RACK") hasRack = true;
    priorRank = rank;
  }
  return true;
}

/** Construct one new address beneath a validated, already addressed parent. */
export function warehouseAddressSegments(parentAddress, kind, ordinal) {
  requireOrdinal(kind, ordinal);
  if (kind === "WAREHOUSE_ROOT") {
    if (parentAddress !== null) fail("HIERARCHY_INVALID");
    return Object.freeze({ warehouseNumber: ordinal, ...empty });
  }
  const parent = validatedSegments(parentAddress);
  const ancestors = ["WAREHOUSE_ROOT", ...Object.entries(fields).filter(([type, field]) => parent[field] !== empty[field] || type === "ZONE" && parent.zoneCode != null).map(([type]) => type)];
  if (!canPlaceWarehouseAddressKind(kind, ancestors)) fail("HIERARCHY_INVALID");
  const next = { ...parent };
  const rank = WAREHOUSE_ADDRESS_KINDS.indexOf(kind);
  for (const [type, field] of Object.entries(fields)) {
    if (WAREHOUSE_ADDRESS_KINDS.indexOf(type) > rank) next[field] = empty[field];
  }
  next[fields[kind]] = kind === "RACK" ? warehouseAddressToken(kind, ordinal) : ordinal;
  if (kind === "ZONE" && Object.hasOwn(next, "zoneCode")) next.zoneCode = null;
  return Object.freeze(next);
}

/** Explicit active segments preserve the same omitted-level and inheritance rules. */
export function warehouseAddressSegmentsFromIdentifier(parentAddress, kind, identifier) {
  if (normalizeWarehouseAddressIdentifier(kind, identifier) !== identifier) fail("ADDRESS_INPUT_INVALID");
  if (kind === "ZONE" && /[A-Z]/u.test(identifier)) {
    return Object.freeze({ ...warehouseAddressSegments(parentAddress, kind, 1), zoneNumber: 0, zoneCode: identifier });
  }
  return warehouseAddressSegments(parentAddress, kind, warehouseAddressOrdinal(kind, identifier));
}

export function formatWarehouseAddress(value) {
  const address = validatedSegments(value);
  return `ALM-${String(address.warehouseNumber).padStart(2, "0")}-${address.zoneCode ?? String(address.zoneNumber).padStart(3, "0")}-${String(address.aisleNumber).padStart(2, "0")}-${address.rackCode ?? "00"}-${address.levelNumber}-${address.positionNumber}`;
}
