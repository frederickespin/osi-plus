import type { WarehouseChange } from "./api";

export type PendingWarehouseDraft = Readonly<{ requestId: string; change: WarehouseChange }>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STORAGE_PREFIX = "osi-plus.warehouses.pending.v1:";
const LOCATION_KINDS = new Set(["ZONE", "AISLE", "RACK", "LEVEL", "BIN", "RECEIVING", "DISPATCH", "QUARANTINE", "OTHER"]);
type MemoryEntry = { draft: PendingWarehouseDraft | null; unsynced: boolean };
const pendingByMembership = new Map<string, MemoryEntry>();

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validRef(value: unknown): value is string { return typeof value === "string" && UUID_V4.test(value); }
function validName(value: unknown): value is string { return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= 160; }
function validVersion(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }

// Reconstruct only exact command fields. A stored intent never supplies authority
// or initiates a request; the editor must revalidate access and ask for a retry.
function validateDraft(value: unknown): PendingWarehouseDraft | null {
  if (!record(value) || !exactKeys(value, ["requestId", "change"]) || !validRef(value.requestId) || !record(value.change)) return null;
  const input = value.change;
  if (!validName(input.name)) return null;
  let change: WarehouseChange;
  switch (input.operation) {
    case "WAREHOUSE_CREATE":
      if (!exactKeys(input, ["operation", "name"])) return null;
      change = { operation: input.operation, name: input.name };
      break;
    case "WAREHOUSE_LOCATION_CREATE":
      if (!exactKeys(input, ["operation", "warehouseRef", "parentLocationRef", "name", "kind"])
        || !validRef(input.warehouseRef) || !validRef(input.parentLocationRef)
        || typeof input.kind !== "string" || !LOCATION_KINDS.has(input.kind)) return null;
      change = { operation: input.operation, warehouseRef: input.warehouseRef, parentLocationRef: input.parentLocationRef, name: input.name, kind: input.kind };
      break;
    case "WAREHOUSE_UPDATE":
      if (!exactKeys(input, ["operation", "warehouseRef", "expectedVersion", "name"])
        || !validRef(input.warehouseRef) || !validVersion(input.expectedVersion)) return null;
      change = { operation: input.operation, warehouseRef: input.warehouseRef, expectedVersion: input.expectedVersion, name: input.name };
      break;
    case "WAREHOUSE_LOCATION_UPDATE":
      if (!exactKeys(input, ["operation", "locationRef", "expectedVersion", "name"])
        || !validRef(input.locationRef) || !validVersion(input.expectedVersion)) return null;
      change = { operation: input.operation, locationRef: input.locationRef, expectedVersion: input.expectedVersion, name: input.name };
      break;
    default: return null;
  }
  return Object.freeze({ requestId: value.requestId, change: Object.freeze(change) });
}

function readStoredDraft(raw: string): PendingWarehouseDraft | null {
  if (raw.length > 4096) return null;
  try {
    const wrapper: unknown = JSON.parse(raw);
    return record(wrapper) && exactKeys(wrapper, ["version", "draft"]) && wrapper.version === 1 ? validateDraft(wrapper.draft) : null;
  } catch { return null; }
}

export function getPendingWarehouseDraft(membershipRef: string): PendingWarehouseDraft | null {
  if (!validRef(membershipRef)) return null;
  const memory = pendingByMembership.get(membershipRef);
  // A failed set/remove is newer than the old value still left in storage.
  if (memory?.unsynced) return memory.draft;
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return memory?.draft ?? null;
    const raw = storage.getItem(`${STORAGE_PREFIX}${membershipRef}`);
    const draft = raw === null ? null : readStoredDraft(raw);
    if (draft) pendingByMembership.set(membershipRef, { draft, unsynced: false });
    else pendingByMembership.delete(membershipRef);
    return draft;
  } catch { return memory?.draft ?? null; }
}

export function setPendingWarehouseDraft(membershipRef: string, draft: PendingWarehouseDraft): void {
  if (!validRef(membershipRef)) return;
  const validated = validateDraft(draft);
  if (!validated) return;
  const entry: MemoryEntry = { draft: validated, unsynced: true };
  pendingByMembership.set(membershipRef, entry);
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    storage.setItem(`${STORAGE_PREFIX}${membershipRef}`, JSON.stringify({ version: 1, draft: validated }));
    entry.unsynced = false;
  } catch { /* Retain the validated intent in memory for this page. */ }
}

export function clearPendingWarehouseDraft(membershipRef: string): void {
  if (!validRef(membershipRef)) return;
  pendingByMembership.set(membershipRef, { draft: null, unsynced: true });
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    storage.removeItem(`${STORAGE_PREFIX}${membershipRef}`);
    pendingByMembership.delete(membershipRef);
  } catch { /* Keep a tombstone so a failed removal cannot restore an old intent here. */ }
}
