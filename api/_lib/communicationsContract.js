import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_.-]{2,79}$/;
const CATEGORIES = new Set(["VISIT_CONFIRMATION", "EVALUATOR_ASSIGNMENT", "SURVEY_PIC", "CLIENT_INFORMATION_REQUEST", "DOCUMENT_REQUEST", "QUOTE_SENT", "QUOTE_FOLLOW_UP", "QUOTE_ACCEPTED", "QUOTE_REJECTED", "BOOKER_NOTIFICATION", "AGENT_NOTIFICATION", "LEAD_ACCOUNT_NOTIFICATION"]);
const AUDIENCES = new Set(["CLIENT", "BOOKER", "LEAD_ACCOUNT", "AGENT", "EVALUATOR", "SALES", "COORDINATOR", "PAYER", "APPROVER", "REFERRAL", "INTERNAL_TEAM"]);
const CHANNELS = new Set(["EMAIL", "WHATSAPP", "PORTAL", "INTERNAL", "SMS"]);
const MILESTONES = new Set(["VISIT_CONFIRMATION", "EVALUATOR_ASSIGNMENT", "SURVEY_PIC_CLIENT", "SURVEY_PIC_EVALUATOR", "VISIT_RESCHEDULED", "VISIT_CANCELLED", "AFTER_HOURS_APPROVED", "AFTER_HOURS_REJECTED", "QUOTE_SENT", "FOLLOW_UP_1", "FOLLOW_UP_2", "EXPIRY_REMINDER", "QUOTE_ACCEPTED", "QUOTE_REJECTED", "CLIENT_INFORMATION_REQUEST", "DOCUMENT_REQUEST", "BOOKER_NOTIFICATION", "AGENT_NOTIFICATION", "LEAD_ACCOUNT_NOTIFICATION"]);

