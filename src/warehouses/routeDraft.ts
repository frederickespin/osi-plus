import { canPlaceWarehouseAddressKind, formatWarehouseAddress, normalizeWarehouseAddressIdentifier, warehouseAddressIdentifier, warehouseAddressSegments, warehouseAddressSegmentsFromIdentifier, type WarehouseAddressSegments } from "../../shared/warehouseSheetAddress.js";
import { SHEET_KIND_LABELS, SHEET_KINDS, SHEET_ROW_LIMIT, existingParentKey, newParentKey, warehouseSheetChange, type SheetDraft, type SheetDraftRow } from "./sheetDraft";
import type { WarehouseSheet, WarehouseSheetKind } from "./sheetTypes";

export type WarehouseRouteField = Readonly<{ identifier: string; name: string }>;
export type WarehouseRouteDraft = Readonly<Record<WarehouseSheetKind, WarehouseRouteField>>;
export const ROUTE_FORMATS: Readonly<Record<WarehouseSheetKind, Readonly<{ label: string; format: string; example: string; zero: string; width: number; numeric: boolean }>>> = {
  ZONE: { label: "Zona", format: "3 caracteres · letras o números", example: "TRD, A01 o 001", zero: "000", width: 3, numeric: false },
  AISLE: { label: "Pasillo", format: "2 dígitos · 01–99", example: "01", zero: "00", width: 2, numeric: true },
  RACK: { label: "Estantería / anaquel", format: "2 letras · AA–ZZ", example: "AA", zero: "00", width: 2, numeric: false },
  LEVEL: { label: "Nivel de la estantería", format: "1 dígito · 1–9", example: "1", zero: "0", width: 1, numeric: true },
  BIN: { label: "Posición", format: "1 dígito · 1–4", example: "1", zero: "0", width: 1, numeric: true },
};

export function emptyWarehouseRoute(): WarehouseRouteDraft {
  return Object.fromEntries(SHEET_KINDS.map((kind) => [kind, { identifier: ROUTE_FORMATS[kind].zero, name: "" }])) as Record<WarehouseSheetKind, WarehouseRouteField>;
}

export function warehouseRouteFromLocation(sheet: WarehouseSheet | undefined, locationRef?: string): WarehouseRouteDraft {
  const route = emptyWarehouseRoute();
  const address = sheet?.locations.find((location) => location.locationRef === locationRef)?.address;
  if (!address) return route;
  return Object.fromEntries(SHEET_KINDS.map((kind) => [kind, { identifier: warehouseAddressIdentifier(kind, address), name: "" }])) as Record<WarehouseSheetKind, WarehouseRouteField>;
}

const controls = (value: string) => Array.from(value).some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Keep incomplete editing text, but never accept request IDs, references or arbitrary metadata. */
export function validateWorkingWarehouseRoute(value: unknown): WarehouseRouteDraft | null {
  if (!record(value) || Object.keys(value).length !== SHEET_KINDS.length || !SHEET_KINDS.every((kind) => Object.hasOwn(value, kind))) return null;
  const fields = {} as Record<WarehouseSheetKind, WarehouseRouteField>;
  for (const kind of SHEET_KINDS) {
    const field = value[kind];
    if (!record(field) || Object.keys(field).length !== 2 || !Object.hasOwn(field, "identifier") || !Object.hasOwn(field, "name")
      || typeof field.identifier !== "string" || field.identifier.length > 16 || controls(field.identifier)
      || typeof field.name !== "string" || field.name.length > 160 || controls(field.name)) return null;
    fields[kind] = Object.freeze({ identifier: field.identifier, name: field.name });
  }
  return Object.freeze(fields);
}

export function hasWarehouseRouteInput(route: WarehouseRouteDraft): boolean {
  return SHEET_KINDS.some((kind) => route[kind].name.trim() !== "" || !/^0*$/.test(route[kind].identifier.trim()));
}

export type WarehouseRouteNode = Readonly<{
  kind: "WAREHOUSE_ROOT" | WarehouseSheetKind; name: string; identifier: string; label: string;
  status: "new" | "existing" | "staged" | "newWarehouse"; rowId?: string; locationRef?: string;
}>;
export type WarehouseRoutePlan = Readonly<{
  nodes: readonly WarehouseRouteNode[]; rows: readonly SheetDraftRow[];
  errors: Readonly<Partial<Record<WarehouseSheetKind, string>>>; error: string | null;
  label: string | null; newCount: number; existingCount: number; stagedCount: number;
  activeCount: number; valid: boolean;
}>;

