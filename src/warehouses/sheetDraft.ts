import { allocateWarehouseAddressOrdinal, canPlaceWarehouseAddressKind, formatWarehouseAddress, warehouseAddressOrdinal, warehouseAddressSegments, warehouseAddressToken } from "../../shared/warehouseSheetAddress.js";
import type { WarehouseAreaUse } from "./configurationTypes";
import type { WarehouseSheet, WarehouseSheetChange, WarehouseSheetCreateRow, WarehouseSheetKind, WarehouseSheetLocation, WarehouseSheetRowChange } from "./sheetTypes";

export const SHEET_ROW_LIMIT = 200;
export const SHEET_BYTE_LIMIT = 256 * 1024;
export const SHEET_KINDS: readonly WarehouseSheetKind[] = ["ZONE", "AISLE", "RACK", "LEVEL", "BIN"];
export const SHEET_KIND_LABELS: Readonly<Record<WarehouseSheetKind, string>> = { ZONE: "Zona", AISLE: "Pasillo", RACK: "Estantería", LEVEL: "Nivel", BIN: "Posición" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ref = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const nullableRef = (value: unknown): value is string | null => value === null || ref(value);
// Match the contract's forbidden U+0000–001F and U+007F characters before persisting an intent.
const name = (value: unknown): value is string => typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= 160 && !Array.from(value).some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127);
const version = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= 1_000_000;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Reconstruct a bounded command only; stored content cannot supply identity authority or labels. */
function validateSheetChange(value: unknown, incomplete: boolean): WarehouseSheetChange | null {
  const validName = (input: unknown): input is string => name(input) || incomplete && input === "";
  if (!record(value) || !exact(value, ["operation", "warehouseRef", "expectedWarehouseVersion", "expectedProfileVersion", "expectedRootConfigurationVersion", "name", "managerMembershipRef", "rootAreaUseRef", "rows"])
    || value.operation !== "WAREHOUSE_SHEET_SAVE" || !nullableRef(value.warehouseRef) || !validName(value.name)
    || !version(value.expectedWarehouseVersion, value.warehouseRef === null ? 0 : 1) || !version(value.expectedProfileVersion) || !version(value.expectedRootConfigurationVersion)
    || !nullableRef(value.managerMembershipRef) || !nullableRef(value.rootAreaUseRef) || !Array.isArray(value.rows) || value.rows.length > SHEET_ROW_LIMIT
    || value.warehouseRef === null && (value.expectedWarehouseVersion !== 0 || value.expectedProfileVersion !== 0 || value.expectedRootConfigurationVersion !== 0)) return null;
  const rows: WarehouseSheetRowChange[] = [];
  const ids = new Set<string>(); const locations = new Set<string>();
  for (const input of value.rows) {
    if (!record(input) || !ref(input.rowId) || ids.has(input.rowId) || !validName(input.name) || !nullableRef(input.areaUseRef)) return null;
    ids.add(input.rowId);
    if (input.action === "CREATE") {
      if (!exact(input, ["action", "rowId", "parentRowId", "parentLocationRef", "kind", "name", "areaUseRef"])
        || !nullableRef(input.parentRowId) || !nullableRef(input.parentLocationRef) || input.parentRowId !== null && input.parentLocationRef !== null
        || value.warehouseRef === null && input.parentLocationRef !== null || typeof input.kind !== "string" || !SHEET_KINDS.includes(input.kind as WarehouseSheetKind)) return null;
      rows.push(Object.freeze({ action: "CREATE", rowId: input.rowId, parentRowId: input.parentRowId, parentLocationRef: input.parentLocationRef, kind: input.kind as WarehouseSheetKind, name: input.name, areaUseRef: input.areaUseRef }));
    } else if (input.action === "UPDATE") {
      if (!exact(input, ["action", "rowId", "locationRef", "expectedVersion", "expectedConfigurationVersion", "name", "areaUseRef"])
        || value.warehouseRef === null || !ref(input.locationRef) || locations.has(input.locationRef) || !version(input.expectedVersion, 1) || !version(input.expectedConfigurationVersion)) return null;
      locations.add(input.locationRef);
      rows.push(Object.freeze({ action: "UPDATE", rowId: input.rowId, locationRef: input.locationRef, expectedVersion: input.expectedVersion, expectedConfigurationVersion: input.expectedConfigurationVersion, name: input.name, areaUseRef: input.areaUseRef }));
    } else return null;
  }
  const creates = new Map(rows.filter((row): row is WarehouseSheetCreateRow => row.action === "CREATE").map((row) => [row.rowId, row]));
  for (const row of creates.values()) {
    const seen = new Set([row.rowId]); let parentId = row.parentRowId;
    while (parentId) {
      if (seen.has(parentId)) return null;
      seen.add(parentId); const parent = creates.get(parentId);
      if (!parent) return null;
      parentId = parent.parentRowId;
    }
  }
  const change = { operation: "WAREHOUSE_SHEET_SAVE" as const, warehouseRef: value.warehouseRef, expectedWarehouseVersion: value.expectedWarehouseVersion, expectedProfileVersion: value.expectedProfileVersion, expectedRootConfigurationVersion: value.expectedRootConfigurationVersion, name: value.name, managerMembershipRef: value.managerMembershipRef, rootAreaUseRef: value.rootAreaUseRef, rows: Object.freeze(rows) };
  return new TextEncoder().encode(JSON.stringify(change)).byteLength <= SHEET_BYTE_LIMIT ? Object.freeze(change) : null;
}
export function validatePendingWarehouseSheetChange(value: unknown) { return validateSheetChange(value, false); }
export function validateWorkingWarehouseSheetChange(value: unknown) { return validateSheetChange(value, true); }

