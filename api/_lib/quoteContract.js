import crypto from "node:crypto";

export class QuoteError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function quoteFail(code, status = 400) {
  throw new QuoteError(code, status);
}

export function canonicalQuoteJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalQuoteJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalQuoteJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function quoteHash(value) {
  return crypto.createHash("sha256").update(canonicalQuoteJson(value)).digest("hex");
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const CLASSES = Object.freeze(["PR", "EX", "DE"]);

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) quoteFail("QUOTE_PAYLOAD_INVALID");
  return value;
}

function exact(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value))) quoteFail("QUOTE_PAYLOAD_INVALID");
}

function text(value, max = 500, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > max) quoteFail("QUOTE_PAYLOAD_INVALID");
  return value;
}

function uuid(value) {
  const result = text(value, 36);
  if (!UUID_V4.test(result)) quoteFail("QUOTE_REFERENCE_INVALID");
  return result;
}

function hash(value) {
  const result = text(value, 64);
  if (!HASH.test(result)) quoteFail("QUOTE_PAYLOAD_INVALID");
  return result;
}

function currency(value) {
  const result = text(value, 3);
  if (!CURRENCY.test(result)) quoteFail("QUOTE_CURRENCY_INVALID");
  return result;
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < min || value > max) quoteFail("QUOTE_PAYLOAD_INVALID");
  return value;
}

function decimal(value, { positive = false, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if ((typeof value !== "string" && typeof value !== "number") || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(String(value))) quoteFail("QUOTE_PAYLOAD_INVALID");
  if (positive ? Number(value) <= 0 : Number(value) < 0) quoteFail("QUOTE_PAYLOAD_INVALID");
  return String(value);
}

function date(value) {
  const result = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) quoteFail("QUOTE_PAYLOAD_INVALID");
  return result;
}

function enumeration(value, values) {
  const result = text(value, 48);
  if (!values.includes(result)) quoteFail("QUOTE_PAYLOAD_INVALID");
  return result;
}

function nullableText(value, max) {
  return value == null ? null : text(value, max);
}

function boolean(value) {
  if (typeof value !== "boolean") quoteFail("QUOTE_PAYLOAD_INVALID");
  return value;
}

function normalizePartySnapshot(raw) {
  const value = object(raw);
  exact(value, ["kind", "displayName", "reference", "present"]);
  return {
    kind: text(value.kind, 80),
    displayName: nullableText(value.displayName, 180),
    reference: nullableText(value.reference, 191),
    present: boolean(value.present),
  };
}

function stringList(value, maxItems = 20, maxLength = 500) {
  if (!Array.isArray(value) || value.length > maxItems) quoteFail("QUOTE_PAYLOAD_INVALID");
  return value.map((item) => text(item, maxLength));
}

function normalizeCommercialContext(raw) {
  const value = object(raw);
  exact(value, ["company", "leadAccount", "booker", "tariff", "associations", "referral", "commissionContext"]);
  const relationship = (input) => {
    if (input == null) return null;
    const row = object(input);
    exact(row, ["kind", "reference", "displayName", "version", "validFrom", "validUntil", "conditions"]);
    return {
      kind: text(row.kind, 60),
      reference: text(row.reference, 191),
      displayName: text(row.displayName, 180),
      version: integer(row.version, 1),
      validFrom: nullableText(row.validFrom, 10),
      validUntil: nullableText(row.validUntil, 10),
      conditions: nullableText(row.conditions, 1000),
    };
  };
  return {
    company: relationship(value.company),
    leadAccount: relationship(value.leadAccount),
    booker: relationship(value.booker),
    tariff: relationship(value.tariff),
    associations: stringList(value.associations, 12, 60),
    referral: relationship(value.referral),
    commissionContext: value.commissionContext == null ? null : object(value.commissionContext),
  };
}

function normalizePayer(raw) {
  const value = object(raw);
  exact(value, ["kind", "reference", "displayName", "sourceVersion", "validFrom", "validUntil", "conditions"]);
  return {
    kind: enumeration(value.kind, ["CLIENT", "COMPANY", "LEAD_ACCOUNT", "THIRD_PARTY", "AUTHORIZED_ENTITY"]),
    reference: text(value.reference, 191),
    displayName: text(value.displayName, 180),
    sourceVersion: integer(value.sourceVersion, 1),
    validFrom: nullableText(value.validFrom, 10),
    validUntil: nullableText(value.validUntil, 10),
    conditions: nullableText(value.conditions, 1000),
  };
}

function normalizeTerms(raw) {
  const value = object(raw);
  exact(value, ["paymentTerms", "scope", "exclusions", "clientNotes", "specialConditions", "templateRef", "templateVersion"]);
  return {
    paymentTerms: text(value.paymentTerms, 1000),
    scope: text(value.scope, 2000),
    exclusions: stringList(value.exclusions, 30, 500),
    clientNotes: nullableText(value.clientNotes, 2000),
    specialConditions: stringList(value.specialConditions, 30, 500),
    templateRef: nullableText(value.templateRef, 191),
    templateVersion: value.templateVersion == null ? null : integer(value.templateVersion, 1),
  };
}

