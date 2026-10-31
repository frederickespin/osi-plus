import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import {
  createAdminFleetVehicle, getAdminFleetVehicle, listAdminFleetVehicles, updateAdminFleetVehicle,
} from "../api/_lib/adminFleetDomain.js";

// This suite can write only to the disposable canonical CI database. It never
// reads DATABASE_URL, dotenv, the consolidated Preview or a real company.
assert.equal(process.env.CANONICAL_DB_VALIDATION, "true", "19D DB suite requires disposable canonical CI");
assert.equal(validateCrm01b1LocalUrl(process.env.CRM01B1_TEST_DATABASE_URL).database, "osi_db01n_ci");
const { prisma } = await createCrm01b1LocalPrisma(process.env.CRM01B1_TEST_DATABASE_URL);
const suffix = randomUUID().slice(0, 8);
const results = [];
const permissions = ["fleet:view", "fleet:edit"];
const source = "V17_ADMINISTRATION_FLEET_19D";
function check(name, condition) { assert.ok(condition, name); results.push({ name, passed: true }); }
async function rejects(name, action, code) {
  await assert.rejects(action, (error) => error.code === code, name);
  results.push({ name, passed: true });
}
async function user(label, role = "A") {
  const email = suffix + "-" + label + "@example.invalid";
  return prisma.user.create({ data: {
    id: randomUUID(), code: ("FL19D-" + suffix + "-" + label).toUpperCase(),
    name: "Synthetic Fleet " + label, email, normalizedEmail: email, phone: "+18095550000",
    role, status: "active", joinDate: "2026-10-30", passwordHash: await bcrypt.hash("Synthetic-Fleet-19D-123!", 4),
  } });
}
async function membership(tenant, actor, role = "A") {
  return prisma.tenantMembership.create({ data: {
    id: randomUUID(), tenantId: tenant.id, userId: actor.id, role, status: "ACTIVE",
    grantedPermissions: permissions, deniedPermissions: [], isDefault: true,
  } });
}
function context(tenant, actor, member, role = "A") {
  return { tenantId: tenant.id, userId: actor.id, membershipId: member.id, role,
    effectivePermissions: permissions, permissions, deniedPermissions: [] };
}
function input(label, extra = {}) {
  return {
    requestId: randomUUID(), businessCode: "F19D-" + suffix + "-" + label, vehicleType: "TRUCK",
    plate: "Q" + suffix + label, vin: "VF" + suffix + label,
    brand: "QA", model: "Synthetic", modelYear: 2026,
    capacityWeight: 12000, capacityVolume: 1800, usableLength: 6.2, usableWidth: 2.3, usableHeight: 2.5,
    weightUnit: "LB", volumeUnit: "CFT", dimensionUnit: "M",
    effectiveFrom: "2026-10-30T04:00:00.000Z", hubCode: "QA-METRO", ...extra,
  };
}
const patch = (expectedVersion, changes, requestId = randomUUID()) => ({ requestId, expectedVersion, changes });
const auditCount = (tenantId, requestId) => prisma.commercialAuditLog.count({ where: { tenant_id: tenantId, request_id: requestId, source } });

