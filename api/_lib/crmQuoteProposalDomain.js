import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const HASH = /^[0-9a-f]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const REFERENCE = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const MONEY = /^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$/;
const QUANTITY = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/;
const RATE = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/;

const ROOT_FIELDS = new Set([
  "requestId", "payloadHash", "caseRef", "currency", "minimumOwnMarginBps",
  "destinationStatus", "operationalFacts", "exchange", "proposals",
]);
const UNSIGNED_ROOT_FIELDS = new Set([...ROOT_FIELDS].filter((field) => field !== "payloadHash"));
const OPERATIONAL_FACT_FIELDS = new Set(["volumeSource", "volumeCbm", "sourceRef", "sourceVersion"]);
const EXCHANGE_FIELDS = new Set(["foreignCurrency", "fixedRate", "currentRate", "foreignExposure"]);
const PROPOSAL_FIELDS = new Set(["slot", "reference", "name", "status", "lineItems"]);
const LINE_FIELDS = new Set([
  "reference", "catalogCode", "description", "quantity", "unit", "economicClass",
  "source", "unitCost", "suggestedUnitPrice", "quotedUnitPrice",
]);
const SOURCE_FIELDS = new Set(["kind", "reference", "version", "status"]);

const DESTINATION_STATUSES = new Set(["CONFIRMED", "APPROXIMATE", "PENDING"]);
const VOLUME_SOURCES = new Set(["NONE", "SURVEY_PUBLISHED", "CLIENT_PROVIDED"]);
const PROPOSAL_STATUSES = new Set(["DRAFT", "READY", "SENT", "APPROVED", "REJECTED", "EXPIRED"]);
const ECONOMIC_CLASSES = new Set(["OWN", "EXTERNAL", "DISBURSEMENT"]);
const SOURCE_KINDS = new Set([
  "SERVICE", "SURVEY", "LOGISTIC_ENGINE", "CRATING", "PERMIT", "THIRD_PARTY",
  "FREIGHT", "CUSTOMS", "TARIFF", "REFERRAL", "COMMERCIAL_RELATION", "MANUAL",
  "FX_COMPENSATION",
]);
const SOURCE_STATUSES = new Set(["CONFIRMED", "PENDING"]);

export const CRM_QUOTE_PROPOSAL_RUNTIME = Object.freeze({
  productionApiEnabled: false,
  persistenceEnabled: false,
  runtimeConsumers: 0,
  canonicalHeader: "PipelineCaseQuote",
  legacyQuoteAuthority: false,
  taxComputationEnabled: false,
});

export class CrmQuoteProposalError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "CrmQuoteProposalError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new CrmQuoteProposalError(code, status);
}

function exactObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CRM_QUOTE_INPUT_INVALID");
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) fail("CRM_QUOTE_INPUT_INVALID");
}

function cleanText(value, { min = 1, max = 240, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value !== value.trim() || value !== value.normalize("NFC")
    || value.length < min || value.length > max || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) {
    fail("CRM_QUOTE_INPUT_INVALID");
  }
  return value;
}

function enumValue(value, allowed) {
  const normalized = cleanText(value, { max: 80 });
  if (!allowed.has(normalized)) fail("CRM_QUOTE_INPUT_INVALID");
  return normalized;
}

function positiveInteger(value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail("CRM_QUOTE_INPUT_INVALID");
  return value;
}

