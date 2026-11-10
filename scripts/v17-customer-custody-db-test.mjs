import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { custodyPayloadHash, normalizeCustodyMovement, normalizeCustodyReceipt, normalizeCustodyReceptionAction, normalizeWarehouseGrant } from "../api/_lib/customerCustodyContract.js";
import { applyCustomerCustodyReceptionAction, createWarehouseAccessGrant, listCustomerStorageLots, moveCustomerStorage, receiveCustomerStorage } from "../api/_lib/customerCustodyDomain.js";

assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1"), "CUSTOMER_CUSTODY_DB_TEST_REQUIRES_LOOPBACK");
const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["customer-custody:view", "customer-custody:receive", "customer-custody:operate", "warehouse-access:manage"];
const context = { tenantId: `tenant-custody-${suffix}`, membershipId: `membership-custody-${suffix}`, userId: `user-custody-${suffix}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] };
function signed(operation, payload, requestId = crypto.randomUUID()) { return { requestId, payloadHash: custodyPayloadHash({ operation, requestId, ...payload }), ...payload }; }

try {
  await prisma.tenant.create({ data: { id: context.tenantId, code: `CST-${suffix}`.toUpperCase(), name: "Tenant Customer Custody Test" } });
  await prisma.user.create({ data: { id: context.userId, code: `CST-USR-${suffix}`, name: "Custody Actor", email: `custody-${suffix}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-06", passwordHash: "synthetic-not-authenticatable" } });
  const membership = await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: permissions } });
  const client = await prisma.client.create({ data: { tenantId: context.tenantId, code: `CST-CLI-${suffix}`, name: "Cliente de custodia sintético", email: `client-${suffix}@example.test`, phone: "000", address: "Dirección sintética", type: "PERSON", status: "ACTIVE", createdAt: "2026-11-06" } });
  const pipelineCase = await prisma.pipelineCase.create({ data: { tenantId: context.tenantId, clientId: client.id, caseCode: `CST-CASE-${suffix}`, clientName: client.name, mode: "LOCAL", serviceType: "ALMACENAJE", customerType: "L4_PERSONAL", ownerName: "Custody Actor", originLocation: "Origen sintético", destinationLocation: "Almacén sintético" } });
  const warehouse = await prisma.materialWarehouse.create({ data: { tenantId: context.tenantId, code: "CUSTODY", name: "Almacén de efectos" } });
  const locationA = await prisma.materialLocation.create({ data: { tenantId: context.tenantId, warehouseId: warehouse.id, code: "A-01", name: "Posición A-01", kind: "BIN", path: "CUSTODY/A-01" } });
  const locationB = await prisma.materialLocation.create({ data: { tenantId: context.tenantId, warehouseId: warehouse.id, code: "B-02", name: "Posición B-02", kind: "BIN", path: "CUSTODY/B-02" } });

  await createWarehouseAccessGrant(prisma, context, normalizeWarehouseGrant(signed("WAREHOUSE_ACCESS_GRANT_CREATE", { membershipRef: membership.publicRef, warehouseRef: warehouse.warehouseRef, locationRef: null, inventoryScope: "CUSTOMER_CUSTODY", operations: ["VIEW", "RECEIVE", "PUT_AWAY", "TRANSFER", "COUNT", "PREPARE_EXIT", "DISPATCH", "RETURN", "ADJUST"] })));
  const receiptPayload = { clientRef: client.publicRef, caseRef: pipelineCase.publicRef, warehouseRef: warehouse.warehouseRef, destinationLocationRef: locationA.locationRef, storageType: "PERSONAL_EFFECTS", intakeSource: "OWN_PICKUP", manifestCode: `MAN-${suffix}`, expectedUnits: 2, groupLeadName: "Jefe de grupo", driverName: "Chofer sintético", vehicleCode: "IP-07", sealNumber: "04781", departedAt: "2026-11-06T11:00:00.000Z", arrivedAt: null, receivedAt: "2026-11-06T12:00:00.000Z", billingStartAt: "2026-11-06T12:00:00.000Z", notes: "Recepción sintética", items: [{ externalCode: "EXT-001", description: "Juego de sala", category: "MOBILIARIO", quantity: 1, unit: "juego", volumeM3: 4.2, weightKg: 180, condition: "GOOD", evidence: ["memory://custody/photo-1"], notes: "Cinco piezas" }, { externalCode: "EXT-002", description: "Cajas selladas", category: "CAJAS", quantity: 12, unit: "caja", volumeM3: 2.4, weightKg: 96, condition: "USED", evidence: null, notes: null }] };
  const requestId = crypto.randomUUID();
  const receipt = normalizeCustodyReceipt(signed("CUSTOMER_CUSTODY_RECEIVE", receiptPayload, requestId));
  const lot = await receiveCustomerStorage(prisma, context, receipt);
  assert.deepEqual(await receiveCustomerStorage(prisma, context, receipt), lot, "repeated request must return the same lot");
  assert.equal(lot.items.length, 2);
  assert.equal(lot.storageType, "PERSONAL_EFFECTS");
  assert.equal(lot.movements.length, 0);
  assert.equal(lot.receptionStage, "IN_TRANSIT");
  assert.equal(lot.items[0].status, "EXPECTED");
  assert.equal(await prisma.customerStorageLot.count({ where: { tenantId: context.tenantId } }), 1);

  const arrived = await applyCustomerCustodyReceptionAction(prisma, context, normalizeCustodyReceptionAction(signed("CUSTOMER_CUSTODY_RECEPTION_ACTION", { storageRef: lot.storageRef, action: "ARRIVE", itemRef: null, scanCode: null, occurredAt: "2026-11-06T12:30:00.000Z", notes: null, evidence: null, expectedLotVersion: lot.version, expectedItemVersion: null })));
  const handedOff = await applyCustomerCustodyReceptionAction(prisma, context, normalizeCustodyReceptionAction(signed("CUSTOMER_CUSTODY_RECEPTION_ACTION", { storageRef: lot.storageRef, action: "CONFIRM_HANDOFF", itemRef: null, scanCode: null, occurredAt: "2026-11-06T12:35:00.000Z", notes: null, evidence: null, expectedLotVersion: arrived.version, expectedItemVersion: null })));
  let scanned = handedOff;
  for (const expected of handedOff.items) scanned = await applyCustomerCustodyReceptionAction(prisma, context, normalizeCustodyReceptionAction(signed("CUSTOMER_CUSTODY_RECEPTION_ACTION", { storageRef: scanned.storageRef, action: "SCAN_ITEM", itemRef: null, scanCode: expected.externalCode, occurredAt: "2026-11-06T12:40:00.000Z", notes: null, evidence: null, expectedLotVersion: scanned.version, expectedItemVersion: expected.version })));
  assert.equal(scanned.receptionStage, "PUT_AWAY");
  const item = scanned.items[0];
  const moved = await moveCustomerStorage(prisma, context, normalizeCustodyMovement(signed("CUSTOMER_CUSTODY_MOVE", { storageRef: scanned.storageRef, itemRef: item.itemRef, movementType: "TRANSFER", destinationLocationRef: locationB.locationRef, quantity: item.quantity, occurredAt: "2026-11-06T13:00:00.000Z", notes: "Traslado sintético", expectedVersion: item.version })));
  assert.equal(moved.items.find((row) => row.itemRef === item.itemRef)?.location?.locationRef, locationB.locationRef);
  assert.equal(moved.status, "STORED");
  assert.equal(moved.movements[0].movementType, "TRANSFER");
  assert.equal((await listCustomerStorageLots(prisma, context, { q: "custodia", status: "STORED" })).length, 1);
  assert.equal((await listCustomerStorageLots(prisma, context, { storageType: "PERSONAL_EFFECTS" })).length, 1);
  assert.equal((await listCustomerStorageLots(prisma, context, { storageType: "COMMERCIAL_STORAGE" })).length, 0);
  const outsider = { ...context, membershipId: `outsider-${suffix}`, userId: `outsider-user-${suffix}` };
  assert.deepEqual(await listCustomerStorageLots(prisma, outsider), [], "membership without a grant cannot enumerate custody");
  const commandCount = await prisma.customerCustodyCommand.count({ where: { tenantId: context.tenantId } });
  const movementCount = await prisma.customerCustodyMovement.count({ where: { tenantId: context.tenantId } });
  assert.equal(commandCount, 7);
  assert.equal(movementCount, 5);
  const movement = await prisma.customerCustodyMovement.findFirstOrThrow({ where: { tenantId: context.tenantId } });
  const command = await prisma.customerCustodyCommand.findFirstOrThrow({ where: { tenantId: context.tenantId } });
  await assert.rejects(() => prisma.customerCustodyMovement.update({ where: { id: movement.id }, data: { notes: "illegal edit" } }), /V17_CUSTOMER_CUSTODY_APPEND_ONLY/);
  await assert.rejects(() => prisma.customerCustodyCommand.update({ where: { id: command.id }, data: { resultJson: { rewritten: true } } }), /V17_CUSTOMER_CUSTODY_APPEND_ONLY/);
  process.stdout.write(JSON.stringify({ ok: true, postgres: 18, migrations: "44/44", lots: 1, items: 2, movements: movementCount, commands: commandCount, idempotent: true, appendOnly: true, tenantFirst: true, scopedAccess: true, storageGroups: true, receptionWorkflow: true }) + "\n");
} finally {
  await prisma.$disconnect();
}
