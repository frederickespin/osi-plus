import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17QuoteGuard } from "./validate-v17-quote-guard.mjs";

const files = ["prisma/schema.prisma", "prisma/migrations/20260910010000_v17_quote/migration.sql", "api/_lib/quoteDomain.js", "api/_lib/quoteContract.js", "api/_lib/quoteHttp.js", "api/_lib/rbac.js", "src/commercial-crm/CommercialCaseDetail.tsx", "src/quote/QuotePanel.tsx", "scripts/protected-cors-route-inventory.json"];
const baseline = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const cases = [];
function rejects(name, path, mutate) { const overrides = new Map(baseline); overrides.set(path, mutate(overrides.get(path))); assert.throws(() => validateV17QuoteGuard({ overrides }), /V17_QUOTE_GUARD/); cases.push(name); }
assert.equal(validateV17QuoteGuard({ overrides: baseline }).ok, true);
rejects("cuarta posición", "prisma/migrations/20260910010000_v17_quote/migration.sql", (value) => value.replace("BETWEEN 1 AND 3", "BETWEEN 1 AND 4"));
rejects("doble aceptación", "prisma/migrations/20260910010000_v17_quote/migration.sql", (value) => value.replace("WHERE \"state\" = 'ACCEPTED'", "WHERE \"state\" = 'SENT'"));
rejects("revisión mutable", "prisma/migrations/20260910010000_v17_quote/migration.sql", (value) => value.replace("quote_proposal_revisions_append_only", "quote_proposal_revisions_mutable"));
rejects("recalcular Costing", "api/_lib/quoteDomain.js", (value) => `${value}\nfunction calculateCostingSnapshot(){}`);
rejects("sin tenant en Costing", "api/_lib/quoteDomain.js", (value) => value.replace("where: { tenantId: context.tenantId, pipelineCaseId, revisionRef, status: \"PUBLISHED\" }", "where: { pipelineCaseId, revisionRef, status: \"PUBLISHED\" }"));
rejects("sin destino", "api/_lib/quoteDomain.js", (value) => value.replaceAll("DESTINATION_PENDING", "DESTINATION_ALLOWED"));
rejects("sin margen", "api/_lib/quoteDomain.js", (value) => value.replaceAll("MARGIN_AUTHORIZATION_REQUIRED", "MARGIN_IGNORED"));
rejects("rol concede Quote", "api/_lib/rbac.js", (value) => value.replace("&& !EXPLICIT_QUOTE_PERMISSIONS.has(permission)", ""));
rejects("UI antes de autorización", "src/commercial-crm/CommercialCaseDetail.tsx", (value) => value.replaceAll("quoteEnabled && quoteAccess.canView", "true"));
rejects("storage empresarial", "src/quote/QuotePanel.tsx", (value) => `${value}\nlocalStorage.setItem('quote','mock')`);
rejects("costo cliente", "api/_lib/quoteDomain.js", (value) => value.replace("totals: { grossQuotedPrice", "totals: { capturedCost: internal.totals.capturedCost, grossQuotedPrice"));
rejects("Production", "api/_lib/quoteHttp.js", (value) => value.replace("PREVIEW_REHEARSAL: \"PREVIEW_REHEARSAL\"", "PREVIEW_REHEARSAL: \"PREVIEW_REHEARSAL\", PRODUCTION: \"PRODUCTION\""));
rejects("ruta sin CORS", "scripts/protected-cors-route-inventory.json", (value) => value.replace('      "/api/quote/proposals/send"\n', ""));
console.log(`V17-QUOTE-09A guard negatives: ${cases.length}/${cases.length}`);
