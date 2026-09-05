import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function read(root, path, overrides) { return overrides?.get(path) ?? readFileSync(resolve(root, path), "utf8"); }
function invariant(value, message) { if (!value) throw new Error(`V17_QUOTE_GUARD:${message}`); }
const ROUTES = Object.freeze(["/api/quote/cases/[caseRef]", "/api/quote/proposals/[proposalRef]/client", "/api/quote/proposals/cancel", "/api/quote/proposals/create", "/api/quote/proposals/decision", "/api/quote/proposals/publish", "/api/quote/proposals/revise", "/api/quote/proposals/send"]);

export function validateV17QuoteGuard({ root = process.cwd(), overrides = new Map() } = {}) {
  const schema = read(root, "prisma/schema.prisma", overrides); const sql = read(root, "prisma/migrations/20260910010000_v17_quote/migration.sql", overrides);
  const domain = read(root, "api/_lib/quoteDomain.js", overrides); const contract = read(root, "api/_lib/quoteContract.js", overrides); const http = read(root, "api/_lib/quoteHttp.js", overrides);
  const rbac = read(root, "api/_lib/rbac.js", overrides); const detail = read(root, "src/commercial-crm/CommercialCaseDetail.tsx", overrides); const panel = read(root, "src/quote/QuotePanel.tsx", overrides);
  const inventory = JSON.parse(read(root, "scripts/protected-cors-route-inventory.json", overrides));
  for (const model of ["PipelineCaseQuote", "QuoteProposal", "QuoteProposalRevision", "QuoteLine", "QuoteIssue", "QuoteDispatch", "QuoteClientDecision", "QuoteMutationCommand", "QuoteReferenceCounter"]) invariant(schema.includes(`model ${model}`), `modelo ausente:${model}`);
  invariant(/@@unique\(\[tenantId, quoteId, position\]/u.test(schema), "posición 1..3 no es tenant-first");
  invariant(/position" BETWEEN 1 AND 3/u.test(sql), "máximo tres propuestas ausente");
  invariant(/one_accepted_per_case_key[\s\S]*WHERE "state" = 'ACCEPTED'/u.test(sql), "aceptación única no es transaccional");
  invariant(/quote_append_only_guard/u.test(sql) && /quote_proposal_revisions_append_only/u.test(sql) && /quote_lines_append_only/u.test(sql), "historia enviada no es inmutable");
  invariant(/QuoteLinePriceStatus/u.test(schema) && /MANUAL_PRICE_PENDING/u.test(domain), "concepto pendiente inventa importe");
  invariant(/costingRevision\.findFirst\(\{[\s\S]{0,120}where: \{ tenantId: context\.tenantId, pipelineCaseId, revisionRef, status: "PUBLISHED" \}/u.test(domain), "CostingRevision publicada tenant-first ausente");
  invariant(!/calculateCosting|calculateCostingSnapshot/u.test(domain), "Quote recalcula Costing");
  invariant(/source\.totalCost/u.test(domain) && /source\.suggestedPrice/u.test(domain) && /quotedPrice: line\.quotedPrice/u.test(domain), "costo/sugerido/cotizado no están separados");
  invariant(/explicit/i.test(contract) || /normalizePayer/u.test(contract), "pagador explícito ausente");
  invariant(/DESTINATION_PENDING/u.test(domain) && /COSTING_BLOCKERS_PRESENT/u.test(domain) && /MARGIN_AUTHORIZATION_REQUIRED/u.test(domain) && /QUOTE_EXPIRED/u.test(domain), "revalidaciones de aceptación incompletas");
  invariant(/proposalRevisionRef/u.test(domain) && /logisticsPlanRevisionRef/u.test(domain) && /surveyPublicationRef/u.test(domain) && /servicesRevisionRef/u.test(domain), "handoff trazable incompleto");
  invariant(/QUOTE_ENGINE_API_MODE/u.test(http) && !/PRODUCTION(?:_PILOT|_READ)?["']/u.test(http), "runtime Production habilitable");
  invariant(/resolveQuoteApiMode\(env, req\)[\s\S]*assertSameOrigin\(req\)[\s\S]*resolveContext/u.test(http), "gate no precede Auth/body/Prisma");
  for (const permission of ["quote:view", "quote:create", "quote:update", "quote:publish", "quote:send", "quote:record-client-decision", "quote:override-price", "quote:tenant"]) invariant(rbac.includes(permission), `permiso ausente:${permission}`);
  invariant(/EXPLICIT_QUOTE_PERMISSIONS/u.test(rbac) && /!EXPLICIT_QUOTE_PERMISSIONS\.has/u.test(rbac), "rol baseline concede Quote");
  invariant(/const QuotePanel = lazy/u.test(detail) && /quoteEnabled && quoteAccess\.canView/u.test(detail), "Quote monta antes de autorización");
  invariant(!/localStorage|sessionStorage|mock/i.test(panel), "UI usa autoridad local o mock");
  invariant(/Debajo del sugerido/u.test(panel) && /Sobre el sugerido/u.test(panel), "indicador accesible de precio ausente");
  invariant(/getQuoteClientProjection/u.test(domain)); const projection = domain.slice(domain.indexOf("export function getQuoteClientProjection"), domain.indexOf("export async function getQuoteClientProposal"));
  invariant(!/capturedCost|suggestedPrice|marginAuthorization|internalSnapshot/u.test(projection), "DTO cliente expone economía interna");
  for (const route of ROUTES) invariant(inventory.categories.protectedSameOrigin.includes(route), `CORS no inventaría:${route}`);
  return Object.freeze({ ok: true, models: 9, routes: ROUTES.length, permissions: 9, productionApiEnabled: false });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(validateV17QuoteGuard()));
