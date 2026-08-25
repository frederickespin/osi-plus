import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { findCrmPipelineCase } from "../api/_lib/crmPipelineRead.js";

const CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const TENANT = "tenant-synthetic-foundation";
const EXPECTED_DETAIL_KEYS = [
  "assetsCount", "caseCode", "caseRef", "client", "createdAt", "customerType", "destinationContracted",
  "destinationLocation", "estimatedCbm", "eventCount", "mode", "originLocation", "owner", "quoteCount",
  "requiresSurvey", "serviceType", "status", "surveyMethod", "updatedAt",
].sort();

let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};

const canonicalRow = Object.freeze({
  publicRef: CASE_REF,
  caseCode: "SYNTHETIC-001",
  mode: "EXPORT",
  serviceType: "MOVING",
  customerType: "L4_PERSONAL",
  status: "SURVEY_PLANNING",
  estimatedCbm: 24.5,
  requiresSurvey: true,
  surveyMethod: "PRESENCIAL",
  originLocation: "Synthetic origin",
  destinationLocation: "Synthetic destination",
  destinationContracted: true,
  assetsCount: 12,
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-24T14:00:00.000Z"),
  client: { name: "Relational receiver", type: "PERSON", status: "active" },
  enterpriseOwner: { user: { name: "Relational owner" } },
  _count: { quotes: 2, events: 3 },
});

let capturedQuery;
const prisma = {
  pipelineCase: {
    findUnique: async (query) => {
      capturedQuery = query;
      return canonicalRow;
    },
  },
};
const detail = await findCrmPipelineCase(prisma, { tenantId: TENANT, caseRef: CASE_REF });
check(capturedQuery.where.tenantId_publicRef.tenantId === TENANT, "detalle no fija tenant");
check(capturedQuery.where.tenantId_publicRef.publicRef === CASE_REF, "detalle no fija publicRef");
check(Object.keys(detail).sort().join("|") === EXPECTED_DETAIL_KEYS.join("|"), "DTO detalle no es cerrado");
check(detail.caseRef === CASE_REF, "publicRef no se publica como caseRef");
check(detail.client?.displayName === "Relational receiver", "Client relacional no prevalece");
check(detail.owner?.displayName === "Relational owner", "owner público incorrecto");
check(detail.quoteCount === 2 && detail.eventCount === 3, "conteos relacionales incorrectos");
check(!/[\"'](?:id|tenantId|clientId|publicRef)[\"']\s*:/.test(JSON.stringify(detail)), "DTO expone identidad interna");

const absentPrisma = { pipelineCase: { findUnique: async () => null } };
await assert.rejects(
  findCrmPipelineCase(absentPrisma, { tenantId: TENANT, caseRef: CASE_REF }),
  (error) => error?.status === 404 && error?.code === "CRM_PIPELINE_RESOURCE_NOT_FOUND",
);
assertions += 1;

const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
check(migrations.length === 19, "cantidad de migraciones distinta de 19");
check(!migrations.some((entry) => /(?:migration.?19|commercial_case_foundation)/i.test(entry.name)), "migración 19 creada fuera de autoridad");

const schema = readFileSync("prisma/schema.prisma", "utf8");
const model = (name) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m"))?.[0] || "";
for (const name of ["BusinessEntity", "EntityContact", "Contact", "Location"]) {
  check(!/\btenantId\b|\btenant_id\b/.test(model(name)), `${name} se clasificó erróneamente como tenant-first`);
}
check(/payerContactId/.test(model("ServiceCase")) && /approverContactId/.test(model("ServiceCase")), "ServiceCase no conserva roles fijos legacy");
check(/originLocationId/.test(model("ServiceCase")) && /destinationLocationId/.test(model("ServiceCase")), "ServiceCase no conserva ubicaciones fijas legacy");

const sources = [
  readFileSync("src/commercial-crm/AdvancedErpShell.tsx", "utf8"),
  readFileSync("src/commercial-crm/CommercialInboxModule.tsx", "utf8"),
  readFileSync("src/commercial-crm/CommercialCaseDetail.tsx", "utf8"),
].join("\n");
check(!/useCasesStore|caseBridge|salesStore|localCaseCache/.test(sources), "se importó autoridad histórica");
check(!/localStorage|sessionStorage|indexedDB/.test(sources), "se introdujo storage empresarial");
check(!/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(sources), "se introdujo una mutación");
check(/Survey en integración/.test(sources) && /Cotización en integración/.test(sources), "tabs futuros no fallan explícitamente como integración");

console.log(JSON.stringify({ ok: true, assertions, migrations: migrations.length, migration19Created: false, dtoFields: EXPECTED_DETAIL_KEYS.length }));
