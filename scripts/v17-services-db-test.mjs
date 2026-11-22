import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createServiceCatalogCategory,
  createServiceCatalogItem,
  getCaseServiceWorkspace,
  getServiceCatalogHistory,
  listServiceCatalog,
  listServiceCatalogCategories,
  listServiceDefaults,
  saveCaseServiceSelection,
  saveServiceDefaults,
  updateServiceCatalogCategory,
  updateServiceCatalogItem,
} from "../api/_lib/crmServicesApiDomain.js";
import { hashCrmServicesPayload } from "../api/_lib/crmServicesContract.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";

const localTarget = validateV17ServicesTestUrl();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: localTarget.raw });
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
const otherMembershipId = `svc_xm_${marker}`;
const sellerUserId = `svc_vu_${marker}`;
const sellerMembershipId = `svc_vm_${marker}`;
const caseId = `svc_c_${marker}`;
const sellerCaseId = `svc_vc_${marker}`;
const admin = Object.freeze({ tenantId, userId, membershipId });
const otherAdmin = Object.freeze({ tenantId: otherTenantId, userId, membershipId: otherMembershipId });
const seller = Object.freeze({ tenantId, userId: sellerUserId, membershipId: sellerMembershipId });
let cleaned = false;
let targetVerified = false;

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
      await tx.serviceCatalogCategory.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await tx.pipelineCase.deleteMany({ where: { tenantId } });
      await tx.tenantMembership.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
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
  await verifyV17ServicesLocalDatabase(prisma, localTarget);
  targetVerified = true;
  check("destino PostgreSQL 18 local aislado", targetVerified);
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
    { id: otherMembershipId, tenantId: otherTenantId, userId, role: "A", status: "ACTIVE", isDefault: false, grantedPermissions: ["services:catalog:view", "services:catalog:manage"] },
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
  check("plan vigente publica resumen versionado e inmutable", workspaceAfterRename.planHistory.length === 1 && workspaceAfterRename.planHistory[0].revision === 1
    && workspaceAfterRename.planHistory[0].primary.name === "Mudanza residencial" && workspaceAfterRename.planHistory[0].associatedServices[0].name === comp.item.name
    && workspaceAfterRename.planHistory[0].otherServices[0] === "Servicio sintético por clasificar" && !Number.isNaN(Date.parse(workspaceAfterRename.planHistory[0].createdAt)));
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
  const versionedPlan = await getCaseServiceWorkspace(admin, pipelineCase.publicRef, prisma);
  check("historial del plan conserva vigente y anterior", versionedPlan.selection.revision === 2 && versionedPlan.selection.historyCount === 2
    && versionedPlan.planHistory.map((item) => item.revision).join(",") === "2,1" && versionedPlan.planHistory[1].primary.name === "Mudanza residencial");
  const automaticInput = signed("CATALOG_CREATE", { ...compInput, requestId: request("auto-catalog"), code: null, name: "Servicio de código automático" });
  const automatic = await createServiceCatalogItem(admin, automaticInput, prisma);
  const automaticReplay = await createServiceCatalogItem(admin, automaticInput, prisma);
  check("alta sin código manual asigna código público y replay conserva identidad", /^SER_[A-F0-9]{16}$/.test(automatic.item.code)
    && automaticReplay.replayed && automaticReplay.item.serviceRef === automatic.item.serviceRef && automaticReplay.item.code === automatic.item.code
    && await prisma.serviceMutationCommand.count({ where: { tenantId, requestId: automaticInput.requestId } }) === 1);
  await rejects("código automático no evita control de payload al reintentar", "CRM_SERVICES_IDEMPOTENCY_CONFLICT", () => createServiceCatalogItem(admin, signed("CATALOG_CREATE", { ...automaticInput, name: "Alterado" }), prisma));
  const automaticRace = await Promise.all([
    createServiceCatalogItem(admin, signed("CATALOG_CREATE", { ...automaticInput, requestId: request("auto-race-a"), name: "Inventario inicial" }), prisma),
    createServiceCatalogItem(admin, signed("CATALOG_CREATE", { ...automaticInput, requestId: request("auto-race-b"), name: "Inventario final" }), prisma),
  ]);
  check("dos altas simultáneas generan códigos distintos", automaticRace[0].item.code !== automaticRace[1].item.code
    && automaticRace.every((result) => /^SER_[A-F0-9]{16}$/.test(result.item.code)));
  const automaticRenamed = await updateServiceCatalogItem(admin, automatic.item.serviceRef, signed("CATALOG_UPDATE", {
    requestId: request("auto-rename"), expectedVersion: 1, name: "Servicio automático renombrado", category: null,
    usage: "COMPLEMENTARY", compatibleModes: [], status: "ACTIVE", sortOrder: 20, allowedComplementaryRefs: [],
  }), prisma);
  check("renombrar conserva código automático", automaticRenamed.item.code === automatic.item.code && automaticRenamed.item.version === 2);

  const duplicateName = "CRM_SERVICES_DUPLICATE_NAME";
  const catalogCreate = (name, category) => signed("CATALOG_CREATE", {
    ...automaticInput, name, category, requestId: request("catalog-name-create"),
  });

  const categoriesBefore = await listServiceCatalogCategories(admin, prisma);
  check("la lista incluye las categorías iniciales y las utilizadas previamente",
    categoriesBefore.some(({ code, version }) => code === "STORAGE" && version === 0)
    && categoriesBefore.some(({ code, name }) => code === "Preparación" && name === "Preparación"));
  const categoryCreate = (name) => signed("CATEGORY_CREATE", { requestId: request("category-create"), name });
  const categoryUpdate = (code, name, expectedVersion) => signed("CATEGORY_UPDATE", {
    requestId: request("category-update"), code, name, expectedVersion,
  });
  const createCategoryInput = categoryCreate("Montaje técnico");
  const createdCategory = await createServiceCatalogCategory(admin, createCategoryInput, prisma);
  const categoryCode = createdCategory.item.code;
  const replayedCategory = await createServiceCatalogCategory(admin, createCategoryInput, prisma);
  check("alta de categoría genera un código y el reintento recupera el mismo registro",
    /^CAT_[A-F0-9]{16}$/.test(categoryCode) && replayedCategory.replayed && replayedCategory.item.code === categoryCode);
  await rejects("la categoría no admite nombres equivalentes", "CRM_SERVICES_CATEGORY_DUPLICATE_NAME",
    () => createServiceCatalogCategory(admin, categoryCreate("MONTAJE  TECNICO"), prisma));
  await rejects("la categoría tampoco permite duplicar una opción inicial", "CRM_SERVICES_CATEGORY_DUPLICATE_NAME",
    () => createServiceCatalogCategory(admin, categoryCreate("EMPAQUE  Y EMBALAJE"), prisma));
  check("las categorías personalizadas son específicas de la empresa",
    !(await listServiceCatalogCategories(otherAdmin, prisma)).some(({ code }) => code === categoryCode));
  await rejects("otra empresa no puede asignar una categoría ajena", "CRM_SERVICES_CATEGORY_NOT_FOUND",
    () => createServiceCatalogItem(otherAdmin, catalogCreate("Servicio con categoría ajena", categoryCode), prisma));

  const categorized = await createServiceCatalogItem(admin, catalogCreate("Instalación de módulos", categoryCode), prisma);
  const renamed = await updateServiceCatalogCategory(admin, categoryUpdate(categoryCode, "Montaje de equipos", 1), prisma);
  const storageLabel = await updateServiceCatalogCategory(admin, categoryUpdate("STORAGE", "Guardamuebles y custodia", 0), prisma);
  check("renombrar cambia el nombre visible y conserva la referencia del servicio",
    renamed.item.code === categoryCode && renamed.item.version === 2 && storageLabel.item.code === "STORAGE"
    && (await listServiceCatalog(admin, {}, prisma)).some(({ serviceRef, category }) =>
      serviceRef === categorized.item.serviceRef && category === categoryCode)
    && (await listServiceCatalogCategories(admin, prisma)).some(({ code, name }) =>
      code === categoryCode && name === "Montaje de equipos"));
  await rejects("una versión anterior no sobrescribe una categoría modificada", "CRM_SERVICES_VERSION_CONFLICT",
    () => updateServiceCatalogCategory(admin, categoryUpdate(categoryCode, "Edición anterior", 1), prisma));
  await rejects("un vendedor no administra las categorías", "CRM_SERVICES_PERMISSION_FORBIDDEN",
    () => createServiceCatalogCategory(seller, categoryCreate("Categoría sin autorización"), prisma));

  const updateCatalog = (item, changes) => updateServiceCatalogItem(admin, item.serviceRef, signed("CATALOG_UPDATE", {
    requestId: request("catalog-name-update"), expectedVersion: item.version,
    name: item.name, category: item.category, usage: item.usage, compatibleModes: item.compatibleModes,
    status: item.status, sortOrder: item.sortOrder, allowedComplementaryRefs: item.allowedComplementaryRefs ?? [],
    ...changes,
  }), prisma);

  const protection = await createServiceCatalogItem(admin, catalogCreate("Protección   de muebles", "Preparación"), prisma);
  const normalizedProtection = catalogCreate("PROTECCION DE  MUEBLES", "Preparación");
  await rejects("alta detecta duplicado activo sin distinguir espacios, tildes ni mayúsculas", duplicateName,
    () => createServiceCatalogItem(admin, normalizedProtection, prisma));
  const differentCategory = await createServiceCatalogItem(admin, catalogCreate(normalizedProtection.name, "Almacenaje"), prisma);
  check("nombres iguales de categorías distintas conservan registros independientes", differentCategory.item.serviceRef !== protection.item.serviceRef);
  await rejects("cambiar de categoría no puede introducir un duplicado", duplicateName,
    () => updateCatalog(differentCategory.item, { category: protection.item.category }));
  await rejects("renombrar no puede introducir un duplicado", duplicateName,
    () => updateCatalog(automaticRace[0].item, { name: normalizedProtection.name }));
  await rejects("los servicios sin categoría también reservan su nombre", duplicateName,
    () => createServiceCatalogItem(admin, catalogCreate("SERVICIO AUTOMATICO RENOMBRADO", null), prisma));
  const inactiveProtection = await updateCatalog(protection.item, { status: "INACTIVE" });
  await rejects("un registro inactivo evita el alta con el mismo nombre", duplicateName,
    () => createServiceCatalogItem(admin, normalizedProtection, prisma));
  check("se puede reactivar el registro existente",
    (await updateCatalog(inactiveProtection.item, { status: "ACTIVE" })).item.status === "ACTIVE");

  const legacyActive = await prisma.serviceCatalogItem.create({
    data: { tenantId, code: "LEGACY_FURNITURE_A", name: "Trasládo de mobiliario", category: "Mudanzas", usage: "COMPLEMENTARY", status: "ACTIVE" },
  });
  const legacyInactive = await prisma.serviceCatalogItem.create({
    data: { tenantId, code: "LEGACY_FURNITURE_B", name: "TRASLADO  DE MOBILIARIO", category: "Mudanzas", usage: "COMPLEMENTARY", status: "INACTIVE" },
  });
  await rejects("una copia histórica inactiva queda bloqueada mientras la otra esté activa", duplicateName,
    () => updateCatalog(legacyInactive, { status: "ACTIVE" }));
  const legacyEdited = await updateCatalog(legacyActive, { sortOrder: 25 });
  check("se puede editar una copia histórica conservando su nombre y categoría", legacyEdited.item.sortOrder === 25);
  const legacyDeactivated = await updateCatalog(legacyEdited.item, { status: "INACTIVE" });
  check("se puede desactivar una copia histórica y reactivar otra", legacyDeactivated.item.status === "INACTIVE"
    && (await updateCatalog(legacyInactive, { status: "ACTIVE" })).item.status === "ACTIVE");

  const raceCategory = "Concurrencia de catálogo";
  const sameNameInputs = [catalogCreate("Carga  compartída", raceCategory), catalogCreate("CARGA COMPARTIDA", raceCategory)];
  const duplicatesRace = await Promise.allSettled(sameNameInputs.map((input) => createServiceCatalogItem(admin, input, prisma)));
  check("altas simultáneas con nombre equivalente dejan un solo registro", duplicatesRace.filter((result) => result.status === "fulfilled").length === 1
    && await prisma.serviceCatalogItem.count({ where: { tenantId, category: raceCategory } }) === 1);
  const losingIndex = duplicatesRace.findIndex((result) => result.status === "rejected");
  const loser = duplicatesRace[losingIndex];
  check("la otra alta simultánea recibe un conflicto", loser?.reason.code === duplicateName || loser?.reason.code === "CRM_SERVICES_COMMAND_IN_PROGRESS");
  if (loser.reason.code === "CRM_SERVICES_COMMAND_IN_PROGRESS") {
    await rejects("reintentar el alta simultánea detecta el duplicado ya guardado", duplicateName,
      () => createServiceCatalogItem(admin, sameNameInputs[losingIndex], prisma));
  }

  const automaticDefaultInput = signed("DEFAULTS_SAVE", { ...defaultsInput, requestId: request("auto-default"), code: null, name: "Combinación automática", isDefault: false });
  const automaticDefault = await saveServiceDefaults(admin, automaticDefaultInput, prisma);
  const automaticDefaultReplay = await saveServiceDefaults(admin, automaticDefaultInput, prisma);
  const automaticDefaultRow = (await listServiceDefaults(admin, primary.item.serviceRef, prisma)).find((row) => row.combinationRef === automaticDefault.combinationRef);
  check("combinación predeterminada puede asignar código y reutilizar el resultado", /^PRE_[A-F0-9]{16}$/.test(automaticDefaultRow.code)
    && automaticDefaultReplay.replayed && automaticDefaultReplay.combinationRef === automaticDefault.combinationRef);
  await saveServiceDefaults(admin, signed("DEFAULTS_SAVE", { ...automaticDefaultInput, requestId: request("auto-default-edit"), combinationRef: automaticDefault.combinationRef, expectedVersion: 1, name: "Combinación renombrada" }), prisma);
  const automaticDefaultUpdated = (await listServiceDefaults(admin, primary.item.serviceRef, prisma)).find((row) => row.combinationRef === automaticDefault.combinationRef);
  check("versión con código null conserva el código original", automaticDefaultUpdated.code === automaticDefaultRow.code && automaticDefaultUpdated.version === 2);
  await rejects("edición no puede reemplazar código automático", "CRM_SERVICES_IDENTITY_IMMUTABLE", () => saveServiceDefaults(admin, signed("DEFAULTS_SAVE", { ...automaticDefaultInput, requestId: request("auto-default-spoof"), combinationRef: automaticDefault.combinationRef, expectedVersion: 2, code: "REPLACEMENT" }), prisma));
  const packingRow = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { tenantId, code: "PACKING" }, select: { id: true } });
  await throws("trigger impide cambiar publicRef", () => prisma.$executeRawUnsafe(`UPDATE "osi"."service_catalog_items" SET "service_ref"=gen_random_uuid() WHERE "tenant_id"=$1 AND "id"=$2`, tenantId, packingRow.id));
} finally {
  try { if (targetVerified) await cleanup(); } finally { await prisma.$disconnect(); }
}

check("fixtures PostgreSQL eliminados", cleaned);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
