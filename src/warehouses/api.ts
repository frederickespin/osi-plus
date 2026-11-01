import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";
import type { WarehouseAreaPurpose, WarehouseAreaUse, WarehouseAvailabilityRule, WarehouseConfiguration, WarehouseLocationConfiguration, WarehouseOperationalStatus } from "./configurationTypes";
import type { WarehouseManagerOptions, WarehouseSheet, WarehouseSheetChange, WarehouseSheetSaved } from "./sheetTypes";
import { formatWarehouseAddress, type WarehouseAddressSegments } from "../../shared/warehouseSheetAddress.js";

export class WarehouseApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "WarehouseApiError";
    this.code = code;
    this.status = status;
  }
}

// These domain rejections follow the locked receipt lookup. Authentication,
// feature gates, input/hash errors and unknown failures do not resolve a prior
// request whose result is still uncertain.
const RECEIPT_CHECKED_REJECTIONS = new Set([
  "MATERIALS_VERSION_CONFLICT", "MATERIALS_RESOURCE_NOT_FOUND", "MATERIALS_RESOURCE_INACTIVE",
  "MATERIALS_LOCATION_LIMIT_REACHED", "MATERIALS_LOCATION_TREE_INVALID", "MATERIALS_WAREHOUSE_ROOT_EDIT_REQUIRED",
  "MATERIALS_CODE_CONFLICT",
  "WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", "WAREHOUSE_AREA_USE_NAME_CONFLICT", "WAREHOUSE_AREA_USE_CODE_CONFLICT",
  "WAREHOUSE_AREA_USE_NOT_FOUND", "WAREHOUSE_AREA_USE_INACTIVE", "WAREHOUSE_LOCATION_NOT_FOUND",
  "WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED", "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE", "WAREHOUSE_CONFIGURATION_HIERARCHY_INVALID",
  "WAREHOUSE_SHEET_NOT_FOUND", "WAREHOUSE_SHEET_LOCATION_NOT_FOUND", "WAREHOUSE_SHEET_MANAGER_NOT_FOUND", "WAREHOUSE_SHEET_MANAGER_INELIGIBLE",
  "WAREHOUSE_SHEET_USE_NOT_FOUND", "WAREHOUSE_SHEET_USE_INACTIVE", "WAREHOUSE_SHEET_VERSION_CONFLICT", "WAREHOUSE_SHEET_HIERARCHY_INVALID",
  "WAREHOUSE_SHEET_ROOT_ROW_INVALID", "WAREHOUSE_SHEET_RESOURCE_INACTIVE", "WAREHOUSE_SHEET_ADDRESS_CAPACITY_EXCEEDED",
  "WAREHOUSE_SHEET_CODE_CONFLICT", "WAREHOUSE_SHEET_WRITE_CONFLICT",
]);
export function isWarehouseRejectionConfirmed(error: unknown) {
  return error instanceof WarehouseApiError && RECEIPT_CHECKED_REJECTIONS.has(error.code);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

const responseRef = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const responseRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function isAddressResponse(value: unknown): boolean {
  if (!responseRecord(value) || typeof value.label !== "string") return false;
  try { return formatWarehouseAddress(value as unknown as WarehouseAddressSegments) === value.label; } catch { return false; }
}
function isSheetResponse(value: unknown): value is WarehouseSheet {
  if (!responseRecord(value) || !responseRef(value.warehouseRef) || typeof value.code !== "string" || typeof value.name !== "string"
    || typeof value.status !== "string" || !Number.isSafeInteger(value.version) || Number(value.version) < 1
    || !Number.isSafeInteger(value.profileVersion) || Number(value.profileVersion) < 0 || !Number.isSafeInteger(value.rootConfigurationVersion) || Number(value.rootConfigurationVersion) < 0
    || value.rootLocationRef !== null && !responseRef(value.rootLocationRef) || value.rootAreaUseRef !== null && !responseRef(value.rootAreaUseRef)
    || value.warehouseLabel !== null && typeof value.warehouseLabel !== "string"
    || value.warehouseNumber !== null && (!Number.isSafeInteger(value.warehouseNumber) || Number(value.warehouseNumber) < 1 || Number(value.warehouseNumber) > 99)
    || value.manager !== null && (!responseRecord(value.manager) || !responseRef(value.manager.membershipRef) || typeof value.manager.displayName !== "string" || typeof value.manager.eligible !== "boolean")
    || !Array.isArray(value.locations)) return false;
  return value.locations.every((row: unknown) => responseRecord(row) && responseRef(row.locationRef)
    && (row.parentLocationRef === null || responseRef(row.parentLocationRef)) && typeof row.name === "string" && typeof row.code === "string"
    && typeof row.kind === "string" && typeof row.path === "string" && typeof row.status === "string"
    && Number.isSafeInteger(row.version) && Number(row.version) >= 1 && Number.isSafeInteger(row.depth) && Number(row.depth) >= 0
    && Number.isSafeInteger(row.configurationVersion) && Number(row.configurationVersion) >= 0
    && (row.areaUseRef === null || responseRef(row.areaUseRef)) && (row.address === null || isAddressResponse(row.address)));
}

export type WarehouseSpatialChange =
  | Readonly<{ operation: "WAREHOUSE_CREATE"; name: string }>
  | Readonly<{ operation: "WAREHOUSE_LOCATION_CREATE"; warehouseRef: string; parentLocationRef: string; name: string; kind: string }>
  | Readonly<{ operation: "WAREHOUSE_UPDATE"; warehouseRef: string; expectedVersion: number; name: string }>
  | Readonly<{ operation: "WAREHOUSE_LOCATION_UPDATE"; locationRef: string; expectedVersion: number; name: string }>;

export type WarehouseAreaUseChange =
  | Readonly<{ operation: "WAREHOUSE_AREA_USE_CREATE"; name: string; description: string | null; purpose: WarehouseAreaPurpose }>
  | Readonly<{ operation: "WAREHOUSE_AREA_USE_UPDATE"; useRef: string; expectedVersion: number; name: string; description: string | null; purpose: WarehouseAreaPurpose; status: "ACTIVE" | "INACTIVE" }>;
export type WarehouseLocationConfigurationChange = Readonly<{
  operation: "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE"; locationRef: string; expectedVersion: number;
  areaUseRef: string | null; characteristics: string | null; notes: string | null;
  operationalStatus: WarehouseOperationalStatus; availabilityRule: WarehouseAvailabilityRule;
  changeReason: string | null; acknowledgeImpact: boolean;
}>;
export type WarehouseChange = WarehouseSpatialChange | WarehouseAreaUseChange | WarehouseLocationConfigurationChange | WarehouseSheetChange;
export type WarehouseSaved = WarehouseRow | WarehouseLocationRow | WarehouseAreaUse | WarehouseLocationConfiguration | WarehouseSheetSaved;

export function isWarehouseSpatialChange(change: WarehouseChange): change is WarehouseSpatialChange {
  return ["WAREHOUSE_CREATE", "WAREHOUSE_UPDATE", "WAREHOUSE_LOCATION_CREATE", "WAREHOUSE_LOCATION_UPDATE"].includes(change.operation);
}
export function isWarehouseAreaUseChange(change: WarehouseChange): change is WarehouseAreaUseChange {
  return change.operation === "WAREHOUSE_AREA_USE_CREATE" || change.operation === "WAREHOUSE_AREA_USE_UPDATE";
}

/** A draft retains its requestId across retries, including a lost success response. */
export class WarehouseApi {
  private readonly authorization: string | undefined;
  constructor(authorization: string | undefined) { this.authorization = authorization; }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init, credentials: "omit", cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(this.authorization ? { Authorization: `Bearer ${this.authorization}` } : {}) },
    });
    let body;
    try { body = await response.json(); } catch { throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", response.ok ? 503 : response.status); }
    if (!response.ok || body?.ok !== true) throw new WarehouseApiError(body?.error || "MATERIALS_REQUEST_FAILED", response.status);
    if (body.data === undefined) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
    return body.data as T;
  }

  list(signal?: AbortSignal) {
    return this.request<readonly WarehouseRow[]>("/api/materials/warehouses", { method: "GET", signal });
  }

  async configuration(signal?: AbortSignal) {
    const data = await this.request<WarehouseConfiguration>("/api/materials/warehouse-configuration", { method: "GET", signal });
    if (!data || !Array.isArray(data.areaUses) || !Array.isArray(data.locations)) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
    return data;
  }

  async sheets(signal?: AbortSignal) {
    const data = await this.request<{ warehouses: readonly WarehouseSheet[] }>("/api/materials/warehouse-sheets", { method: "GET", signal });
    if (!data || !Array.isArray(data.warehouses) || !data.warehouses.every(isSheetResponse)) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
    return data.warehouses;
  }

  async managerOptions(query: string, page: number, signal?: AbortSignal) {
    const search = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (query.trim()) search.set("q", query.trim());
    const data = await this.request<WarehouseManagerOptions>(`/api/materials/warehouse-sheets/manager-options?${search}`, { method: "GET", signal });
    if (!data || !Array.isArray(data.data) || !Number.isSafeInteger(data.total) || data.total < 0
      || !Number.isSafeInteger(data.page) || data.page < 1 || data.page > 100_000 || !Number.isSafeInteger(data.pageSize) || data.pageSize < 1 || data.pageSize > 50
      || data.data.some((row) => !responseRecord(row) || !responseRef(row.membershipRef) || typeof row.displayName !== "string" || !row.displayName.trim())) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
    return data;
  }

  save(change: WarehouseSpatialChange, requestId: string, signal?: AbortSignal): Promise<WarehouseRow | WarehouseLocationRow>;
  save(change: WarehouseAreaUseChange, requestId: string, signal?: AbortSignal): Promise<WarehouseAreaUse>;
  save(change: WarehouseLocationConfigurationChange, requestId: string, signal?: AbortSignal): Promise<WarehouseLocationConfiguration>;
  save(change: WarehouseSheetChange, requestId: string, signal?: AbortSignal): Promise<WarehouseSheetSaved>;
  save(change: WarehouseChange, requestId: string, signal?: AbortSignal): Promise<WarehouseSaved>;
  async save(change: WarehouseChange, requestId: string, signal?: AbortSignal): Promise<WarehouseSaved> {
    const { operation, ...payload } = change;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ operation, requestId, ...payload })));
    const payloadHash = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const path = operation === "WAREHOUSE_SHEET_SAVE" ? "/api/materials/warehouse-sheets"
      : operation === "WAREHOUSE_CREATE" ? "/api/materials/warehouses"
      : operation === "WAREHOUSE_LOCATION_CREATE" ? "/api/materials/warehouses/locations"
      : operation === "WAREHOUSE_UPDATE" ? `/api/materials/warehouses/${encodeURIComponent(change.warehouseRef)}`
      : operation === "WAREHOUSE_LOCATION_UPDATE" ? `/api/materials/warehouses/locations/${encodeURIComponent(change.locationRef)}`
      : operation === "WAREHOUSE_AREA_USE_CREATE" ? "/api/materials/warehouse-uses"
      : operation === "WAREHOUSE_AREA_USE_UPDATE" ? `/api/materials/warehouse-uses/${encodeURIComponent(change.useRef)}`
      : `/api/materials/warehouses/locations/${encodeURIComponent(change.locationRef)}/configuration`;
    const method = operation.endsWith("_UPDATE") ? "PATCH" : "POST";
    const body = { ...payload } as Record<string, unknown>;
    // A URL reference is part of the hash but is never repeated as writable body data.
    if (operation === "WAREHOUSE_UPDATE") delete body.warehouseRef;
    if (operation === "WAREHOUSE_LOCATION_UPDATE" || operation === "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE") delete body.locationRef;
    if (operation === "WAREHOUSE_AREA_USE_UPDATE") delete body.useRef;
    const saved = await this.request<unknown>(path, { method, body: JSON.stringify({ requestId, payloadHash, ...body }), signal });
    if (operation === "WAREHOUSE_SHEET_SAVE") {
      if (!responseRecord(saved) || !isSheetResponse(saved.warehouse) || !Array.isArray(saved.rowResults)
        || change.warehouseRef !== null && saved.warehouse.warehouseRef !== change.warehouseRef
        || saved.rowResults.length !== change.rows.length) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
      const expectedRows = new Map(change.rows.map((row) => [row.rowId, row]));
      const returned = new Set<string>();
      const returnedLocations = new Set<string>();
      for (const row of saved.rowResults) {
        if (!responseRecord(row) || !responseRef(row.rowId) || !responseRef(row.locationRef) || returned.has(row.rowId) || returnedLocations.has(row.locationRef)
          || !expectedRows.has(row.rowId) || !saved.warehouse.locations.some((location) => location.locationRef === row.locationRef)) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
        const expected = expectedRows.get(row.rowId)!;
        if (expected.action === "UPDATE" && expected.locationRef !== row.locationRef) throw new WarehouseApiError("MATERIALS_RESPONSE_INVALID", 503);
        returned.add(row.rowId);
        returnedLocations.add(row.locationRef);
      }
    }
    return saved as WarehouseSaved;
  }
}

