import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";

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

export type WarehouseChange =
  | Readonly<{ operation: "WAREHOUSE_CREATE"; name: string }>
  | Readonly<{ operation: "WAREHOUSE_LOCATION_CREATE"; warehouseRef: string; parentLocationRef: string; name: string; kind: string }>
  | Readonly<{ operation: "WAREHOUSE_UPDATE"; warehouseRef: string; expectedVersion: number; name: string }>
  | Readonly<{ operation: "WAREHOUSE_LOCATION_UPDATE"; locationRef: string; expectedVersion: number; name: string }>;

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

  async save(change: WarehouseChange, requestId: string, signal?: AbortSignal): Promise<WarehouseRow | WarehouseLocationRow> {
    const { operation, ...payload } = change;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ operation, requestId, ...payload })));
    const payloadHash = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const path = operation === "WAREHOUSE_CREATE" ? "/api/materials/warehouses"
      : operation === "WAREHOUSE_LOCATION_CREATE" ? "/api/materials/warehouses/locations"
      : operation === "WAREHOUSE_UPDATE" ? `/api/materials/warehouses/${encodeURIComponent(change.warehouseRef)}`
      : `/api/materials/warehouses/locations/${encodeURIComponent(change.locationRef)}`;
    const method = operation.endsWith("_UPDATE") ? "PATCH" : "POST";
    const body = { ...payload } as Record<string, unknown>;
    // A URL reference is part of the hash but is never repeated as writable body data.
    if (operation === "WAREHOUSE_UPDATE") delete body.warehouseRef;
    if (operation === "WAREHOUSE_LOCATION_UPDATE") delete body.locationRef;
    return this.request(path, { method, body: JSON.stringify({ requestId, payloadHash, ...body }), signal });
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
  };
  return messages[code] ?? "No se pudo confirmar la operación. Reintente cuando tenga conexión.";
}