function normalizeExchange(raw, proposalCurrency) {
  if (raw == null) return null;
  const value = object(raw);
  exact(value, ["rateRef", "version", "sourceCurrency", "targetCurrency", "rate", "effectiveAt", "source"]);
  const result = {
    rateRef: uuid(value.rateRef),
    version: integer(value.version, 1),
    sourceCurrency: currency(value.sourceCurrency),
    targetCurrency: currency(value.targetCurrency),
    rate: decimal(value.rate, { positive: true }),
    effectiveAt: text(value.effectiveAt, 40),
    source: text(value.source, 120),
  };
  if (result.targetCurrency !== proposalCurrency || result.sourceCurrency === result.targetCurrency) quoteFail("QUOTE_EXCHANGE_SNAPSHOT_INVALID");
  return result;
}

function normalizeDiscount(raw) {
  if (raw == null) return null;
  const value = object(raw);
  exact(value, ["kind", "base", "value", "reason", "authorizationRef"]);
  return {
    kind: enumeration(value.kind, ["PERCENTAGE", "AMOUNT"]),
    base: decimal(value.base),
    value: decimal(value.value),
    reason: text(value.reason, 1000),
    authorizationRef: nullableText(value.authorizationRef, 191),
  };
}

function normalizeLine(raw, position, proposalCurrency) {
  const value = object(raw);
  exact(value, ["sourceKind", "costingLineRef", "concept", "quantity", "unit", "economicClass", "quotedPrice", "currency", "reason", "manualAuthority"]);
  const sourceKind = enumeration(value.sourceKind, ["COSTING", "MANUAL"]);
  const manualAuthority = value.manualAuthority == null ? null : object(value.manualAuthority);
  if (manualAuthority) exact(manualAuthority, ["kind", "reference", "version", "status", "capturedCost", "suggestedPrice"]);
  if (sourceKind === "COSTING" && (!value.costingLineRef || manualAuthority || value.reason != null)) quoteFail("QUOTE_LINE_SOURCE_INVALID");
  if (sourceKind === "MANUAL" && (value.costingLineRef != null || !manualAuthority || !value.reason)) quoteFail("QUOTE_LINE_SOURCE_INVALID");
  const normalizedAuthority = manualAuthority ? {
    kind: text(manualAuthority.kind, 80),
    reference: text(manualAuthority.reference, 191),
    version: integer(manualAuthority.version, 1),
    status: enumeration(manualAuthority.status, ["CONFIRMED", "PENDING"]),
    capturedCost: decimal(manualAuthority.capturedCost, { nullable: true }),
    suggestedPrice: decimal(manualAuthority.suggestedPrice, { nullable: true }),
  } : null;
  if (normalizedAuthority?.status === "CONFIRMED" && (normalizedAuthority.capturedCost == null || normalizedAuthority.suggestedPrice == null)) quoteFail("QUOTE_MANUAL_AUTHORITY_INVALID");
  if (normalizedAuthority?.status === "PENDING" && (normalizedAuthority.capturedCost != null || normalizedAuthority.suggestedPrice != null || value.quotedPrice != null)) quoteFail("QUOTE_MANUAL_AUTHORITY_INVALID");
  const lineCurrency = currency(value.currency);
  if (lineCurrency !== proposalCurrency) quoteFail("QUOTE_LINE_CURRENCY_INVALID");
  return {
    sourceKind,
    costingLineRef: sourceKind === "COSTING" ? uuid(value.costingLineRef) : null,
    concept: text(value.concept, 240),
    quantity: decimal(value.quantity, { positive: true }),
    unit: text(value.unit, 32),
    economicClass: enumeration(value.economicClass, CLASSES),
    quotedPrice: decimal(value.quotedPrice, { nullable: true }),
    currency: lineCurrency,
    reason: sourceKind === "MANUAL" ? text(value.reason, 1000) : null,
    manualAuthority: normalizedAuthority,
    position,
  };
}

function normalizeProposalPayload(value) {
  const proposalCurrency = currency(value.currency);
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 120) quoteFail("QUOTE_LINES_INVALID");
  const issueDate = date(value.issueDate);
  const validUntil = date(value.validUntil);
  if (validUntil < issueDate) quoteFail("QUOTE_VALIDITY_INVALID");
  return {
    caseRef: uuid(value.caseRef),
    costingRevisionRef: uuid(value.costingRevisionRef),
    position: integer(value.position, 1, 3),
    proposalName: text(value.proposalName, 120),
    currency: proposalCurrency,
    issueDate,
    validUntil,
    commercialContext: normalizeCommercialContext(value.commercialContext),
    payer: normalizePayer(value.payer),
    terms: normalizeTerms(value.terms),
    exchange: normalizeExchange(value.exchange, proposalCurrency),
    discount: normalizeDiscount(value.discount),
    marginAuthorizationRef: value.marginAuthorizationRef == null ? null : uuid(value.marginAuthorizationRef),
    lines: value.lines.map((line, index) => normalizeLine(line, index + 1, proposalCurrency)),
  };
}