export const COMMUNICATION_VARIABLE_CATALOG_VERSION = 1;
export const COMMUNICATION_VARIABLES = Object.freeze([
  { name: "client.name", source: "PipelineCase.client", type: "TEXT", pii: false, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Cliente" },
  { name: "case.reference", source: "PipelineCase.caseCode", type: "TEXT", pii: false, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Caso" },
  { name: "survey.date", source: "SurveyAssignment.scheduledStart", type: "DATE", pii: false, contexts: ["SCHEDULING"], fallback: "Fecha pendiente" },
  { name: "survey.time", source: "SurveyAssignment.scheduledStart", type: "TIME", pii: false, contexts: ["SCHEDULING"], fallback: "Hora pendiente" },
  { name: "evaluator.name", source: "SurveyAssignment.evaluatorMembership.User", type: "TEXT", pii: true, contexts: ["SCHEDULING"], fallback: "Evaluador asignado" },
  { name: "origin.address", source: "PipelineCaseRouteSnapshot.ORIGIN", type: "ADDRESS", pii: true, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Origen por confirmar" },
  { name: "destination.address", source: "PipelineCaseRouteSnapshot.DESTINATION", type: "ADDRESS", pii: true, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Destino por confirmar" },
  { name: "booker.name", source: "PipelineCaseCommercialContext.BOOKER", type: "TEXT", pii: true, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Booker" },
  { name: "leadAccount.name", source: "PipelineCaseCommercialContext.LEAD_ACCOUNT", type: "TEXT", pii: true, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Lead Account" },
  { name: "agent.name", source: "PipelineCaseCommercialContext.AGENT", type: "TEXT", pii: true, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Agente" },
  { name: "quote.reference", source: "QuoteProposalRevision.proposalNumber", type: "TEXT", pii: false, contexts: ["QUOTE"], fallback: "Propuesta" },
  { name: "quote.validUntil", source: "QuoteProposalRevision.validUntil", type: "DATE", pii: false, contexts: ["QUOTE"], fallback: "Vigencia por confirmar" },
  { name: "visit.fee", source: "SurveyAssignment.visitFeeSnapshot", type: "MONEY", pii: false, contexts: ["SCHEDULING"], fallback: "Tarifa por confirmar" },
  { name: "visit.instructions", source: "SurveyAssignment.instructionsSnapshot", type: "TEXT", pii: true, contexts: ["SCHEDULING"], fallback: "Sin instrucciones adicionales" },
  { name: "visit.reason", source: "SurveyAssignment.VisitReason.name", type: "TEXT", pii: false, contexts: ["SCHEDULING"], fallback: "Visita programada" },
  { name: "visit.method", source: "SurveyEvaluationDecision.method", type: "TEXT", pii: false, contexts: ["SCHEDULING"], fallback: "Método por confirmar" },
  { name: "visit.travelMinutes", source: "SurveyAssignment.travelBufferMinutes", type: "TEXT", pii: false, contexts: ["SCHEDULING"], fallback: "No aplica" },
  { name: "visit.resources", source: "SurveyAssignment.resourcesSnapshot", type: "TEXT", pii: false, contexts: ["SCHEDULING"], fallback: "Sin recursos adicionales" },
]);
const VARIABLE_NAMES = new Set(COMMUNICATION_VARIABLES.map((item) => item.name));
const VARIABLE_CATALOG = new Map(COMMUNICATION_VARIABLES.map((item) => [item.name, item]));

export class CommunicationsError extends Error {
  constructor(code, status = 400, cause) { super(code, cause ? { cause } : undefined); this.name = "CommunicationsError"; this.code = code; this.status = status; }
}
export function communicationFail(code, status = 400, cause) { throw new CommunicationsError(code, status, cause); }
export function canonicalCommunicationJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCommunicationJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCommunicationJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function communicationHash(value) { return createHash("sha256").update(typeof value === "string" ? value : canonicalCommunicationJson(value), "utf8").digest("hex"); }
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) communicationFail("COMMUNICATION_INPUT_INVALID"); return value; }
function exact(value, keys) { const allowed = new Set(keys); if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value))) communicationFail("COMMUNICATION_INPUT_INVALID"); }
function text(value, max = 500, nullable = false) { if (nullable && (value === null || value === undefined || value === "")) return null; if (typeof value !== "string" || value !== value.trim() || !value || value.length > max || value.includes("\u0000")) communicationFail("COMMUNICATION_INPUT_INVALID"); return value; }
function uuid(value) { const result = text(value, 36); if (!UUID_V4.test(result)) communicationFail("COMMUNICATION_NOT_FOUND", 404); return result; }
function enumeration(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) communicationFail("COMMUNICATION_INPUT_INVALID"); return result; }
function uniqueList(value, allowed, max = 20) { if (!Array.isArray(value) || !value.length || value.length > max) communicationFail("COMMUNICATION_INPUT_INVALID"); const result = value.map((item) => enumeration(item, allowed)); if (new Set(result).size !== result.length) communicationFail("COMMUNICATION_INPUT_INVALID"); return Object.freeze([...result].sort()); }
function instant(value, nullable = true) { if (nullable && (value === null || value === undefined || value === "")) return null; const result = text(value, 40); if (new Date(result).toISOString() !== result) communicationFail("COMMUNICATION_INPUT_INVALID"); return result; }
function integer(value, min = 1) { if (!Number.isSafeInteger(value) || value < min) communicationFail("COMMUNICATION_INPUT_INVALID"); return value; }
function command(value, operation, payload) { const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const computed = communicationHash({ operation, requestId, ...payload }); if (!SHA256.test(payloadHash) || payloadHash !== computed) communicationFail("COMMUNICATION_PAYLOAD_HASH_MISMATCH"); return Object.freeze({ operation, requestId, payloadHash, ...payload }); }

export function placeholders(value) {
  const input = String(value || "");
  if (/\{\{\{|\}\}\}/.test(input)) communicationFail("COMMUNICATION_TEMPLATE_INVALID");
  const names = [...input.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9.]{1,79})\s*\}\}/g)].map((match) => match[1]);
  const residue = input.replace(/\{\{\s*[a-zA-Z][a-zA-Z0-9.]{1,79}\s*\}\}/g, "");
  if (residue.includes("{{") || residue.includes("}}") || names.some((name) => !VARIABLE_NAMES.has(name))) communicationFail("COMMUNICATION_VARIABLE_NOT_ALLOWED");
  return Object.freeze([...new Set(names)].sort());
}
export function renderCommunicationTemplate(template, values) {
  const replace = (input) => input == null ? null : String(input).replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9.]{1,79})\s*\}\}/g, (_all, name) => {
    if (!VARIABLE_NAMES.has(name) || typeof values[name] !== "string") communicationFail("COMMUNICATION_CONTEXT_INCOMPLETE", 409);
    return values[name];
  });
  placeholders(template.subject || ""); placeholders(template.bodyText); if (template.bodyHtml) placeholders(template.bodyHtml);
  return Object.freeze({ subject: replace(template.subject), bodyText: replace(template.bodyText), bodyHtml: replace(template.bodyHtml) });
}
export function assertCommunicationVariablesForContext(names, context) {
  if (!new Set(["CASE", "SCHEDULING", "QUOTE"]).has(context) || !Array.isArray(names) || names.some((name) => !VARIABLE_CATALOG.get(name)?.contexts.includes(context))) communicationFail("COMMUNICATION_CONTEXT_INCOMPLETE", 409);
  return true;
}