export type SheetDraftRow = Readonly<{ rowId: string; name: string; kind: string; parentKey: string; areaUseRef: string; existing?: WarehouseSheetLocation }>;
export type SheetDraft = Readonly<{ name: string; managerMembershipRef: string; rootAreaUseRef: string; rows: readonly SheetDraftRow[] }>;
export const existingParentKey = (reference: string) => `location:${reference}`;
export const newParentKey = (rowId: string) => `row:${rowId}`;
export function newSheetRow(parentKey = "", kind: WarehouseSheetKind = "ZONE", id: string = crypto.randomUUID()): SheetDraftRow { return { rowId: id, name: "", kind, parentKey, areaUseRef: "" }; }

export function sheetDraftFrom(sheet?: WarehouseSheet, recovery?: WarehouseSheetChange): SheetDraft {
  const rows: SheetDraftRow[] = (sheet?.locations ?? []).filter((row) => row.locationRef !== sheet?.rootLocationRef).map((row) => ({ rowId: crypto.randomUUID(), name: row.name, kind: row.kind, parentKey: row.parentLocationRef && row.parentLocationRef !== sheet?.rootLocationRef ? existingParentKey(row.parentLocationRef) : "", areaUseRef: row.areaUseRef ?? "", existing: row }));
  for (const change of recovery?.rows ?? []) {
    if (change.action === "CREATE") rows.push({ rowId: change.rowId, name: change.name, kind: change.kind, parentKey: change.parentRowId ? newParentKey(change.parentRowId) : change.parentLocationRef ? existingParentKey(change.parentLocationRef) : "", areaUseRef: change.areaUseRef ?? "" });
    else {
      const index = rows.findIndex((row) => row.existing?.locationRef === change.locationRef);
      const prior = index >= 0 ? rows[index] : { rowId: change.rowId, name: change.name, kind: "OTHER", parentKey: "", areaUseRef: change.areaUseRef ?? "", existing: { locationRef: change.locationRef, parentLocationRef: null, code: "—", name: change.name, kind: "OTHER", depth: 0, path: "", status: "", version: change.expectedVersion, configurationVersion: change.expectedConfigurationVersion, areaUseRef: change.areaUseRef, address: null } };
      const next = { ...prior, rowId: change.rowId, name: change.name, areaUseRef: change.areaUseRef ?? "", existing: { ...prior.existing!, version: change.expectedVersion, configurationVersion: change.expectedConfigurationVersion } };
      if (index >= 0) rows[index] = next; else rows.push(next);
    }
  }
  return { name: recovery?.name ?? sheet?.name ?? "", managerMembershipRef: (recovery ? recovery.managerMembershipRef : sheet?.manager?.membershipRef) ?? "", rootAreaUseRef: (recovery ? recovery.rootAreaUseRef : sheet?.rootAreaUseRef) ?? "", rows };
}

export function sheetParentKinds(parentKey: string, rows: readonly SheetDraftRow[], sheet?: WarehouseSheet, visiting = new Set<string>()): readonly string[] | null {
  if (!parentKey || parentKey === existingParentKey(sheet?.rootLocationRef ?? "")) return ["WAREHOUSE_ROOT"];
  if (visiting.has(parentKey)) return null;
  const next = new Set(visiting); next.add(parentKey);
  if (parentKey.startsWith("row:")) {
    const row = rows.find((item) => !item.existing && newParentKey(item.rowId) === parentKey);
    if (!row) return null;
    const ancestors = sheetParentKinds(row.parentKey, rows, sheet, next);
    return ancestors ? [...ancestors, row.kind] : null;
  }
  const locationRef = parentKey.slice("location:".length);
  const row = sheet?.locations.find((item) => item.locationRef === locationRef) ?? rows.find((item) => item.existing?.locationRef === locationRef)?.existing;
  if (!row) return null;
  if (row.kind === "WAREHOUSE_ROOT") return ["WAREHOUSE_ROOT"];
  const ancestors = sheetParentKinds(row.parentLocationRef ? existingParentKey(row.parentLocationRef) : "", rows, sheet, next);
  return ancestors ? [...ancestors, row.kind] : null;
}