/** Match only persisted addresses and explicit identifiers already staged in the worksheet. */
export function planWarehouseRoute(route: WarehouseRouteDraft, draft: SheetDraft, sheet?: WarehouseSheet, id: () => string = () => crypto.randomUUID()): WarehouseRoutePlan {
  const errors: Partial<Record<WarehouseSheetKind, string>> = {};
  const identifiers: Partial<Record<WarehouseSheetKind, string>> = {};
  const kinds: WarehouseSheetKind[] = [];
  for (const kind of SHEET_KINDS) {
    const field = route[kind];
    try {
      const token = normalizeWarehouseAddressIdentifier(kind, field.identifier, { allowDisabled: true });
      identifiers[kind] = token;
      if (token === ROUTE_FORMATS[kind].zero) continue;
      if (field.name.trim().length > 160 || controls(field.name)) errors[kind] = "El nombre admite hasta 160 caracteres, en una sola línea.";
      if (!canPlaceWarehouseAddressKind(kind, ["WAREHOUSE_ROOT", ...kinds])) errors[kind as WarehouseSheetKind] = "Un nivel necesita una estantería en este recorrido.";
      kinds.push(kind);
    } catch { errors[kind] = `${ROUTE_FORMATS[kind].format}. Ejemplo: ${ROUTE_FORMATS[kind].example}; ${ROUTE_FORMATS[kind].zero} omite este nivel.`; }
  }
  const labelFor = (address: WarehouseAddressSegments) => {
    const label = formatWarehouseAddress(address);
    return sheet?.warehouseNumber ? label : label.replace(/^ALM-\d{2}-/, "ALM-??-");
  };
  let address: WarehouseAddressSegments = warehouseAddressSegments(null, "WAREHOUSE_ROOT", sheet?.warehouseNumber ?? 1);
  const nodes: WarehouseRouteNode[] = [{ kind: "WAREHOUSE_ROOT", name: draft.name.trim() || "Almacén principal", identifier: sheet?.warehouseNumber ? String(sheet.warehouseNumber).padStart(2, "0") : "??", label: sheet?.warehouseLabel ?? "ALM-??", status: sheet ? "existing" : "newWarehouse", ...(sheet?.rootLocationRef ? { locationRef: sheet.rootLocationRef } : {}) }];
  const rows: SheetDraftRow[] = [];
  const result = (error: string | null = null): WarehouseRoutePlan => ({
    nodes, rows, errors, error, label: Object.keys(errors).length || error ? null : labelFor(address),
    newCount: nodes.filter((node) => node.status === "new").length,
    existingCount: nodes.filter((node) => node.status === "existing").length,
    stagedCount: nodes.filter((node) => node.status === "staged").length,
    activeCount: kinds.length, valid: Object.keys(errors).length === 0 && !error,
  });
  if (Object.keys(errors).length) return result();
  let parentKey = "";
  const root = sheet?.locations.find((location) => location.locationRef === sheet.rootLocationRef);
  let inactiveParent = Boolean(sheet && sheet.status !== "ACTIVE" || root && root.status !== "ACTIVE");
  const normalizedParent = (key: string) => key === existingParentKey(sheet?.rootLocationRef ?? "") ? "" : key;
  for (const kind of kinds) {
    const identifier = identifiers[kind]!;
    const requestedName = route[kind].name.trim();
    const existing = (sheet?.locations ?? []).filter((location) => {
      if (location.kind !== kind || !location.address) return false;
      const key = location.parentLocationRef ? normalizedParent(existingParentKey(location.parentLocationRef)) : "";
      return key === parentKey && warehouseAddressIdentifier(kind, location.address) === identifier;
    });
    const staged = draft.rows.filter((row) => !row.existing && row.kind === kind && row.identifier === identifier && normalizedParent(row.parentKey) === parentKey);
    if (existing.length + staged.length > 1) {
      errors[kind] = "Este identificador aparece más de una vez dentro de la misma ubicación. Revise las filas antes de agregar el recorrido.";
      return result();
    }
    const saved = existing[0];
    const current = saved ? draft.rows.find((row) => row.existing?.locationRef === saved.locationRef) : staged[0];
    if (saved || current) {
      const currentName = current?.name.trim() ?? saved!.name;
      if (requestedName && requestedName !== currentName) {
        errors[kind] = `Ya existe como «${currentName}». Deje el nombre vacío para reutilizarla o cambie su nombre en la hoja.`;
        return result();
      }
      if (saved && saved.status !== "ACTIVE") inactiveParent = true;
      address = saved?.address ?? warehouseAddressSegmentsFromIdentifier(address, kind, identifier);
      nodes.push({ kind, name: currentName, identifier, label: labelFor(address), status: saved ? "existing" : "staged", ...(saved ? { locationRef: saved.locationRef } : { rowId: current!.rowId }) });
      parentKey = saved ? existingParentKey(saved.locationRef) : newParentKey(current!.rowId);
    } else {
      const row: SheetDraftRow = { rowId: id(), kind, parentKey, identifier, name: requestedName || `${SHEET_KIND_LABELS[kind]} ${identifier}`, areaUseRef: "" };
      address = warehouseAddressSegmentsFromIdentifier(address, kind, identifier);
      rows.push(row); nodes.push({ kind, name: row.name, identifier, label: labelFor(address), status: "new", rowId: row.rowId });
      parentKey = newParentKey(row.rowId);
    }
  }
  if (rows.length && inactiveParent) return result("El almacén o una ubicación superior está inactiva. Revise su configuración antes de agregar ubicaciones a este recorrido.");
  if (warehouseSheetChange(draft, sheet).rows.length + rows.length > SHEET_ROW_LIMIT) return result(`La hoja admite hasta ${SHEET_ROW_LIMIT} filas nuevas o modificadas por guardado.`);
  return result();
}