function templateBody(value) {
  const code = text(value.code, 80); if (!CODE.test(code)) communicationFail("COMMUNICATION_INPUT_INVALID");
  const subject = text(value.subject, 300, true); const bodyText = text(value.bodyText, 20_000); const bodyHtml = text(value.bodyHtml, 40_000, true);
  if (bodyHtml && /<(?:script|iframe|object|embed|form|style)|\son\w+\s*=|javascript:/i.test(bodyHtml)) communicationFail("COMMUNICATION_HTML_UNSAFE");
  const used = [...new Set([...placeholders(subject || ""), ...placeholders(bodyText), ...placeholders(bodyHtml || "")])].sort();
  const declared = uniqueList(value.variables, VARIABLE_NAMES, 30); if (canonicalCommunicationJson(used) !== canonicalCommunicationJson(declared)) communicationFail("COMMUNICATION_VARIABLE_DECLARATION_MISMATCH");
  return { code, name: text(value.name, 160), category: enumeration(value.category, CATEGORIES), audiences: uniqueList(value.audiences, AUDIENCES), channels: uniqueList(value.channels, CHANNELS), subject, bodyText, bodyHtml, variables: declared, validFrom: instant(value.validFrom), validTo: instant(value.validTo) };
}
export function normalizeTemplateCreate(input) { const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "category", "audiences", "channels", "subject", "bodyText", "bodyHtml", "variables", "validFrom", "validTo"]); const payload = templateBody(value); return command(value, "TEMPLATE_CREATE", payload); }
export function normalizeDraftVersion(input, templateRef) { const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "name", "category", "audiences", "channels", "subject", "bodyText", "bodyHtml", "variables", "validFrom", "validTo"]); const body = templateBody({ ...value, code: "TMP" }); delete body.code; const payload = { templateRef: uuid(templateRef), expectedVersion: integer(value.expectedVersion), ...body }; return command(value, "TEMPLATE_VERSION", payload); }
export function normalizeDraftUpdate(input, templateRef) { const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "name", "category", "audiences", "channels", "subject", "bodyText", "bodyHtml", "variables", "validFrom", "validTo"]); const body = templateBody({ ...value, code: "TMP" }); delete body.code; const payload = { templateRef: uuid(templateRef), expectedVersion: integer(value.expectedVersion), ...body }; return command(value, "TEMPLATE_DRAFT_UPDATE", payload); }
export function normalizePublish(input, templateRef) { const value = object(input); exact(value, ["requestId", "payloadHash", "version", "expectedState"]); const payload = { templateRef: uuid(templateRef), version: integer(value.version), expectedState: enumeration(value.expectedState, new Set(["DRAFT"])) }; return command(value, "TEMPLATE_PUBLISH", payload); }
export function normalizeInactivate(input, templateRef) { const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion"]); const payload = { templateRef: uuid(templateRef), expectedVersion: integer(value.expectedVersion) }; return command(value, "TEMPLATE_INACTIVATE", payload); }
export function normalizePreview(input) { const value = object(input); exact(value, ["subject", "bodyText", "bodyHtml", "variables", "context"]); const template = { subject: text(value.subject, 300, true), bodyText: text(value.bodyText, 20_000), bodyHtml: text(value.bodyHtml, 40_000, true) }; const variables = uniqueList(value.variables, VARIABLE_NAMES, 30); const used = [...new Set([...placeholders(template.subject || ""), ...placeholders(template.bodyText), ...placeholders(template.bodyHtml || "")])].sort(); if (canonicalCommunicationJson(variables) !== canonicalCommunicationJson(used)) communicationFail("COMMUNICATION_VARIABLE_DECLARATION_MISMATCH"); const context = enumeration(value.context, new Set(["CASE", "SCHEDULING", "QUOTE"])); return Object.freeze({ ...template, variables, context }); }
export function normalizePrepare(input) { const value = object(input); exact(value, ["requestId", "payloadHash", "templateRef", "version", "caseRef", "surveyAssignmentRef", "quoteRevisionRef", "recipientType", "recipientRef", "channel", "milestone"]); if (value.surveyAssignmentRef && value.quoteRevisionRef) communicationFail("COMMUNICATION_INPUT_INVALID"); const payload = { templateRef: uuid(value.templateRef), version: integer(value.version), caseRef: uuid(value.caseRef), surveyAssignmentRef: value.surveyAssignmentRef ? uuid(value.surveyAssignmentRef) : null, quoteRevisionRef: value.quoteRevisionRef ? uuid(value.quoteRevisionRef) : null, recipientType: enumeration(value.recipientType, AUDIENCES), recipientRef: uuid(value.recipientRef), channel: enumeration(value.channel, CHANNELS), milestone: enumeration(value.milestone, MILESTONES) }; return command(value, "COMMUNICATION_PREPARE", payload); }
export function normalizeCaseRef(value) { return uuid(value); }
export function normalizeTemplateRef(value) { return uuid(value); }
export const COMMUNICATION_CATEGORIES = Object.freeze([...CATEGORIES]);
export const COMMUNICATION_AUDIENCES = Object.freeze([...AUDIENCES]);
export const COMMUNICATION_CHANNELS = Object.freeze([...CHANNELS]);
export const COMMUNICATION_MILESTONES = Object.freeze([...MILESTONES]);