export function warehouseSheetChange(draft: SheetDraft, sheet?: WarehouseSheet, recovery?: WarehouseSheetChange): WarehouseSheetChange {
  const rows: WarehouseSheetRowChange[] = [];
  for (const row of draft.rows) {
    if (row.existing) {
      if (row.name.trim() !== row.existing.name || (row.areaUseRef || null) !== row.existing.areaUseRef) rows.push({ action: "UPDATE", rowId: row.rowId, locationRef: row.existing.locationRef, expectedVersion: row.existing.version, expectedConfigurationVersion: row.existing.configurationVersion, name: row.name.trim(), areaUseRef: row.areaUseRef || null });
    } else rows.push({ action: "CREATE", rowId: row.rowId, parentRowId: row.parentKey.startsWith("row:") ? row.parentKey.slice(4) : null, parentLocationRef: row.parentKey.startsWith("location:") ? row.parentKey.slice(9) : null, kind: row.kind as WarehouseSheetKind, name: row.name.trim(), areaUseRef: row.areaUseRef || null });
  }
  return { operation: "WAREHOUSE_SHEET_SAVE", warehouseRef: recovery ? recovery.warehouseRef : sheet?.warehouseRef ?? null, expectedWarehouseVersion: recovery?.expectedWarehouseVersion ?? sheet?.version ?? 0, expectedProfileVersion: recovery?.expectedProfileVersion ?? sheet?.profileVersion ?? 0, expectedRootConfigurationVersion: recovery?.expectedRootConfigurationVersion ?? sheet?.rootConfigurationVersion ?? 0, name: draft.name.trim(), managerMembershipRef: draft.managerMembershipRef || null, rootAreaUseRef: draft.rootAreaUseRef || null, rows };
}

export function validateSheetDraft(draft: SheetDraft, sheet: WarehouseSheet | undefined, uses: readonly WarehouseAreaUse[]) {
  const general: string[] = []; const errors: Record<string, string[]> = {};
  if (!name(draft.name.trim())) general.push("Escriba un nombre de almacén de hasta 160 caracteres.");
  const validUse = (value: string, prior: string | null) => !value || value === prior || uses.some((use) => use.useRef === value && use.status === "ACTIVE");
  if (!validUse(draft.rootAreaUseRef, sheet?.rootAreaUseRef ?? null)) general.push("Seleccione un uso activo para el almacén.");
  for (const row of draft.rows) {
    const messages: string[] = [];
    const changed = !row.existing || row.name.trim() !== row.existing.name || (row.areaUseRef || null) !== row.existing.areaUseRef;
    if (changed && !name(row.name.trim())) messages.push("Escriba un nombre de hasta 160 caracteres, en una sola línea.");
    if (changed && !validUse(row.areaUseRef, row.existing?.areaUseRef ?? null)) messages.push("Seleccione un uso activo.");
    if (!row.existing) {
      const ancestors = sheetParentKinds(row.parentKey, draft.rows, sheet, new Set([newParentKey(row.rowId)]));
      if (!ancestors || !canPlaceWarehouseAddressKind(row.kind, [...ancestors])) messages.push("Revise el tipo y su ubicación superior; un nivel necesita una estantería y una posición es terminal.");
    }
    if (messages.length) errors[row.rowId] = messages;
  }
  const change = warehouseSheetChange(draft, sheet);
  if (change.rows.length > SHEET_ROW_LIMIT) general.push(`La hoja admite hasta ${SHEET_ROW_LIMIT} filas nuevas o modificadas por guardado.`);
  return { general, rows: errors, valid: general.length === 0 && Object.keys(errors).length === 0 };
}

