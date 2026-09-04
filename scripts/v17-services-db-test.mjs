import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createServiceCatalogItem,
  getCaseServiceWorkspace,
  getServiceCatalogHistory,
  listServiceCatalog,
  listServiceDefaults,
  saveCaseServiceSelection,
  saveServiceDefaults,
  updateServiceCatalogItem,
} from "../api/_lib/crmServicesApiDomain.js";
import { hashCrmServicesPayload } from "../api/_lib/crmServicesContract.js";

function target() {
  const raw = process.env.V17_SERVICES_TEST_DATABASE_URL;
  if (!raw) throw new Error("V17_SERVICES_TEST_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  const destination = `${parsed.port}${parsed.pathname}`;
  if (parsed.protocol !== "postgresql:" || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || !new Set(["55439/postgres", "55432/osi_db01n_ci"]).has(destination) || parsed.searchParams.get("schema") !== "osi") {
    throw new Error("V17_SERVICES_TEST_DATABASE_TARGET_REJECTED");
  }
  return raw;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: target() });
const results = [];
function check(name, condition) { assert.equal(Boolean(condition), true, name); results.push({ name, passed: true }); }
async function rejects(name, code, action) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  check(name, caught?.code === code);
}
async function throws(name, action) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  check(name, Boolean(caught));
}
function request(prefix) { return `${prefix}-${randomUUID()}`; }
function signed(operation, value) {
  const { payloadHash: _ignored, ...unsigned } = value;
  const payload = { operation, ...unsigned };
  return { ...unsigned, payloadHash: hashCrmServicesPayload(payload) };
}

const marker = randomUUID().replaceAll("-", "").slice(0, 10);
const tenantId = `svc_t_${marker}`;
const otherTenantId = `svc_x_${marker}`;
const userId = `svc_u_${marker}`;
const membershipId = `svc_m_${marker}`;
const sellerUserId = `svc_vu_${marker}`;
const sellerMembershipId = `svc_vm_${marker}`;
const caseId = `svc_c_${marker}`;
const sellerCaseId = `svc_vc_${marker}`;
const admin = Object.freeze({ tenantId, userId, membershipId });
const seller = Object.freeze({ tenantId, userId: sellerUserId, membershipId: sellerMembershipId });
let cleaned = false;

