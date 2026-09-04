import { createHash } from "node:crypto";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MODES = new Set(["SEA", "AIR", "ROAD", "LOCAL", "STORAGE"]);
const CONDITIONS = new Set(["GOOD", "USED", "DAMAGED", "PRE_EXISTING_DAMAGE"]);
const FLAGS = new Set([
  "CRATING_CANDIDATE",
  "FRAGILE",
  "ASSEMBLE",
  "DISASSEMBLE",
  "CRANE_CANDIDATE",
  "VALUABLE",
  "OVERSIZED",
]);
const ACCESS_SIDES = new Set(["ORIGIN", "DESTINATION"]);
const ACCESS_FLAGS = new Set([
  "STAIRS",
  "PASSENGER_ELEVATOR",
  "FREIGHT_ELEVATOR",
  "ITEM_DOES_NOT_FIT_ELEVATOR",
  "NARROW_PASSAGE",
  "LONG_CARRY",
  "RESTRICTED_PARKING",
  "LOADING_DOCK",
  "RESTRICTED_HOURS",
  "PERMIT_REQUIRED",
  "CRANE_OR_HOIST",
  "TRANSSHIPMENT",
]);
const PHOTO_PURPOSES = new Set([
  "ITEM",
  "DAMAGE",
  "ORIGIN_ACCESS",
  "DESTINATION_ACCESS",
  "SPECIAL_CONDITION",
  "GENERAL",
]);
const CONDITION_KINDS = new Set(["FACILITY", "INCONVENIENCE"]);

export class CrmSurveyError extends Error {
  constructor(code, status, options) {
    super(code, options);
    this.name = "CrmSurveyError";
    this.code = code;
    this.status = status;
  }
}
export function surveyFail(code, status = 400) {
  throw new CrmSurveyError(code, status);
}
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}
export function canonicalPayloadHash(value) {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return value;
}
function exact(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    surveyFail("CRM_SURVEY_INPUT_INVALID");
}
function text(value, { max = 320, optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === ""))
    return null;
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > max
  )
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return value;
}
function uuid(value) {
  const result = text(value, { max: 36 });
  if (!UUID_V4.test(result)) surveyFail("CRM_SURVEY_RESOURCE_NOT_FOUND", 404);
  return result;
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return value;
}
function decimal(value, min, max, optional = true) {
  if (optional && (value === null || value === undefined)) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return value;
}
function boolean(value) {
  if (typeof value !== "boolean") surveyFail("CRM_SURVEY_INPUT_INVALID");
  return value;
}
function enumValue(value, allowed) {
  const result = text(value, { max: 80 });
  if (!allowed.has(result)) surveyFail("CRM_SURVEY_INPUT_INVALID");
  return result;
}
function enumList(value, allowed, max = 16) {
  if (!Array.isArray(value) || value.length > max)
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  const list = value.map((item) => enumValue(item, allowed));
  if (new Set(list).size !== list.length)
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return Object.freeze(list);
}
function timestamp(value) {
  const result = text(value, { max: 40 });
  const date = new Date(result);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== result)
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return result;
}
function command(value, operation, payload) {
  const requestId = text(value.requestId, { max: 191 });
  const payloadHash = text(value.payloadHash, { max: 64 });
  const rawPayload = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["requestId", "payloadHash", "operation"].includes(key),
    ),
  );
  if (
    !SHA256.test(payloadHash) ||
    payloadHash !==
      canonicalPayloadHash({ operation, requestId, ...rawPayload })
  )
    surveyFail("CRM_SURVEY_PAYLOAD_HASH_MISMATCH", 400);
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}

function code(value) {
  const result = text(value, { max: 64 });
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(result))
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return result;
}

