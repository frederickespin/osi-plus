/* eslint-disable no-console */
import { pathToFileURL } from "node:url";
import { createDb01ePrisma } from "./db01e-lib.mjs";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function analyzeHistoricalApprovalRequests(rows, { tenantByCaseId = new Map() } = {}) {
  const report = {
    casesScanned: rows.length,
    requestsFound: 0,
    convertible: 0,
    conflicts: 0,
    reasons: {},
    candidates: [],
  };
  const seen = new Set();
  const conflict = (reason) => {
    report.reasons[reason] = (report.reasons[reason] || 0) + 1;
  };
  for (const row of rows) {
    const requests = asObject(row.milestonesJson).approval_requests;
    if (!Array.isArray(requests)) continue;
    for (const raw of requests) {
      report.requestsFound += 1;
      const item = asObject(raw);
      const legacyId = String(item.id || "").trim();
      const status = String(item.status || "PENDING").trim().toUpperCase();
      const tenantId = tenantByCaseId.get(row.id);
      const reasons = [];
      if (!tenantId) reasons.push("TENANT_NOT_EXPLICITLY_MAPPED");
      if (!legacyId) reasons.push("MISSING_LEGACY_ID");
      if (!String(item.quote_id || "").trim()) reasons.push("MISSING_ENTITY_ID");
      if (!VALID_STATUSES.has(status)) reasons.push("INVALID_STATUS");
      if (legacyId && seen.has(`${tenantId || "?"}:${legacyId}`)) reasons.push("DUPLICATE_REQUEST_ID");
      if (legacyId) seen.add(`${tenantId || "?"}:${legacyId}`);
      if (reasons.length) {
        report.conflicts += 1;
        reasons.forEach(conflict);
        continue;
      }
      report.convertible += 1;
      report.candidates.push({
        caseId: row.id,
        tenantId,
        legacyId,
        approvalType: "COMMERCIAL_PROPOSAL",
        entity: "QUOTE",
        entityId: String(item.quote_id),
        status,
      });
    }
  }
  return report;
}

async function main() {
  const prisma = createDb01ePrisma();
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.$queryRawUnsafe(`SELECT "id", "milestonesJson" FROM "osi"."osi_pipeline_cases"`);
    });
    const report = analyzeHistoricalApprovalRequests(rows);
    console.log(JSON.stringify({ mode: "DRY_RUN_READ_ONLY", writes: 0, ...report, candidates: undefined }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
