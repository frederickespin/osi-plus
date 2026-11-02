import { SHEET_BYTE_LIMIT, validateWorkingWarehouseSheetChange } from "./sheetDraft";
import type { WarehouseSheetChange } from "./sheetTypes";
import { clearWorkingWarehouseRoute } from "./routeWorking";

const PREFIX = "osi-plus.warehouses.sheet-working.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const memory = new Map<string, { change: WarehouseSheetChange | null; unsynced: boolean }>();

/** Editable work only. This store has no request identity and never initiates a request. */
export function getWorkingWarehouseSheet(membershipRef: string): WarehouseSheetChange | null {
  if (!UUID.test(membershipRef)) return null;
  const prior = memory.get(membershipRef);
  if (prior?.unsynced) return prior.change;
  let raw: string | null;
  try {
    if (!globalThis.sessionStorage) return prior?.change ?? null;
    raw = sessionStorage.getItem(`${PREFIX}${membershipRef}`);
  } catch { return prior?.change ?? null; }
  if (!raw || new TextEncoder().encode(raw).byteLength > SHEET_BYTE_LIMIT) { memory.delete(membershipRef); return null; }
  try {
    const wrapper: unknown = JSON.parse(raw);
    const valid = wrapper !== null && typeof wrapper === "object" && !Array.isArray(wrapper) && Object.keys(wrapper).length === 2 && Object.hasOwn(wrapper, "change") && Object.hasOwn(wrapper, "version") && "version" in wrapper && wrapper.version === 1;
    const change = valid && "change" in wrapper ? validateWorkingWarehouseSheetChange(wrapper.change) : null;
    if (change) memory.set(membershipRef, { change, unsynced: false }); else memory.delete(membershipRef);
    return change;
  } catch { memory.delete(membershipRef); return null; }
}

export function setWorkingWarehouseSheet(membershipRef: string, change: WarehouseSheetChange): boolean {
  if (!UUID.test(membershipRef)) return false;
  const validated = validateWorkingWarehouseSheetChange(change);
  if (!validated) return false;
  const serialized = JSON.stringify({ version: 1, change: validated });
  if (new TextEncoder().encode(serialized).byteLength > SHEET_BYTE_LIMIT) return false;
  const entry = { change: validated, unsynced: true }; memory.set(membershipRef, entry);
  try { if (globalThis.sessionStorage) { sessionStorage.setItem(`${PREFIX}${membershipRef}`, serialized); entry.unsynced = false; } } catch { /* Keep editable work in memory for this session. */ }
  return true;
}

export function clearWorkingWarehouseSheet(membershipRef: string): void {
  if (!UUID.test(membershipRef)) return;
  const prior = getWorkingWarehouseSheet(membershipRef);
  if (prior) clearWorkingWarehouseRoute(membershipRef, prior.warehouseRef);
  memory.set(membershipRef, { change: null, unsynced: true });
  try { if (globalThis.sessionStorage) { sessionStorage.removeItem(`${PREFIX}${membershipRef}`); memory.delete(membershipRef); } } catch { /* Prevent stale storage being resurrected on this page. */ }
}