export function normalizeCatalogCreate(input) {
  const value = object(input);
  exact(value, [
    "requestId",
    "payloadHash",
    "expectedLatestVersion",
    "articles",
    "areas",
    "conditions",
  ]);
  if (
    !Array.isArray(value.articles) ||
    value.articles.length < 1 ||
    value.articles.length > 500 ||
    !Array.isArray(value.areas) ||
    value.areas.length < 1 ||
    value.areas.length > 100 ||
    !Array.isArray(value.conditions) ||
    value.conditions.length > 100
  )
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  const articles = value.articles.map((entry, sortOrder) => {
    const row = object(entry);
    exact(row, [
      "code",
      "name",
      "aliases",
      "frequentAreaCodes",
      "defaultVolumeM3",
      "defaultWeightKg",
    ]);
    if (
      !Array.isArray(row.aliases) ||
      row.aliases.length > 20 ||
      !Array.isArray(row.frequentAreaCodes) ||
      row.frequentAreaCodes.length > 20
    )
      surveyFail("CRM_SURVEY_INPUT_INVALID");
    return Object.freeze({
      code: code(row.code),
      name: text(row.name, { max: 160 }),
      aliases: Object.freeze(
        row.aliases.map((item) => text(item, { max: 80 })),
      ),
      frequentAreaCodes: Object.freeze(row.frequentAreaCodes.map(code)),
      defaultVolumeM3: decimal(row.defaultVolumeM3, 0, 1_000_000),
      defaultWeightKg: decimal(row.defaultWeightKg, 0, 1_000_000),
      sortOrder,
    });
  });
  const areas = value.areas.map((entry, sortOrder) => {
    const row = object(entry);
    exact(row, ["code", "name"]);
    return Object.freeze({
      code: code(row.code),
      name: text(row.name, { max: 120 }),
      sortOrder,
    });
  });
  const conditions = value.conditions.map((entry, sortOrder) => {
    const row = object(entry);
    exact(row, ["code", "name", "kind"]);
    return Object.freeze({
      code: code(row.code),
      name: text(row.name, { max: 160 }),
      kind: enumValue(row.kind, CONDITION_KINDS),
      sortOrder,
    });
  });
  for (const rows of [articles, areas, conditions])
    if (new Set(rows.map((row) => row.code)).size !== rows.length)
      surveyFail("CRM_SURVEY_INPUT_INVALID");
  const areaCodes = new Set(areas.map((row) => row.code));
  if (
    articles.some((row) =>
      row.frequentAreaCodes.some((areaCode) => !areaCodes.has(areaCode)),
    )
  )
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return command(value, "CATALOG_CREATE", {
    expectedLatestVersion: integer(value.expectedLatestVersion, 0, 1_000_000),
    articles: Object.freeze(articles),
    areas: Object.freeze(areas),
    conditions: Object.freeze(conditions),
  });
}