try {
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: ("FL19D-" + suffix).toUpperCase(), name: "Fleet QA " + suffix } });
  const foreignTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: ("FL19DX-" + suffix).toUpperCase(), name: "Fleet foreign QA " + suffix } });
  const actor = await user("actor"); const foreignActor = await user("foreign");
  const member = await membership(tenant, actor); const foreignMember = await membership(foreignTenant, foreignActor);
  const ctx = context(tenant, actor, member); const foreignCtx = context(foreignTenant, foreignActor, foreignMember);
  const originalInput = input("001");
  const created = await createAdminFleetVehicle(prisma, ctx, originalInput);
  let vehicle = created.vehicle;
  const ref = vehicle.vehicleRef;
  check("create persists a vehicle with version one and explicit units", created.created && !created.idempotent && vehicle.rowVersion === 1
    && vehicle.weightUnit === "LB" && vehicle.volumeUnit === "CFT" && vehicle.capacityWeight === 12000 && vehicle.capacityVolume === 1800);
  check("vehicle DTO excludes tenant, actors, import sources, fingerprints and audit internals",
    !["id", "tenantId", "tenant_id", "userId", "created_by_user_id", "created_by_membership_id", "source", "request_id", "payload_hash", "import_batch_id"].some((key) => Object.hasOwn(vehicle, key)));
  const originalRow = await prisma.vehicle.findUnique({ where: { id: ref } });
  check("persistence binds the existing company and authenticated actor", originalRow.tenant_id === tenant.id
    && originalRow.created_by_user_id === actor.id && originalRow.created_by_membership_id === member.id);
  check("create writes one critical audit in the same database", await auditCount(tenant.id, originalInput.requestId) === 1);
  const replay = await createAdminFleetVehicle(prisma, ctx, originalInput);
  check("same creation request is idempotent without a second row or event", !replay.created && replay.idempotent && replay.vehicle.vehicleRef === ref
    && await prisma.vehicle.count({ where: { tenant_id: tenant.id } }) === 1 && await auditCount(tenant.id, originalInput.requestId) === 1);
  await rejects("same request cannot change the creation payload", () => createAdminFleetVehicle(prisma, ctx, { ...originalInput, brand: "Changed" }), "ADMIN_FLEET_REQUEST_CONFLICT");
  await rejects("normalized business code is unique within the company", () => createAdminFleetVehicle(prisma, ctx, input("002", { businessCode: originalInput.businessCode.toLowerCase().replaceAll("-", " ") })), "ADMIN_FLEET_DUPLICATE");
  await rejects("normalized plate is unique within the company", () => createAdminFleetVehicle(prisma, ctx, input("003", { plate: originalInput.plate.toLowerCase() })), "ADMIN_FLEET_DUPLICATE");
  await rejects("normalized VIN is unique within the company", () => createAdminFleetVehicle(prisma, ctx, input("004", { vin: originalInput.vin.toLowerCase() })), "ADMIN_FLEET_DUPLICATE");
  const foreign = await createAdminFleetVehicle(prisma, foreignCtx, { ...originalInput, requestId: randomUUID() });
  check("the same code, plate and VIN can be registered in an independent company", foreign.vehicle.vehicleRef !== ref);
  const directory = await listAdminFleetVehicles(prisma, ctx, { search: suffix, vehicleType: "TRUCK", operationalStatus: "AVAILABLE", page: 1, pageSize: 1 });
  check("list, filters, totals and pagination are company scoped", directory.total === 1 && directory.data.length === 1 && directory.data[0].vehicleRef === ref && directory.pageSize === 1);
  const literalSearch = await listAdminFleetVehicles(prisma, ctx, { search: "%" });
  check("search wildcards are treated as literal text", literalSearch.total === 0);
  await rejects("foreign detail is indistinguishable from a missing vehicle", () => getAdminFleetVehicle(prisma, foreignCtx, ref), "ADMIN_FLEET_NOT_FOUND");
  await rejects("foreign mutation cannot target a known vehicle reference", () => updateAdminFleetVehicle(prisma, foreignCtx, ref, patch(1, { model: "Foreign write" })), "ADMIN_FLEET_NOT_FOUND");

  const editRequest = randomUUID();
  vehicle = await updateAdminFleetVehicle(prisma, ctx, ref, patch(1, { model: "Persistent model", plate: "EDIT" + suffix }, editRequest));
  check("edit survives a fresh read and advances only its vehicle version", vehicle.rowVersion === 2 && (await getAdminFleetVehicle(prisma, ctx, ref)).model === "Persistent model");
  const editedRow = await prisma.vehicle.findUnique({ where: { id: ref } });
  check("editing preserves original creation request and fingerprint", editedRow.request_id === originalRow.request_id && editedRow.payload_hash === originalRow.payload_hash
    && editedRow.created_by_user_id === originalRow.created_by_user_id && editedRow.source === originalRow.source);
  const replayAfterEdit = await createAdminFleetVehicle(prisma, ctx, originalInput);
  check("original create replay returns current representation without overwriting edits", replayAfterEdit.idempotent && replayAfterEdit.vehicle.rowVersion === 2 && replayAfterEdit.vehicle.model === "Persistent model");
  const noOpRequest = randomUUID();
  const noOp = await updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { model: vehicle.model, effectiveFrom: vehicle.effectiveFrom, capacityWeight: vehicle.capacityWeight }, noOpRequest));
  check("a no-op preserves version and timestamp without an audit event", noOp.rowVersion === vehicle.rowVersion && noOp.updatedAt === vehicle.updatedAt && await auditCount(tenant.id, noOpRequest) === 0);
  await rejects("stale version cannot overwrite a newer edit", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(1, { brand: "Stale" })), "ADMIN_FLEET_VERSION_CONFLICT");
  await rejects("a used patch request cannot represent another edit", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { brand: "Replay" }, editRequest)), "ADMIN_FLEET_REQUEST_CONFLICT");
  await rejects("a creation request cannot be reused for editing", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { brand: "Reuse create" }, originalInput.requestId)), "ADMIN_FLEET_REQUEST_CONFLICT");

  const second = await createAdminFleetVehicle(prisma, ctx, input("005"));
  await rejects("an edit cannot take another vehicle plate", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { plate: second.vehicle.plate })), "ADMIN_FLEET_DUPLICATE");
  check("a rejected duplicate leaves the vehicle unchanged", (await getAdminFleetVehicle(prisma, ctx, ref)).plate === vehicle.plate);
  const failingCreate = input("006");
  await assert.rejects(() => createAdminFleetVehicle(prisma, ctx, failingCreate, { auditWriter: async () => { throw new Error("synthetic fleet audit failure"); } }),
    { message: "synthetic fleet audit failure" });
  check("audit failure rolls back creation", await prisma.vehicle.count({ where: { tenant_id: tenant.id, request_id: failingCreate.requestId } }) === 0);
  const failingEditId = randomUUID();
  await assert.rejects(() => updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { model: "Must roll back" }, failingEditId),
    { auditWriter: async () => { throw new Error("synthetic fleet audit failure"); } }), { message: "synthetic fleet audit failure" });
  check("audit failure rolls back edit and row version", (await getAdminFleetVehicle(prisma, ctx, ref)).model === vehicle.model
    && (await getAdminFleetVehicle(prisma, ctx, ref)).rowVersion === 2 && await auditCount(tenant.id, failingEditId) === 0);
  const simultaneous = await Promise.allSettled([
    updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { brand: "Concurrent A" })),
    updateAdminFleetVehicle(prisma, ctx, ref, patch(2, { brand: "Concurrent B" })),
  ]);
  check("same-version simultaneous writes commit exactly once", simultaneous.filter((entry) => entry.status === "fulfilled").length === 1
    && simultaneous.filter((entry) => entry.status === "rejected" && entry.reason.code === "ADMIN_FLEET_VERSION_CONFLICT").length === 1
    && (await getAdminFleetVehicle(prisma, ctx, ref)).rowVersion === 3);

  const readonlyContext = { ...ctx, permissions: ["fleet:view"], effectivePermissions: ["fleet:view"] };
  check("a read-only context can list vehicles", (await listAdminFleetVehicles(prisma, readonlyContext)).total === 2);
  await rejects("read-only context cannot create", () => createAdminFleetVehicle(prisma, readonlyContext, input("007")), "ADMIN_FLEET_FORBIDDEN");
  await rejects("explicit context denials override supplied grants", () => listAdminFleetVehicles(prisma, { ...ctx, deniedPermissions: ["fleet:view"] }), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: member.id }, data: { deniedPermissions: ["fleet:edit"] } });
  await rejects("database permission revocation overrides a stale write context", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(3, { brand: "Revoked" })), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: member.id }, data: { deniedPermissions: ["fleet:view"] } });
  await rejects("database read denial overrides a stale read context", () => listAdminFleetVehicles(prisma, ctx), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: member.id }, data: { deniedPermissions: [], status: "SUSPENDED" } });
  await rejects("suspended membership cannot read", () => getAdminFleetVehicle(prisma, ctx, ref), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: member.id }, data: { status: "ACTIVE", role: "V" } });
  await rejects("changed database role overrides stale administrator context", () => listAdminFleetVehicles(prisma, ctx), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: member.id }, data: { role: "A" } });
  await prisma.user.update({ where: { id: actor.id }, data: { status: "inactive" } });
  await rejects("inactive global account cannot read", () => listAdminFleetVehicles(prisma, ctx), "ADMIN_FLEET_FORBIDDEN");
  await prisma.user.update({ where: { id: actor.id }, data: { status: "active" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
  await rejects("inactive company cannot read", () => listAdminFleetVehicles(prisma, ctx), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  await rejects("non-administrator context cannot read even with fleet grants", () => listAdminFleetVehicles(prisma, { ...ctx, role: "V" }), "ADMIN_FLEET_FORBIDDEN");

  await prisma.vehicle.update({ where: { id: ref }, data: { calculation_locked_at: new Date() } });
  check("calculation lock is visible without exposing internal dates", (await getAdminFleetVehicle(prisma, ctx, ref)).calculationLocked);
  await rejects("used technical capacity is protected from editing", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(3, { capacityWeight: 13000 })), "ADMIN_FLEET_CALCULATION_LOCKED");
  await rejects("used technical units are protected from editing", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(3, { weightUnit: "KG" })), "ADMIN_FLEET_CALCULATION_LOCKED");
  vehicle = await updateAdminFleetVehicle(prisma, ctx, ref, patch(3, { operationalStatus: "UNAVAILABLE" }));
  check("operational state remains editable after calculation and disables availability", vehicle.rowVersion === 4 && vehicle.operationalStatus === "UNAVAILABLE" && !vehicle.availableForCalculation);
  const retirementRequest = randomUUID();
  vehicle = await updateAdminFleetVehicle(prisma, ctx, ref, patch(4, { operationalStatus: "RETIRED" }, retirementRequest));
  check("retirement preserves the record and records date, version and audit", vehicle.operationalStatus === "RETIRED" && !vehicle.availableForCalculation
    && vehicle.retiredAt !== null && vehicle.rowVersion === 5 && await auditCount(tenant.id, retirementRequest) === 1
    && await prisma.vehicle.count({ where: { id: ref, tenant_id: tenant.id } }) === 1);
  const retired = await listAdminFleetVehicles(prisma, ctx, { operationalStatus: "RETIRED" });
  check("retired vehicle remains readable in the historical listing", retired.total === 1 && retired.data[0].vehicleRef === ref);
  await rejects("retired history cannot be edited or reactivated in 19D", () => updateAdminFleetVehicle(prisma, ctx, ref, patch(5, { operationalStatus: "AVAILABLE", availableForCalculation: true })), "ADMIN_FLEET_RETIRED");
  const audits = await prisma.commercialAuditLog.findMany({ where: { tenant_id: tenant.id, source } });
  check("all fleet events retain actor authority and are critical", audits.length > 0 && audits.every((event) => event.actor_user_id === actor.id && event.actor_membership_id === member.id && event.critical));
  const auditPayloads = JSON.stringify(audits.map((event) => ({ before: event.before_json, after: event.after_json, metadata: event.metadata_json })));
  check("audit JSON avoids copying plates, VINs, identity and full vehicle payloads", ![originalInput.plate, originalInput.vin, actor.email, actor.name, "Persistent model"].some((value) => auditPayloads.includes(value)));
  const simultaneousInput = input("008");
  const simultaneousCreates = await Promise.all([
    createAdminFleetVehicle(prisma, ctx, simultaneousInput),
    createAdminFleetVehicle(prisma, ctx, simultaneousInput),
  ]);
  check("simultaneous identical creation requests resolve to one creation and one replay", simultaneousCreates.filter((entry) => entry.created).length === 1
    && simultaneousCreates.filter((entry) => entry.idempotent).length === 1
    && simultaneousCreates[0].vehicle.vehicleRef === simultaneousCreates[1].vehicle.vehicleRef);
  check("simultaneous creation records one row and one audit", await prisma.vehicle.count({ where: { tenant_id: tenant.id, request_id: simultaneousInput.requestId } }) === 1
    && await auditCount(tenant.id, simultaneousInput.requestId) === 1);
  process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, results }, null, 2) + "\n");
} finally {
  await prisma.$disconnect();
}
