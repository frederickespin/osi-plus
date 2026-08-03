/* eslint-disable no-console */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDb01gPrisma } from "./db01g-lib.mjs";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function historicalRowsFromMilestones(cases) {
  const rows = [];
  for (const item of cases) {
    const root = asObject(item.milestonesJson);
    for (const [quoteId, entries] of Object.entries(asObject(root.quote_addendums_by_quote_id))) {
      for (const entry of Array.isArray(entries) ? entries : []) rows.push({ source: "MILESTONES_ADDENDUM", caseId: item.id, quoteId, ...asObject(entry) });
    }
    for (const [quoteId, entries] of Object.entries(asObject(root.quote_change_orders_by_quote_id))) {
      for (const entry of Array.isArray(entries) ? entries : []) rows.push({ source: "MILESTONES_CHANGE_ORDER", caseId: item.id, quoteId, ...asObject(entry) });
    }
  }
  return rows;
}

function keyOf(row) {
  return `${row.quoteId || row.quote_id || ""}:${row.addendumNumber || row.addendum_number || row.change_number || ""}`;
}

export async function analyzeHistoricalChangeOrders(prisma) {
  const [tableRows, cases, subjects] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT * FROM "osi"."quote_addendums" ORDER BY "created_at","id"`),
    prisma.$queryRawUnsafe(`SELECT "id","milestonesJson" FROM "osi"."osi_pipeline_cases"`),
    prisma.$queryRawUnsafe(`SELECT * FROM "osi"."quote_change_order_subjects"`),
  ]);
  const subjectByQuote = new Map(subjects.map((row) => [row.base_quote_id, row]));
  const combined = [
    ...tableRows.map((row) => ({ source: "QUOTE_ADDENDUM_TABLE", quoteId: row.quote_id, ...row })),
    ...historicalRowsFromMilestones(cases),
  ];
  const counts = new Map();
  for (const row of combined) counts.set(keyOf(row), (counts.get(keyOf(row)) || 0) + 1);
  const classified = combined.map((row) => {
    const quoteId = String(row.quoteId || row.quote_id || "").trim();
    const amount = Number(row.amountDelta ?? row.amount_delta ?? row.total ?? 0);
    const base = Number(row.baseApprovedAmount ?? row.base_approved_amount ?? 0);
    const cap = Number(row.capPercent ?? row.cap_percent ?? 15);
    const evidence = row.evidence ?? row.evidence_json;
    const acceptance = row.acceptance ?? row.acceptance_json;
    const issues = [];
    if (!quoteId || !String(row.description || "").trim() || !(amount > 0)) issues.push("REQUIRED_DATA_MISSING");
    if (!subjectByQuote.has(quoteId)) issues.push("TENANT_BINDING_AMBIGUOUS");
    if (!acceptance || !Array.isArray(evidence) || evidence.length === 0) issues.push("ACCEPTANCE_OR_EVIDENCE_INCOMPLETE");
    if (counts.get(keyOf(row)) > 1) issues.push("DUPLICATE_BUSINESS_KEY");
    if (base > 0 && amount > base * (cap / 100) + 0.001) issues.push("CAP_CONFLICT");
    let classification = "AUTOMATICALLY_CONVERTIBLE";
    if (issues.includes("DUPLICATE_BUSINESS_KEY")) classification = "DUPLICATE";
    else if (issues.includes("CAP_CONFLICT")) classification = "CONFLICTIVE";
    else if (issues.includes("TENANT_BINDING_AMBIGUOUS")) classification = "AMBIGUOUS";
    else if (issues.length) classification = "INCOMPLETE";
    return { source: row.source, legacyId: row.id || null, quoteId, key: keyOf(row), classification, issues };
  });
  const totals = Object.fromEntries(["AUTOMATICALLY_CONVERTIBLE", "AMBIGUOUS", "INCOMPLETE", "DUPLICATE", "CONFLICTIVE"]
    .map((name) => [name, classified.filter((row) => row.classification === name).length]));
  return { mode: "DRY_RUN_ONLY", writesPerformed: false, sources: { quoteAddendums: tableRows.length, milestoneRecords: combined.length - tableRows.length }, totals, records: classified };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prisma = createDb01gPrisma();
  try {
    const report = JSON.stringify(await analyzeHistoricalChangeOrders(prisma), null, 2);
    if (process.env.DB01G_DRY_RUN_PATH) {
      await writeFile(process.env.DB01G_DRY_RUN_PATH, `${report}\n`, "utf8");
    }
    console.log(report);
  }
  finally { await prisma.$disconnect(); }
}