export function warehouseErrorText(error: unknown): string {
  const code = error instanceof WarehouseApiError ? error.code : "";
  const messages: Record<string, string> = {
    MATERIALS_FORBIDDEN: "No tiene permiso para realizar este cambio.",
    MATERIALS_INPUT_INVALID: "Revise el nombre y el tipo de ubicación antes de guardar.",
    MATERIALS_RESOURCE_NOT_FOUND: "El almacén o la ubicación ya no está disponible. Actualice el listado.",
    MATERIALS_RESOURCE_INACTIVE: "El almacén o alguna ubicación superior está inactiva. Seleccione una ubicación activa.",
    MATERIALS_VERSION_CONFLICT: "Otra persona modificó este registro. Actualice el listado antes de editarlo de nuevo.",
    MATERIALS_WRITE_CONFLICT: "Coincidieron varios cambios. Reintente guardar el mismo registro.",
    MATERIALS_IDEMPOTENCY_CONFLICT: "Este intento ya tiene otros datos asociados. Actualice el listado antes de continuar.",
    MATERIALS_CODE_CONFLICT: "No se pudo asignar un código único. Actualice el listado y vuelva a intentar el alta.",
    MATERIALS_LOCATION_TREE_INVALID: "La ubicación superior no corresponde a este almacén.",
    MATERIALS_LOCATION_LIMIT_REACHED: "El recorrido supera la profundidad admitida. Seleccione una ubicación superior.",
    MATERIALS_WAREHOUSE_ROOT_EDIT_REQUIRED: "Cambie el nombre desde la ficha del almacén principal.",
    MATERIALS_DISABLED: "Almacenes todavía no está habilitado en este entorno.",
    MATERIALS_CONFIGURATION_INVALID: "Almacenes no está disponible en este entorno. Intente actualizar más tarde.",
    WAREHOUSE_CONFIGURATION_DISABLED: "La configuración de almacenes todavía no está habilitada en este entorno.",
    WAREHOUSE_CONFIGURATION_INVALID: "La configuración de almacenes no está disponible en este entorno.",
    WAREHOUSE_CONFIGURATION_INPUT_INVALID: "Revise los datos y los límites de texto antes de guardar.",
    WAREHOUSE_CONFIGURATION_FORBIDDEN: "No tiene permiso para modificar la configuración de almacenes.",
    WAREHOUSE_CONFIGURATION_VERSION_CONFLICT: "Otra persona modificó este registro. Actualice el listado antes de editarlo de nuevo.",
    WAREHOUSE_CONFIGURATION_IDEMPOTENCY_CONFLICT: "Este intento ya tiene otros datos asociados. Actualice el listado antes de continuar.",
    WAREHOUSE_CONFIGURATION_WRITE_CONFLICT: "Coincidieron varios cambios. Reintente guardar el mismo registro.",
    WAREHOUSE_AREA_USE_NAME_CONFLICT: "Ya existe un uso con ese nombre. Escriba otro nombre o edite el uso existente.",
    WAREHOUSE_AREA_USE_CODE_CONFLICT: "No se pudo asignar un código único. Actualice el listado y vuelva a intentar el alta.",
    WAREHOUSE_AREA_USE_NOT_FOUND: "El uso ya no está disponible. Actualice el listado.",
    WAREHOUSE_AREA_USE_INACTIVE: "Ese uso está inactivo. Seleccione un uso activo para esta nueva asignación.",
    WAREHOUSE_LOCATION_NOT_FOUND: "La ubicación ya no está disponible. Actualice el listado.",
    WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED: "Escriba un motivo y confirme el alcance antes de cambiar los controles operativos.",
    WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE: "Hay reservas o préstamos pendientes en esta ubicación o en sus ubicaciones interiores. Resuelva esos compromisos antes de cambiar los controles.",
    WAREHOUSE_CONFIGURATION_HIERARCHY_INVALID: "No se pudo confirmar la jerarquía de esta ubicación. Actualice el listado antes de continuar.",
    WAREHOUSE_SHEET_FORBIDDEN: "No tiene permiso para guardar la hoja de almacén.",
    WAREHOUSE_SHEET_INPUT_INVALID: "Revise los nombres, las filas y los límites de la hoja antes de guardar.",
    WAREHOUSE_SHEET_NOT_FOUND: "El almacén ya no está disponible. Actualice el listado.",
    WAREHOUSE_SHEET_LOCATION_NOT_FOUND: "Una ubicación de la hoja ya no está disponible. Actualice el listado.",
    WAREHOUSE_SHEET_MANAGER_NOT_FOUND: "La persona seleccionada ya no está disponible. Seleccione otro encargado o deje el campo sin asignar.",
    WAREHOUSE_SHEET_MANAGER_INELIGIBLE: "La persona seleccionada ya no está habilitada para esta asignación. Seleccione otro encargado o deje el campo sin asignar.",
    WAREHOUSE_SHEET_USE_NOT_FOUND: "Un uso de la hoja ya no está disponible. Seleccione otro uso o deje la ubicación sin uso asignado.",
    WAREHOUSE_SHEET_USE_INACTIVE: "Un uso seleccionado está inactivo. Seleccione un uso activo para la nueva asignación o deje el campo sin asignar.",
    WAREHOUSE_SHEET_VERSION_CONFLICT: "Otra persona modificó este almacén o alguna ubicación. Actualice el listado antes de editar la hoja de nuevo.",
    WAREHOUSE_SHEET_WRITE_CONFLICT: "Coincidieron varios cambios. Actualice el listado antes de guardar una nueva versión de la hoja.",
    WAREHOUSE_SHEET_IDEMPOTENCY_CONFLICT: "Este intento ya tiene otros datos asociados. Actualice el listado antes de continuar.",
    WAREHOUSE_SHEET_HIERARCHY_INVALID: "Revise la ubicación superior y el tipo de cada fila. Los niveles necesitan una estantería y las posiciones son terminales.",
    WAREHOUSE_SHEET_ROOT_ROW_INVALID: "Cambie los datos del almacén en la cabecera de la hoja, no como una fila interior.",
    WAREHOUSE_SHEET_RESOURCE_INACTIVE: "El almacén o una ubicación superior está inactiva. Actualice el listado antes de agregar ubicaciones.",
    WAREHOUSE_SHEET_ADDRESS_CAPACITY_EXCEEDED: "Se agotó el rango de etiquetas disponible: 99 almacenes, 999 zonas, 99 pasillos, 676 estanterías, 9 niveles o 4 posiciones por ubicación superior. Reduzca las filas o elija otra ubicación superior.",
    WAREHOUSE_SHEET_CODE_CONFLICT: "No se pudo asignar un código único a la hoja. Actualice el listado antes de volver a guardar.",
    WAREHOUSE_SHEET_DISABLED: "La hoja de almacenes todavía no está habilitada en este entorno.",
    WAREHOUSE_SHEET_CONFIGURATION_INVALID: "La hoja de almacenes no está disponible en este entorno.",
  };
  return messages[code] ?? "No se pudo confirmar la operación. Reintente cuando tenga conexión.";
}