function nonnegativeInteger(value, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail("CRM_QUOTE_INPUT_INVALID");
  return value;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function hashCrmQuoteProposalPayload(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function decimalToMinor(value, pattern, scale, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !pattern.test(value)) fail("CRM_QUOTE_INPUT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * (10n ** BigInt(scale))) + BigInt((fraction + "0".repeat(scale)).slice(0, scale));
}

function minorToDecimal(value, scale) {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fraction = String(value % divisor).padStart(scale, "0");
  return `${whole}.${fraction}`;
}

function multiplyQuantityMoney(quantityMinor, moneyMinor) {
  return (quantityMinor * moneyMinor + 500n) / 1000n;
}

function normalizeOperationalFacts(input) {
  exactObject(input, OPERATIONAL_FACT_FIELDS);
  const volumeSource = enumValue(input.volumeSource, VOLUME_SOURCES);
  if (volumeSource === "NONE") {
    if (input.volumeCbm !== null || input.sourceRef !== null || input.sourceVersion !== null) {
      fail("CRM_QUOTE_VOLUME_SOURCE_INVALID");
    }
    return Object.freeze({ volumeSource, volumeCbm: null, sourceRef: null, sourceVersion: null });
  }
  const volumeCbm = decimalToMinor(input.volumeCbm, QUANTITY, 3);
  if (volumeCbm <= 0n) fail("CRM_QUOTE_VOLUME_SOURCE_INVALID");
  const sourceRef = cleanText(input.sourceRef, { min: 3, max: 120 });
  const sourceVersion = positiveInteger(input.sourceVersion, 1_000_000);
  return Object.freeze({ volumeSource, volumeCbm: minorToDecimal(volumeCbm, 3), sourceRef, sourceVersion });
}

function normalizeExchange(input, quoteCurrency) {
  if (input === null) return null;
  exactObject(input, EXCHANGE_FIELDS);
  const foreignCurrency = cleanText(input.foreignCurrency, { min: 3, max: 3 });
  if (!CURRENCY.test(foreignCurrency) || foreignCurrency === quoteCurrency) fail("CRM_QUOTE_EXCHANGE_INVALID");
  const fixedRate = decimalToMinor(input.fixedRate, RATE, 6);
  const currentRate = decimalToMinor(input.currentRate, RATE, 6);
  const foreignExposure = decimalToMinor(input.foreignExposure, MONEY, 2);
  if (fixedRate <= 0n || currentRate <= 0n) fail("CRM_QUOTE_EXCHANGE_INVALID");
  const unfavorableDifference = currentRate > fixedRate ? currentRate - fixedRate : 0n;
  const compensationMinor = (foreignExposure * unfavorableDifference + 500_000n) / 1_000_000n;
  return Object.freeze({
    foreignCurrency,
    fixedRate: minorToDecimal(fixedRate, 6),
    currentRate: minorToDecimal(currentRate, 6),
    foreignExposure: minorToDecimal(foreignExposure, 2),
    suggestedCompensation: minorToDecimal(compensationMinor, 2),
  });
}

function normalizeSource(input) {
  exactObject(input, SOURCE_FIELDS);
  return Object.freeze({
    kind: enumValue(input.kind, SOURCE_KINDS),
    reference: cleanText(input.reference, { min: 3, max: 120 }),
    version: positiveInteger(input.version, 1_000_000),
    status: enumValue(input.status, SOURCE_STATUSES),
  });
}

function normalizeLine(input) {
  exactObject(input, LINE_FIELDS);
  const source = normalizeSource(input.source);
  const quantityMinor = decimalToMinor(input.quantity, QUANTITY, 3);
  if (quantityMinor <= 0n) fail("CRM_QUOTE_INPUT_INVALID");
  const unitCostMinor = decimalToMinor(input.unitCost, MONEY, 2, { nullable: source.status === "PENDING" });
  const suggestedMinor = decimalToMinor(input.suggestedUnitPrice, MONEY, 2, { nullable: source.status === "PENDING" });
  const quotedMinor = decimalToMinor(input.quotedUnitPrice, MONEY, 2, { nullable: source.status === "PENDING" });
  if (source.status === "CONFIRMED" && [unitCostMinor, suggestedMinor, quotedMinor].some((value) => value === null)) {
    fail("CRM_QUOTE_CONFIRMED_AMOUNT_REQUIRED");
  }
  if (source.status === "PENDING" && [unitCostMinor, suggestedMinor, quotedMinor].some((value) => value !== null)) {
    fail("CRM_QUOTE_PENDING_AMOUNT_FORBIDDEN");
  }
  const quotedDirection = quotedMinor === null || suggestedMinor === null || quotedMinor === suggestedMinor
    ? "UNCHANGED"
    : quotedMinor < suggestedMinor ? "BELOW_SUGGESTED" : "ABOVE_SUGGESTED";
  return Object.freeze({
    reference: cleanText(input.reference, { min: 3, max: 80 }),
    catalogCode: cleanText(input.catalogCode, { min: 2, max: 80, nullable: true }),
    description: cleanText(input.description, { min: 2, max: 240 }),
    quantity: minorToDecimal(quantityMinor, 3),
    unit: cleanText(input.unit, { min: 1, max: 30 }),
    economicClass: enumValue(input.economicClass, ECONOMIC_CLASSES),
    source,
    unitCost: unitCostMinor === null ? null : minorToDecimal(unitCostMinor, 2),
    suggestedUnitPrice: suggestedMinor === null ? null : minorToDecimal(suggestedMinor, 2),
    quotedUnitPrice: quotedMinor === null ? null : minorToDecimal(quotedMinor, 2),
    quotedDirection,
    totals: Object.freeze({
      cost: unitCostMinor === null ? null : minorToDecimal(multiplyQuantityMoney(quantityMinor, unitCostMinor), 2),
      suggested: suggestedMinor === null ? null : minorToDecimal(multiplyQuantityMoney(quantityMinor, suggestedMinor), 2),
      quoted: quotedMinor === null ? null : minorToDecimal(multiplyQuantityMoney(quantityMinor, quotedMinor), 2),
    }),
  });
}

function sumMoney(lines, selector) {
  return lines.reduce((total, line) => total + decimalToMinor(selector(line), MONEY, 2), 0n);
}

function normalizeProposal(input, minimumOwnMarginBps, destinationStatus) {
  exactObject(input, PROPOSAL_FIELDS);
  if (!Array.isArray(input.lineItems) || input.lineItems.length < 1 || input.lineItems.length > 250) {
    fail("CRM_QUOTE_LINES_INVALID");
  }
  const lineItems = input.lineItems.map(normalizeLine);
  const references = new Set(lineItems.map((line) => line.reference));
  if (references.size !== lineItems.length) fail("CRM_QUOTE_LINE_REFERENCE_DUPLICATE", 409);
  const pending = lineItems.filter((line) => line.source.status === "PENDING");
  const confirmed = lineItems.filter((line) => line.source.status === "CONFIRMED");
  const own = confirmed.filter((line) => line.economicClass === "OWN");
  const confirmedCost = sumMoney(confirmed, (line) => line.totals.cost);
  const confirmedSuggested = sumMoney(confirmed, (line) => line.totals.suggested);
  const confirmedQuoted = sumMoney(confirmed, (line) => line.totals.quoted);
  const ownCost = sumMoney(own, (line) => line.totals.cost);
  const ownQuoted = sumMoney(own, (line) => line.totals.quoted);
  const ownMarginBps = ownQuoted > 0n ? Number(((ownQuoted - ownCost) * 10_000n) / ownQuoted) : -1;
  const blockers = [];
  if (destinationStatus === "PENDING") blockers.push(Object.freeze({ code: "DESTINATION_PENDING", reference: "ROUTE" }));
  for (const line of pending) blockers.push(Object.freeze({ code: "CONCEPT_PENDING", reference: line.reference }));
  if (ownMarginBps < minimumOwnMarginBps) blockers.push(Object.freeze({ code: "OWN_MARGIN_BELOW_MINIMUM", reference: "MARGIN" }));
  const status = enumValue(input.status, PROPOSAL_STATUSES);
  if (status === "APPROVED" && blockers.length > 0) fail("CRM_QUOTE_APPROVAL_BLOCKED", 409);
  return Object.freeze({
    slot: positiveInteger(input.slot, 3),
    reference: (() => {
      const value = cleanText(input.reference, { min: 3, max: 80 });
      if (!REFERENCE.test(value)) fail("CRM_QUOTE_INPUT_INVALID");
      return value;
    })(),
    name: cleanText(input.name, { min: 2, max: 80 }),
    status,
    lineItems: Object.freeze(lineItems),
    totals: Object.freeze({
      confirmedCost: minorToDecimal(confirmedCost, 2),
      confirmedSuggested: minorToDecimal(confirmedSuggested, 2),
      confirmedQuoted: minorToDecimal(confirmedQuoted, 2),
      ownCost: minorToDecimal(ownCost, 2),
      ownQuoted: minorToDecimal(ownQuoted, 2),
      ownMarginBps,
    }),
    blockers: Object.freeze(blockers),
    approvable: blockers.length === 0,
  });
}

export function normalizeCrmQuoteProposalUnsignedInput(input) {
  exactObject(input, UNSIGNED_ROOT_FIELDS);
  const caseRef = cleanText(input.caseRef, { min: 36, max: 36 });
  if (!UUID_V4.test(caseRef)) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const requestId = cleanText(input.requestId, { min: 8, max: 191 });
  if (!REQUEST_ID.test(requestId)) fail("CRM_QUOTE_INPUT_INVALID");
  const currency = cleanText(input.currency, { min: 3, max: 3 });
  if (!CURRENCY.test(currency)) fail("CRM_QUOTE_INPUT_INVALID");
  const minimumOwnMarginBps = nonnegativeInteger(input.minimumOwnMarginBps, 10_000);
  const destinationStatus = enumValue(input.destinationStatus, DESTINATION_STATUSES);
  const operationalFacts = normalizeOperationalFacts(input.operationalFacts);
  const exchange = normalizeExchange(input.exchange, currency);
  if (!Array.isArray(input.proposals) || input.proposals.length < 1 || input.proposals.length > 3) {
    fail("CRM_QUOTE_PROPOSAL_LIMIT");
  }
  const proposals = input.proposals.map((proposal) => normalizeProposal(proposal, minimumOwnMarginBps, destinationStatus));
  if (new Set(proposals.map((proposal) => proposal.slot)).size !== proposals.length
    || new Set(proposals.map((proposal) => proposal.reference)).size !== proposals.length) {
    fail("CRM_QUOTE_PROPOSAL_REFERENCE_DUPLICATE", 409);
  }
  if (proposals.filter((proposal) => proposal.status === "APPROVED").length > 1) {
    fail("CRM_QUOTE_MULTIPLE_APPROVALS", 409);
  }
  return Object.freeze({
    operation: "SAVE_QUOTE_PROPOSAL_SET",
    requestId,
    caseRef,
    currency,
    minimumOwnMarginBps,
    destinationStatus,
    operationalFacts,
    exchange,
    proposals: Object.freeze(proposals),
    taxPolicy: "DEFERRED_NOT_COMPUTED",
  });
}

export function normalizeCrmQuoteProposalInput(input) {
  exactObject(input, ROOT_FIELDS);
  const { payloadHash, ...unsignedInput } = input;
  const normalized = normalizeCrmQuoteProposalUnsignedInput(unsignedInput);
  if (typeof payloadHash !== "string" || !HASH.test(payloadHash)
    || payloadHash !== hashCrmQuoteProposalPayload(normalized)) {
    fail("CRM_QUOTE_PAYLOAD_HASH_INVALID");
  }
  return Object.freeze({ ...normalized, payloadHash });
}

export function buildCrmQuoteProposalAtomicPlan(command, authority) {
  if (!command || command.operation !== "SAVE_QUOTE_PROPOSAL_SET" || !authority) {
    fail("CRM_QUOTE_AUTHORITY_INVALID", 503);
  }
  if (authority.tenantMatched !== true || authority.caseMatched !== true || authority.membershipActive !== true
    || authority.permissionGranted !== true) {
    fail("CRM_QUOTE_PERMISSION_FORBIDDEN", 403);
  }
  if (authority.caseRef !== command.caseRef || authority.destinationStatus !== command.destinationStatus) {
    fail("CRM_QUOTE_AUTHORITY_STALE", 409);
  }
  return Object.freeze({
    transaction: "PIPELINE_CASE_QUOTE_PROPOSALS_COMMAND_AUDIT",
    requestId: command.requestId,
    payloadHash: command.payloadHash,
    caseRef: command.caseRef,
    canonicalHeader: "PipelineCaseQuote",
    proposalCount: command.proposals.length,
    approvedProposalReference: command.proposals.find((proposal) => proposal.status === "APPROVED")?.reference ?? null,
    proposalSnapshots: command.proposals,
    operationalFacts: command.operationalFacts,
    exchangeSnapshot: command.exchange,
    taxPolicy: command.taxPolicy,
    audit: Object.freeze({
      source: "CRM_QUOTE_PROPOSAL_V1",
      action: "CRM_QUOTE_PROPOSAL_SET_SAVED",
      proposalCount: command.proposals.length,
      pendingBlockerCount: command.proposals.reduce((count, proposal) => count + proposal.blockers.length, 0),
      legacyQuoteAuthority: false,
    }),
  });
}
