import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

const STATUSES = Object.freeze([
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "CHANGE_CONTROL",
  "APPROVED", "OPS_HANDOFF", "QUOTE_DRAFT", "WON", "LOST",
]);
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function caseData(id, tenantId, status) {
  return {
    id, tenantId, caseCode: id.toUpperCase(), clientName: "Dry-run fixture", mode: "LOCAL",
    serviceType: "MOVING", customerType: "L4_PERSONAL", status,
    ownerName: "Unassigned", originLocation: "Origin", destinationLocation: "Destination",
    ...(status === "LOST" ? { lossReasonCode: "OTHER" } : {}),
  };
}

const { prisma, target } = await createCrm01b1LocalPrisma();
const run = `crm01b1-dry-${Date.now()}`;
const tenantId = `${run}-tenant`;
const userId = `${run}-user`;
const membershipId = `${run}-membership`;
const clientId = `${run}-client`;
const projectId = `${run}-project`;
const caseIds = STATUSES.map((status) => `${run}-${status.toLowerCase()}`);

try {
  await prisma.tenant.create({ data: { id: tenantId, code: `${run}-T`.toUpperCase(), name: "Dry-run tenant" } });
  await prisma.user.create({ data: {
    id: userId, code: `${run}-U`.toUpperCase(), name: "Dry-run actor", email: `${run}@example.test`,
    phone: "0000000000", role: "A", status: "active", joinDate: "2026-08-11", passwordHash: "synthetic-not-login",
  } });
  await prisma.tenantMembership.create({ data: { id: membershipId, tenantId, userId, role: "A", status: "ACTIVE" } });
  await prisma.pipelineCase.createMany({ data: STATUSES.map((status, index) => caseData(caseIds[index], tenantId, status)) });
  await prisma.client.create({ data: {
    id: clientId, tenantId, code: `${run}-CLIENT`.toUpperCase(), name: "Dry-run client", email: `${run}-client@example.test`,
    phone: "0000000000", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-11",
  } });
  await prisma.project.create({ data: {
    id: projectId, tenantId, pipelineCaseId: null, code: `${run}-PROJECT`.toUpperCase(), name: "Dry-run project",
    clientId, clientName: "Dry-run client", status: "active", startDate: "2026-08-11",
  } });

  const child = spawnSync(process.execPath, [resolve("scripts/crm-01b1-dry-run.mjs")], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  check("dry-run representativo termina correctamente", child.status === 0);
  const report = JSON.parse(child.stdout);
  check("APPROVED queda clasificado como congelado", report.approvedFrozen >= 1);
  check("los 15 estados heredados quedan clasificados", Object.values(report.legacyStatusCounts).every((count) => count >= 1));
  check("WON y LOST válidos no se clasifican como desconocidos", report.unknownStatuses.length === 0);
  check("todas las versiones iniciales permanecen en uno", report.pipelineCases.unexpectedVersion === 0);
  check("no se fabrican fechas históricas", report.pipelineCases.statusChangedAtPresent === 0);
  check("Project permanece sin relación automática", report.projects.withoutPipelineCase >= 1 && report.projects.related === 0);
  check("journal permanece vacío y dry-run no escribe", report.commands === 0 && report.wroteRows === 0 && report.readOnly === true);
} finally {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.pipelineCase.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.tenantMembership.deleteMany({ where: { id: membershipId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
}

process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, results }, null, 2)}\n`);