export function provisionalSheetLabels(rows: readonly SheetDraftRow[], sheet?: WarehouseSheet): ReadonlyMap<string, string | null> {
  const addresses = new Map<string, ReturnType<typeof warehouseAddressSegments> | null>(); const labels = new Map<string, string | null>();
  const used = new Map<string, Set<number>>(); const visiting = new Set<string>();
  const ordinal = (row: WarehouseSheetLocation) => {
    const a = row.address!;
    return row.kind === "ZONE" ? a.zoneNumber : row.kind === "AISLE" ? a.aisleNumber : row.kind === "RACK" && a.rackCode ? warehouseAddressOrdinal("RACK", a.rackCode) : row.kind === "LEVEL" ? a.levelNumber : a.positionNumber;
  };
  for (const row of sheet?.locations ?? []) {
    if (!row.address || !SHEET_KINDS.includes(row.kind as WarehouseSheetKind)) continue;
    const key = `${row.parentLocationRef && row.parentLocationRef !== sheet?.rootLocationRef ? existingParentKey(row.parentLocationRef) : ""}|${row.kind}`;
    const values = used.get(key) ?? new Set<number>(); values.add(ordinal(row)); used.set(key, values);
  }
  const addressFor = (row: SheetDraftRow): ReturnType<typeof warehouseAddressSegments> | null => {
    if (addresses.has(row.rowId)) return addresses.get(row.rowId)!;
    if (visiting.has(row.rowId)) return null;
    visiting.add(row.rowId);
    let result: ReturnType<typeof warehouseAddressSegments> | null = row.existing?.address ?? null;
    if (!row.existing) {
      let parent = warehouseAddressSegments(null, "WAREHOUSE_ROOT", sheet?.warehouseNumber ?? 1);
      if (row.parentKey.startsWith("row:")) { const found = rows.find((item) => newParentKey(item.rowId) === row.parentKey); const value = found && addressFor(found); if (!value) { visiting.delete(row.rowId); addresses.set(row.rowId, null); return null; } parent = value; }
      else if (row.parentKey.startsWith("location:")) { const found = sheet?.locations.find((item) => existingParentKey(item.locationRef) === row.parentKey); if (!found?.address) { visiting.delete(row.rowId); addresses.set(row.rowId, null); return null; } parent = found.address; }
      try { const key = `${row.parentKey}|${row.kind}`; const values = used.get(key) ?? new Set<number>(); const next = allocateWarehouseAddressOrdinal(row.kind as WarehouseSheetKind, values); result = warehouseAddressSegments(parent, row.kind as WarehouseSheetKind, next); values.add(next); used.set(key, values); } catch { result = null; }
    }
    visiting.delete(row.rowId); addresses.set(row.rowId, result); return result;
  };
  for (const row of rows) { const address = addressFor(row); labels.set(row.rowId, address ? formatWarehouseAddress(address) : null); }
  return labels;
}

export type SheetGenerationCounts = Readonly<Record<WarehouseSheetKind, number>>;
export const EMPTY_GENERATION: SheetGenerationCounts = { ZONE: 0, AISLE: 0, RACK: 0, LEVEL: 0, BIN: 0 };
export function sheetGenerationSummary(counts: SheetGenerationCounts, ancestorKinds: readonly string[] | null) {
  let product = 1; let total = 0; const createdKinds: string[] = []; const byKind: Partial<Record<WarehouseSheetKind, number>> = {};
  if (!ancestorKinds) return { total: 0, byKind, error: "Seleccione una ubicación superior válida." };
  const max: Readonly<Record<WarehouseSheetKind, number>> = { ZONE: 999, AISLE: 99, RACK: 676, LEVEL: 9, BIN: 4 };
  for (const kind of SHEET_KINDS) {
    const count = counts[kind];
    if (!Number.isSafeInteger(count) || count < 0 || count > max[kind]) return { total, byKind, error: `Revise la cantidad de ${SHEET_KIND_LABELS[kind].toLowerCase()}.` };
    if (!count) continue;
    if (!canPlaceWarehouseAddressKind(kind, [...ancestorKinds, ...createdKinds])) return { total, byKind, error: "La secuencia no es compatible con la ubicación superior. Un nivel necesita una estantería." };
    product *= count; total += product; byKind[kind] = product; createdKinds.push(kind);
    if (total > SHEET_ROW_LIMIT) return { total, byKind, error: `El recorrido supera las ${SHEET_ROW_LIMIT} filas por guardado.` };
  }
  return { total, byKind, error: null };
}

export function generateSheetRows(parentKey: string, counts: SheetGenerationCounts, id: () => string = () => crypto.randomUUID()): readonly SheetDraftRow[] {
  const rows: SheetDraftRow[] = []; let parents = [parentKey];
  for (const kind of SHEET_KINDS) {
    if (!Number.isSafeInteger(counts[kind]) || counts[kind] < 0) throw new Error("SHEET_COUNT_INVALID");
    if (!counts[kind]) continue;
    const next: string[] = [];
    for (const parent of parents) for (let n = 1; n <= counts[kind]; n += 1) {
      if (rows.length >= SHEET_ROW_LIMIT) throw new Error("SHEET_ROW_LIMIT");
      const row = { ...newSheetRow(parent, kind, id()), name: `${SHEET_KIND_LABELS[kind]} ${warehouseAddressToken(kind, n)}` };
      rows.push(row); next.push(newParentKey(row.rowId));
    }
    parents = next;
  }
  return rows;
}