function command(raw, operation, normalized, extra = {}) {
  const requestId = uuid(raw.requestId);
  const payloadHash = hash(raw.payloadHash);
  const hashable = normalized.lines
    ? { ...normalized, lines: normalized.lines.map(({ position: _position, ...line }) => line) }
    : normalized;
  const expected = quoteHash({ operation, requestId, ...extra, ...hashable });
  if (payloadHash !== expected) quoteFail("QUOTE_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...extra, ...normalized });
}

const PROPOSAL_FIELDS = ["requestId", "payloadHash", "caseRef", "costingRevisionRef", "position", "proposalName", "currency", "issueDate", "validUntil", "commercialContext", "payer", "terms", "exchange", "discount", "marginAuthorizationRef", "lines"];

export function normalizeQuoteCreate(raw) {
  const value = object(raw);
  exact(value, PROPOSAL_FIELDS);
  return command(value, "QUOTE_PROPOSAL_CREATE", normalizeProposalPayload(value));
}

export function normalizeQuoteRevise(raw) {
  const value = object(raw);
  exact(value, [...PROPOSAL_FIELDS, "proposalRef", "expectedRevision"]);
  return command(value, "QUOTE_PROPOSAL_REVISE", normalizeProposalPayload(value), { proposalRef: uuid(value.proposalRef), expectedRevision: integer(value.expectedRevision, 1) });
}

function simple(raw, operation, fields, normalized) {
  const value = object(raw);
  exact(value, ["requestId", "payloadHash", ...fields]);
  return command(value, operation, normalized(value));
}

export const normalizeQuotePublish = (raw) => simple(raw, "QUOTE_PROPOSAL_PUBLISH", ["proposalRef", "expectedRevision"], (value) => ({ proposalRef: uuid(value.proposalRef), expectedRevision: integer(value.expectedRevision, 1) }));

export const normalizeQuoteSend = (raw) => simple(raw, "QUOTE_PROPOSAL_SEND", ["proposalRef", "expectedRevision", "channel", "recipient", "evidenceRef"], (value) => ({
  proposalRef: uuid(value.proposalRef),
  expectedRevision: integer(value.expectedRevision, 1),
  channel: enumeration(value.channel, ["MANUAL", "EMAIL", "WHATSAPP", "PORTAL"]),
  recipient: normalizePartySnapshot(value.recipient),
  evidenceRef: nullableText(value.evidenceRef, 191),
}));

export const normalizeQuoteDecision = (raw) => simple(raw, "QUOTE_CLIENT_DECISION", ["proposalRef", "expectedRevision", "decision", "method", "decidedBy", "evidenceRef", "reason"], (value) => ({
  proposalRef: uuid(value.proposalRef),
  expectedRevision: integer(value.expectedRevision, 1),
  decision: enumeration(value.decision, ["ACCEPTED", "REJECTED"]),
  method: text(value.method, 80),
  decidedBy: normalizePartySnapshot(value.decidedBy),
  evidenceRef: text(value.evidenceRef, 191),
  reason: nullableText(value.reason, 1000),
}));

export const normalizeQuoteCancel = (raw) => simple(raw, "QUOTE_PROPOSAL_CANCEL", ["proposalRef", "expectedRevision", "reason"], (value) => ({ proposalRef: uuid(value.proposalRef), expectedRevision: integer(value.expectedRevision, 1), reason: text(value.reason, 1000) }));

export function normalizeQuoteCaseRef(value) {
  return uuid(value);
}

export function quoteMoney(value) {
  return Number(Number(value).toFixed(6));
}

export function calculateQuoteTotals(lines, discount) {
  const confirmed = lines.filter((line) => line.priceStatus === "CONFIRMED");
  const capturedCost = quoteMoney(confirmed.reduce((sum, line) => sum + Number(line.capturedCost), 0));
  const suggestedPrice = quoteMoney(confirmed.reduce((sum, line) => sum + Number(line.suggestedPrice), 0));
  const grossQuotedPrice = quoteMoney(confirmed.reduce((sum, line) => sum + Number(line.quotedPrice), 0));
  let discountAmount = 0;
  if (discount) discountAmount = discount.kind === "PERCENTAGE" ? quoteMoney(Number(discount.base) * Number(discount.value) / 100) : Number(discount.value);
  const totalQuotedPrice = quoteMoney(Math.max(0, grossQuotedPrice - discountAmount));
  return {
    capturedCost,
    suggestedPrice,
    grossQuotedPrice,
    discountAmount,
    totalQuotedPrice,
    differenceVsSuggested: quoteMoney(totalQuotedPrice - suggestedPrice),
    marginAmount: quoteMoney(totalQuotedPrice - capturedCost),
    marginBps: totalQuotedPrice > 0 ? Math.round(((totalQuotedPrice - capturedCost) / totalQuotedPrice) * 10_000) : null,
    external: quoteMoney(confirmed.filter((line) => line.economicClass === "EX").reduce((sum, line) => sum + Number(line.quotedPrice), 0)),
    disbursements: quoteMoney(confirmed.filter((line) => line.economicClass === "DE").reduce((sum, line) => sum + Number(line.quotedPrice), 0)),
    pendingLines: lines.length - confirmed.length,
  };
}