export function normalizeAssignmentCreate(input) {
  const value = object(input);
  exact(value, [
    "requestId",
    "payloadHash",
    "caseRef",
    "serviceSelectionRef",
    "evaluatorMembershipRef",
    "scheduledStart",
    "scheduledEnd",
    "instruction",
  ]);
  const payload = {
    caseRef: uuid(value.caseRef),
    serviceSelectionRef: uuid(value.serviceSelectionRef),
    evaluatorMembershipRef: uuid(value.evaluatorMembershipRef),
    scheduledStart: timestamp(value.scheduledStart),
    scheduledEnd:
      value.scheduledEnd === null ? null : timestamp(value.scheduledEnd),
    instruction: text(value.instruction, { max: 1000, optional: true }),
  };
  if (
    payload.scheduledEnd &&
    new Date(payload.scheduledEnd) <= new Date(payload.scheduledStart)
  )
    surveyFail("CRM_SURVEY_INPUT_INVALID");
  return command(value, "ASSIGNMENT_CREATE", payload);
}
export function normalizeAssignmentAction(input) {
  const value = object(input);
  exact(value, ["requestId", "payloadHash", "operation", "expectedVersion"]);
  const operation = enumValue(
    value.operation,
    new Set([
      "ARRIVAL_RECORD",
      "PUNCTUALITY_CONFIRM",
      "START_SURVEY",
      "CANCEL_ASSIGNMENT",
    ]),
  );
  return command(value, operation, {
    expectedVersion: integer(value.expectedVersion, 1, 1_000_000),
  });
}
function dimensions(value) {
  if (value === null || value === undefined) return null;
  const row = object(value);
  exact(row, ["unit", "length", "width", "height"]);
  const unit = enumValue(row.unit, new Set(["CM", "IN"]));
  const original = {
    unit,
    length: decimal(row.length, 0.01, 100_000, false),
    width: decimal(row.width, 0.01, 100_000, false),
    height: decimal(row.height, 0.01, 100_000, false),
  };
  const factor = unit === "IN" ? 2.54 : 1;
  return Object.freeze({
    original,
    lengthCm: original.length * factor,
    widthCm: original.width * factor,
    heightCm: original.height * factor,
  });
}
export function normalizeDraftMutation(input) {
  const value = object(input);
  const operation = text(value.operation, { max: 80 });
  if (operation === "UPSERT_ITEM") {
    exact(value, [
      "requestId",
      "payloadHash",
      "operation",
      "expectedDraftVersion",
      "itemRef",
      "expectedItemVersion",
      "articleRef",
      "areaRef",
      "shipmentMode",
      "quantity",
      "condition",
      "flags",
      "dimensions",
      "note",
    ]);
    const payload = {
      expectedDraftVersion: integer(value.expectedDraftVersion, 1, 1_000_000),
      itemRef: value.itemRef === null ? null : uuid(value.itemRef),
      expectedItemVersion:
        value.expectedItemVersion === null
          ? null
          : integer(value.expectedItemVersion, 1, 1_000_000),
      articleRef: uuid(value.articleRef),
      areaRef: uuid(value.areaRef),
      shipmentMode: enumValue(value.shipmentMode, MODES),
      quantity: integer(value.quantity, 1, 999),
      condition: enumValue(value.condition, CONDITIONS),
      flags: enumList(value.flags, FLAGS),
      dimensions: dimensions(value.dimensions),
      note: text(value.note, { max: 1000, optional: true }),
    };
    return command(value, operation, payload);
  }
  if (operation === "DELETE_ITEM") {
    exact(value, [
      "requestId",
      "payloadHash",
      "operation",
      "expectedDraftVersion",
      "itemRef",
      "expectedItemVersion",
    ]);
    return command(value, operation, {
      expectedDraftVersion: integer(value.expectedDraftVersion, 1, 1_000_000),
      itemRef: uuid(value.itemRef),
      expectedItemVersion: integer(value.expectedItemVersion, 1, 1_000_000),
    });
  }
  if (operation === "SAVE_ACCESS") {
    exact(value, [
      "requestId",
      "payloadHash",
      "operation",
      "expectedDraftVersion",
      "expectedAccessVersion",
      "side",
      "floorNumber",
      "stairsFloors",
      "elevatorAvailable",
      "elevatorFloor",
      "parkingDistanceM",
      "flags",
      "notes",
    ]);
    return command(value, operation, {
      expectedDraftVersion: integer(value.expectedDraftVersion, 1, 1_000_000),
      expectedAccessVersion:
        value.expectedAccessVersion === null
          ? null
          : integer(value.expectedAccessVersion, 1, 1_000_000),
      side: enumValue(value.side, ACCESS_SIDES),
      floorNumber:
        value.floorNumber === null
          ? null
          : integer(value.floorNumber, -10, 250),
      stairsFloors:
        value.stairsFloors === null
          ? null
          : integer(value.stairsFloors, 0, 250),
      elevatorAvailable:
        value.elevatorAvailable === null
          ? null
          : boolean(value.elevatorAvailable),
      elevatorFloor:
        value.elevatorFloor === null
          ? null
          : integer(value.elevatorFloor, -10, 250),
      parkingDistanceM: decimal(value.parkingDistanceM, 0, 1_000_000),
      flags: enumList(value.flags, ACCESS_FLAGS),
      notes: text(value.notes, { max: 1000, optional: true }),
    });
  }
  if (operation === "MARK_READY") {
    exact(value, [
      "requestId",
      "payloadHash",
      "operation",
      "expectedDraftVersion",
      "notes",
    ]);
    return command(value, operation, {
      expectedDraftVersion: integer(value.expectedDraftVersion, 1, 1_000_000),
      notes: text(value.notes, { max: 2000, optional: true }),
    });
  }
  surveyFail("CRM_SURVEY_INPUT_INVALID");
}
export function normalizePublish(input) {
  const value = object(input);
  exact(value, [
    "requestId",
    "payloadHash",
    "expectedDraftVersion",
    "signerName",
    "relationship",
    "signatureStrokes",
  ]);
  if (
    !Array.isArray(value.signatureStrokes) ||
    value.signatureStrokes.length < 1 ||
    value.signatureStrokes.length > 64
  )
    surveyFail("CRM_SURVEY_SIGNATURE_REQUIRED", 409);
  let pointCount = 0;
  const signatureStrokes = value.signatureStrokes.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 2048)
      surveyFail("CRM_SURVEY_INPUT_INVALID");
    return stroke.map((point) => {
      const row = object(point);
      exact(row, ["x", "y"]);
      pointCount += 1;
      return Object.freeze({
        x: decimal(row.x, 0, 1, false),
        y: decimal(row.y, 0, 1, false),
      });
    });
  });
  if (pointCount > 8192) surveyFail("CRM_SURVEY_INPUT_INVALID");
  const payload = {
    expectedDraftVersion: integer(value.expectedDraftVersion, 1, 1_000_000),
    signerName: text(value.signerName, { max: 160 }),
    relationship: text(value.relationship, { max: 120 }),
    signatureStrokes: Object.freeze(signatureStrokes.map(Object.freeze)),
  };
  return command(value, "PUBLISH_SURVEY", payload);
}
export function normalizePhotoMetadata(value) {
  const purpose = enumValue(value.purpose, PHOTO_PURPOSES);
  const itemRef = value.itemRef ? uuid(value.itemRef) : null;
  const accessRef = value.accessRef ? uuid(value.accessRef) : null;
  if (
    purpose === "GENERAL"
      ? itemRef || accessRef
      : ["ITEM", "DAMAGE", "SPECIAL_CONDITION"].includes(purpose)
        ? !itemRef || accessRef
        : itemRef || !accessRef
  )
    surveyFail("CRM_SURVEY_PHOTO_CONTEXT_INVALID", 409);
  return Object.freeze({ purpose, itemRef, accessRef });
}
export function normalizePhotoCommand(input) {
  const value = object(input);
  exact(value, [
    "requestId",
    "payloadHash",
    "purpose",
    "itemRef",
    "accessRef",
    "mimeType",
    "sizeBytes",
    "sha256",
  ]);
  const metadata = normalizePhotoMetadata(value);
  const mimeType = text(value.mimeType, { max: 80 });
  const sizeBytes = integer(value.sizeBytes, 1, 12 * 1024 * 1024);
  const sha256 = text(value.sha256, { max: 64 });
  if (!SHA256.test(sha256)) surveyFail("CRM_SURVEY_INPUT_INVALID");
  return command(value, "PHOTO_ATTACH", {
    ...metadata,
    mimeType,
    sizeBytes,
    sha256,
  });
}
export function assertPublicSurveyRef(value) {
  return uuid(value);
}