async function cleanup() {
  for (const table of ["commercial_audit_logs", "pipeline_case_service_revisions", "pipeline_case_service_items"]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."${table}" DISABLE TRIGGER USER`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.commercialAuditLog.deleteMany({ where: { tenant_id: tenantId } });
      await tx.serviceMutationCommand.deleteMany({ where: { tenantId } });
      await tx.pipelineCaseServiceItem.deleteMany({ where: { tenantId } });
      await tx.pipelineCaseServiceRevision.deleteMany({ where: { tenantId } });
      await tx.serviceDefaultCombinationItem.deleteMany({ where: { tenantId } });
      await tx.serviceDefaultCombination.deleteMany({ where: { tenantId } });
      await tx.serviceCatalogCompatibility.deleteMany({ where: { tenantId } });
      await tx.serviceCatalogItem.deleteMany({ where: { tenantId } });
      await tx.pipelineCase.deleteMany({ where: { tenantId } });
      await tx.tenantMembership.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { id: { in: [userId, sellerUserId] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    });
    cleaned = true;
  } finally {
    for (const table of ["pipeline_case_service_items", "pipeline_case_service_revisions", "commercial_audit_logs"]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "osi"."${table}" ENABLE TRIGGER USER`);
    }
  }
}

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port, current_setting('neon.branch_id',true) AS neon");
  check("destino PostgreSQL 18 local aislado", identity[0]?.database === "postgres" && Number(identity[0]?.port) === 55439 && !identity[0]?.neon);
  await prisma.tenant.createMany({ data: [
    { id: tenantId, code: `SVC${marker}`.toUpperCase(), name: "Synthetic services tenant", countryCode: "DO" },
    { id: otherTenantId, code: `SVCX${marker}`.toUpperCase(), name: "Synthetic cross tenant", countryCode: "DO" },
  ] });
  await prisma.user.createMany({ data: [
    { id: userId, code: `SUA${marker}`.toUpperCase(), name: "Synthetic Admin", email: `svc-a-${marker}@example.invalid`, phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-04", passwordHash: "synthetic-not-login-capable" },
    { id: sellerUserId, code: `SUV${marker}`.toUpperCase(), name: "Synthetic Seller", email: `svc-v-${marker}@example.invalid`, phone: "0000000000", role: "V", status: "ACTIVE", joinDate: "2026-09-04", passwordHash: "synthetic-not-login-capable" },
  ] });
  await prisma.tenantMembership.createMany({ data: [
    { id: membershipId, tenantId, userId, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: ["services:catalog:view", "services:catalog:manage", "services:case:view", "services:case:update"] },
    { id: sellerMembershipId, tenantId, userId: sellerUserId, role: "V", status: "ACTIVE", isDefault: true, grantedPermissions: ["services:case:view", "services:case:update"] },
  ] });
  await prisma.pipelineCase.createMany({ data: [
    { id: caseId, tenantId, caseCode: `SVC-${marker}-A`, mode: "LOCAL", serviceType: "PENDING_DEFINITION", customerType: "L4_PERSONAL", ownerName: "Sin asignar", originLocation: "Synthetic origin", destinationLocation: "Synthetic destination" },
    { id: sellerCaseId, tenantId, caseCode: `SVC-${marker}-V`, mode: "LOCAL", serviceType: "PENDING_DEFINITION", customerType: "L4_PERSONAL", ownerId: sellerUserId, ownerMembershipId: sellerMembershipId, ownerUserId: sellerUserId, ownerName: "Synthetic Seller", originLocation: "Synthetic origin", destinationLocation: "Synthetic destination" },
  ] });
  const pipelineCase = await prisma.pipelineCase.findUniqueOrThrow({ where: { id: caseId }, select: { publicRef: true } });
  const sellerCase = await prisma.pipelineCase.findUniqueOrThrow({ where: { id: sellerCaseId }, select: { publicRef: true } });

  const compInput = signed("CATALOG_CREATE", { requestId: request("svc-comp"), code: "PACKING", name: "Empaque", category: "Preparación", usage: "COMPLEMENTARY", compatibleModes: [], sortOrder: 20, allowedComplementaryRefs: [] });
  const comp = await createServiceCatalogItem(admin, compInput, prisma);
  check("crea complementario tenant-first", comp.replayed === false && comp.item.code === "PACKING");
  const compReplay = await createServiceCatalogItem(admin, compInput, prisma);
  check("doble envío conserva un servicio, comando y auditoría", compReplay.replayed === true
    && await prisma.serviceCatalogItem.count({ where: { tenantId, code: "PACKING" } }) === 1
    && await prisma.serviceMutationCommand.count({ where: { tenantId, requestId: compInput.requestId } }) === 1
    && await prisma.commercialAuditLog.count({ where: { tenant_id: tenantId, request_id: compInput.requestId } }) === 1);
  await rejects("requestId con payload diferente produce conflicto", "CRM_SERVICES_IDEMPOTENCY_CONFLICT", () => createServiceCatalogItem(admin, signed("CATALOG_CREATE", { ...compInput, payloadHash: undefined, name: "Empaque alterado" }), prisma));

  const primaryInput = signed("CATALOG_CREATE", { requestId: request("svc-primary"), code: "MOV_RES", name: "Mudanza residencial", category: "Mudanzas", usage: "PRIMARY", compatibleModes: ["EXPORT", "LOCAL"], sortOrder: 10, allowedComplementaryRefs: [comp.item.serviceRef] });
  const primary = await createServiceCatalogItem(admin, primaryInput, prisma);
  check("principal publica sólo referencia opaca y permitidos", primary.item.allowedComplementaryRefs[0] === comp.item.serviceRef
    && !("id" in primary.item) && !("tenantId" in primary.item));
  const catalog = await listServiceCatalog(admin, {}, prisma);
  const publicPrimary = catalog.find((item) => item.serviceRef === primary.item.serviceRef);
  check("catálogo devuelve compatibilidad administrada", publicPrimary?.allowedComplementaryRefs[0] === comp.item.serviceRef);

  const defaultsInput = signed("DEFAULTS_SAVE", { requestId: request("svc-default"), primaryServiceRef: primary.item.serviceRef, combinationRef: null, code: "MOV_RES_STD", name: "Residencial estándar", isDefault: true, status: "ACTIVE", expectedVersion: null, complementaryRefs: [comp.item.serviceRef] });
  const defaultsSaved = await saveServiceDefaults(admin, defaultsInput, prisma);
  const defaults = await listServiceDefaults(admin, primary.item.serviceRef, prisma);
  check("combinación predeterminada versionada y permitida", defaultsSaved.version === 1 && defaults.length === 1 && defaults[0].complementaries[0].code === "PACKING");

  const readCountsBefore = await Promise.all([prisma.serviceMutationCommand.count({ where: { tenantId } }), prisma.commercialAuditLog.count({ where: { tenant_id: tenantId } }), prisma.pipelineCaseServiceRevision.count({ where: { tenantId } })]);
  const initialWorkspace = await getCaseServiceWorkspace(admin, pipelineCase.publicRef, prisma);
  const readCountsAfter = await Promise.all([prisma.serviceMutationCommand.count({ where: { tenantId } }), prisma.commercialAuditLog.count({ where: { tenant_id: tenantId } }), prisma.pipelineCaseServiceRevision.count({ where: { tenantId } })]);
  check("GET no escribe y el modo procede del ICP", JSON.stringify(readCountsBefore) === JSON.stringify(readCountsAfter) && initialWorkspace.mode === "LOCAL");

  const selectionInput = signed("CASE_SELECTION_SAVE", { requestId: request("svc-select"), expectedRevision: 0, primaryServiceRef: primary.item.serviceRef, complementaryRefs: [comp.item.serviceRef], defaultCombinationRef: defaultsSaved.combinationRef, otherServices: [{ description: "Servicio sintético por clasificar" }] });
  const selection = await saveCaseServiceSelection(admin, pipelineCase.publicRef, selectionInput, prisma);
  check("selección copia default y OTHER como PENDING", selection.selection.revision === 1 && selection.selection.complementaries[0].source === "DEFAULT" && selection.selection.otherServices[0].classificationStatus === "PENDING");
  const selectionReplay = await saveCaseServiceSelection(admin, pipelineCase.publicRef, selectionInput, prisma);
  check("replay no crea revisión adicional", selectionReplay.replayed === true && await prisma.pipelineCaseServiceRevision.count({ where: { tenantId, pipelineCaseId: caseId } }) === 1);
  check("editar caso no muta defaults globales", (await listServiceDefaults(admin, primary.item.serviceRef, prisma))[0].version === 1);

  const updated = await updateServiceCatalogItem(admin, primary.item.serviceRef, signed("CATALOG_UPDATE", { requestId: request("svc-update"), expectedVersion: 1, name: "Mudanza residencial vigente", category: "Mudanzas", usage: "PRIMARY", compatibleModes: ["EXPORT", "LOCAL"], status: "ACTIVE", sortOrder: 10, allowedComplementaryRefs: [comp.item.serviceRef] }), prisma);
  const workspaceAfterRename = await getCaseServiceWorkspace(admin, pipelineCase.publicRef, prisma);
  check("snapshot histórico conserva nombre y versión anteriores", updated.item.version === 2 && workspaceAfterRename.selection.primary.name === "Mudanza residencial" && workspaceAfterRename.selection.primary.catalogVersion === 1);
  check("historial de catálogo está auditado", (await getServiceCatalogHistory(admin, primary.item.serviceRef, prisma)).events.length === 2);

  await rejects("V no consulta caso sin owner", "CRM_SERVICES_RESOURCE_NOT_FOUND", () => getCaseServiceWorkspace(seller, pipelineCase.publicRef, prisma));
  check("V consulta sólo su caso con owner completo", (await getCaseServiceWorkspace(seller, sellerCase.publicRef, prisma)).caseRef === sellerCase.publicRef);
  await rejects("tenant ajeno obtiene 404 indistinguible", "CRM_SERVICES_RESOURCE_NOT_FOUND", () => getCaseServiceWorkspace({ tenantId: otherTenantId, membershipId, userId }, pipelineCase.publicRef, prisma));
  await rejects("UUID no canónico se rechaza antes de Prisma", "CRM_SERVICES_RESOURCE_NOT_FOUND", () => getCaseServiceWorkspace(admin, caseId, prisma));

  const concurrency = await Promise.allSettled([
    saveCaseServiceSelection(admin, pipelineCase.publicRef, signed("CASE_SELECTION_SAVE", { requestId: request("svc-race-a"), expectedRevision: 1, primaryServiceRef: primary.item.serviceRef, complementaryRefs: [], defaultCombinationRef: null, otherServices: [] }), prisma),
    saveCaseServiceSelection(admin, pipelineCase.publicRef, signed("CASE_SELECTION_SAVE", { requestId: request("svc-race-b"), expectedRevision: 1, primaryServiceRef: primary.item.serviceRef, complementaryRefs: [comp.item.serviceRef], defaultCombinationRef: null, otherServices: [] }), prisma),
  ]);
  check("concurrencia optimista produce un ganador", concurrency.filter((item) => item.status === "fulfilled").length === 1 && concurrency.filter((item) => item.status === "rejected").length === 1);
  check("revisiones siguen append-only y consecutivas", (await prisma.pipelineCaseServiceRevision.findMany({ where: { tenantId, pipelineCaseId: caseId }, orderBy: { revision: "asc" }, select: { revision: true } })).map((item) => item.revision).join(",") === "1,2");
  const packingRow = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { tenantId, code: "PACKING" }, select: { id: true } });
  await throws("trigger impide cambiar publicRef", () => prisma.$executeRawUnsafe(`UPDATE "osi"."service_catalog_items" SET "service_ref"=gen_random_uuid() WHERE "tenant_id"=$1 AND "id"=$2`, tenantId, packingRow.id));
} finally {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
}

check("fixtures PostgreSQL eliminados", cleaned);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
