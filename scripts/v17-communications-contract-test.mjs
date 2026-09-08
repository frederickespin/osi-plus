import assert from "node:assert/strict";
import {
  COMMUNICATION_VARIABLES,
  assertCommunicationVariablesForContext,
  canonicalCommunicationJson,
  communicationHash,
  normalizePreview,
  normalizePrepare,
  normalizeTemplateCreate,
  placeholders,
  renderCommunicationTemplate,
} from "../api/_lib/communicationsContract.js";

let checks = 0;
const pass = (condition, message) => { assert.ok(condition, message); checks += 1; };
const rejected = (fn, code) => { assert.throws(fn, (error) => error?.code === code); checks += 1; };
const command = (operation, requestId, payload) => ({ requestId, payloadHash: communicationHash({ operation, requestId, ...payload }), ...payload });

pass(COMMUNICATION_VARIABLES.length === 18, "catálogo tipado y versionado incluye variables operativas de visita");
pass(assertCommunicationVariablesForContext(["case.reference", "client.name"], "CASE") === true, "variables disponibles en contexto Case");
rejected(() => assertCommunicationVariablesForContext(["survey.date"], "CASE"), "COMMUNICATION_CONTEXT_INCOMPLETE");
pass(canonicalCommunicationJson({ b: 2, a: 1 }) === '{"a":1,"b":2}', "JSON canónico");
pass(placeholders("Hola {{ client.name }} · {{case.reference}}").join(",") === "case.reference,client.name", "variables permitidas");
rejected(() => placeholders("{{tenant.id}}"), "COMMUNICATION_VARIABLE_NOT_ALLOWED");
rejected(() => placeholders("{{{client.name}}}"), "COMMUNICATION_TEMPLATE_INVALID");
const rendered = renderCommunicationTemplate({ subject: "Caso {{case.reference}}", bodyText: "Hola {{client.name}}", bodyHtml: null }, { "case.reference": "PILOT-001", "client.name": "Cliente" });
pass(rendered.subject === "Caso PILOT-001" && rendered.bodyText === "Hola Cliente", "render server-side");
rejected(() => renderCommunicationTemplate({ subject: null, bodyText: "{{client.name}}", bodyHtml: null }, {}), "COMMUNICATION_CONTEXT_INCOMPLETE");
const createPayload = { code: "SURVEY.PIC", name: "PIC de Survey", category: "SURVEY_PIC", audiences: ["CLIENT"], channels: ["EMAIL"], subject: "Caso {{case.reference}}", bodyText: "Hola {{client.name}}", bodyHtml: null, variables: ["case.reference", "client.name"], validFrom: null, validTo: null };
pass(normalizeTemplateCreate(command("TEMPLATE_CREATE", "contract-create", createPayload)).code === "SURVEY.PIC", "create cerrado e idempotente");
rejected(() => normalizeTemplateCreate({ ...command("TEMPLATE_CREATE", "contract-create", createPayload), tenantId: "forbidden" }), "COMMUNICATION_INPUT_INVALID");
rejected(() => normalizeTemplateCreate(command("TEMPLATE_CREATE", "unsafe-html", { ...createPayload, bodyHtml: "<script>alert(1)</script>" })), "COMMUNICATION_HTML_UNSAFE");
rejected(() => normalizeTemplateCreate({ ...command("TEMPLATE_CREATE", "bad-hash", createPayload), payloadHash: "0".repeat(64) }), "COMMUNICATION_PAYLOAD_HASH_MISMATCH");
pass(normalizePreview({ subject: null, bodyText: "Hola {{client.name}}", bodyHtml: null, variables: ["client.name"], context: "CASE" }).context === "CASE", "preview sintético cerrado");
const preparePayload = { templateRef: "11111111-1111-4111-8111-111111111111", version: 1, caseRef: "22222222-2222-4222-8222-222222222222", surveyAssignmentRef: null, quoteRevisionRef: null, recipientType: "CLIENT", recipientRef: "33333333-3333-4333-8333-333333333333", channel: "EMAIL", milestone: "CLIENT_INFORMATION_REQUEST" };
pass(normalizePrepare(command("COMMUNICATION_PREPARE", "prepare-once", preparePayload)).recipientType === "CLIENT", "destinatario explícito");
rejected(() => normalizePrepare(command("COMMUNICATION_PREPARE", "prepare-pk", { ...preparePayload, caseRef: "cm123internal" })), "COMMUNICATION_NOT_FOUND");
rejected(() => normalizePrepare({ ...command("COMMUNICATION_PREPARE", "prepare-extra", preparePayload), destination: "hidden" }), "COMMUNICATION_INPUT_INVALID");
rejected(() => normalizePrepare(command("COMMUNICATION_PREPARE", "prepare-mixed-context", { ...preparePayload, surveyAssignmentRef: "44444444-4444-4444-8444-444444444444", quoteRevisionRef: "55555555-5555-4555-8555-555555555555" })), "COMMUNICATION_INPUT_INVALID");

console.log(`V17-COMMUNICATIONS-CONTRACT ${checks}/${checks}`);
