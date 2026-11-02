import { validateWorkingWarehouseRoute, type WarehouseRouteDraft } from "./routeDraft";

const PREFIX = "osi-plus.warehouses.route-working.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BYTE_LIMIT = 8 * 1024;
const memory = new Map<string, { route: WarehouseRouteDraft | null; unsynced: boolean }>();
const scope = (membershipRef: string, warehouseRef: string | null) => UUID.test(membershipRef) && (warehouseRef === null || UUID.test(warehouseRef)) ? `${membershipRef}:${warehouseRef ?? "new"}` : null;

/** Auxiliary editing state only: no requestId, mutation payload, labels or persisted identity. */
export function getWorkingWarehouseRoute(membershipRef: string, warehouseRef: string | null): WarehouseRouteDraft | null {
  const key = scope(membershipRef, warehouseRef);
  if (!key) return null;
  const prior = memory.get(key);
  if (prior?.unsynced) return prior.route;
  let raw: string | null;
  try { if (!globalThis.sessionStorage) return prior?.route ?? null; raw = sessionStorage.getItem(`${PREFIX}${key}`); } catch { return prior?.route ?? null; }
  if (!raw || new TextEncoder().encode(raw).byteLength > BYTE_LIMIT) { memory.delete(key); return null; }
  try {
    const wrapper: unknown = JSON.parse(raw);
    const valid = wrapper !== null && typeof wrapper === "object" && !Array.isArray(wrapper) && Object.keys(wrapper).length === 2 && Object.hasOwn(wrapper, "version") && Object.hasOwn(wrapper, "route") && "version" in wrapper && wrapper.version === 1;
    const route = valid && "route" in wrapper ? validateWorkingWarehouseRoute(wrapper.route) : null;
    if (route) memory.set(key, { route, unsynced: false }); else memory.delete(key);
    return route;
  } catch { memory.delete(key); return null; }
}

export function setWorkingWarehouseRoute(membershipRef: string, warehouseRef: string | null, route: WarehouseRouteDraft): boolean {
  const key = scope(membershipRef, warehouseRef); const validated = validateWorkingWarehouseRoute(route);
  if (!key || !validated) return false;
  const serialized = JSON.stringify({ version: 1, route: validated });
  if (new TextEncoder().encode(serialized).byteLength > BYTE_LIMIT) return false;
  const entry = { route: validated, unsynced: true }; memory.set(key, entry);
  try { if (globalThis.sessionStorage) { sessionStorage.setItem(`${PREFIX}${key}`, serialized); entry.unsynced = false; } } catch { /* Preserve the editable route in memory for this session. */ }
  return true;
}

export function clearWorkingWarehouseRoute(membershipRef: string, warehouseRef: string | null): void {
  const key = scope(membershipRef, warehouseRef);
  if (!key) return;
  memory.set(key, { route: null, unsynced: true });
  try { if (globalThis.sessionStorage) { sessionStorage.removeItem(`${PREFIX}${key}`); memory.delete(key); } } catch { /* Keep the tombstone when storage is unavailable. */ }
}
