import { getMembershipRef } from "@/lib/sessionStore";

export type CustomerStorageLot = Readonly<{ storageRef: string; lotCode: string; status: string; receivedAt: string; billingStartAt: string | null; releasedAt: string | null; notes: string | null; version: number; client: { clientRef: string; code: string; name: string }; case: { caseRef: string; caseNumber: string } | null; warehouse: { warehouseRef: string; code: string; name: string }; items: readonly CustomerStoredItem[]; movements: readonly CustomerCustodyMovement[] }>;
export type CustomerStoredItem = Readonly<{ itemRef: string; itemCode: string; description: string; category: string | null; quantity: number; unit: string; volumeM3: number | null; weightKg: number | null; condition: string; evidence: readonly string[] | null; notes: string | null; status: string; version: number; location: { locationRef: string; path: string; name: string } | null }>;
export type CustomerCustodyMovement = Readonly<{ movementRef: string; itemRef: string | null; movementType: string; quantity: number | null; notes: string | null; occurredAt: string; origin: { locationRef: string; path: string } | null; destination: { locationRef: string; path: string } | null }>;
export type WarehouseAccessGrant = Readonly<{ grantRef: string; membership: { membershipRef: string; name: string; email: string }; warehouse: { warehouseRef: string; name: string } | null; location: { locationRef: string; path: string } | null; inventoryScope: string; operations: readonly string[]; status: string; version: number }>;

function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(",")}}`; }
async function hash(value: unknown) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value))); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
export class CustomerCustodyApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}
export class CustomerCustodyApi {
  private readonly authorization?: string;
  constructor(authorization?: string) { this.authorization = authorization; }
  private async request<T>(path: string, init: RequestInit = {}) { const membershipRef = getMembershipRef(); const response = await fetch(path, { ...init, credentials: "omit", cache: "no-store", headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(this.authorization ? { Authorization: `Bearer ${this.authorization}` } : {}), ...(membershipRef ? { "X-OSI-Membership-Ref": membershipRef } : {}) } }); const body = await response.json(); if (!response.ok || body?.ok !== true) throw new CustomerCustodyApiError(body?.error || "CUSTOMER_CUSTODY_REQUEST_FAILED", response.status); return body.data as T; }
  list(query = "", status = "ALL", signal?: AbortSignal) { const search = new URLSearchParams(); if (query.trim()) search.set("q", query.trim()); if (status !== "ALL") search.set("status", status); return this.request<readonly CustomerStorageLot[]>(`/api/customer-custody/lots?${search}`, { signal }); }
  private async command<T>(path: string, operation: string, payload: Record<string, unknown>) { const requestId = crypto.randomUUID(); const payloadHash = await hash({ operation, requestId, ...payload }); return this.request<T>(path, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...payload }) }); }
  receive(payload: Record<string, unknown>) { return this.command<CustomerStorageLot>("/api/customer-custody/lots", "CUSTOMER_CUSTODY_RECEIVE", payload); }
  move(payload: Record<string, unknown>) { return this.command<CustomerStorageLot>("/api/customer-custody/movements", "CUSTOMER_CUSTODY_MOVE", payload); }
  grants(signal?: AbortSignal) { return this.request<readonly WarehouseAccessGrant[]>("/api/customer-custody/access-grants", { signal }); }
  grant(payload: Record<string, unknown>) { return this.command<WarehouseAccessGrant>("/api/customer-custody/access-grants", "WAREHOUSE_ACCESS_GRANT_CREATE", payload); }
  async updateGrant(grantRef: string, payload: Record<string, unknown>) { const requestId = crypto.randomUUID(); const payloadHash = await hash({ operation: "WAREHOUSE_ACCESS_GRANT_UPDATE", requestId, grantRef, ...payload }); return this.request<WarehouseAccessGrant>(`/api/customer-custody/access-grants/${encodeURIComponent(grantRef)}`, { method: "PATCH", body: JSON.stringify({ requestId, payloadHash, ...payload }) }); }
}

export function customerCustodyErrorText(error: unknown) { const code = error instanceof CustomerCustodyApiError ? error.code : ""; return ({ CUSTOMER_CUSTODY_FORBIDDEN: "No tiene permiso para consultar o modificar esta custodia.", CUSTOMER_CUSTODY_SCOPE_FORBIDDEN: "Su acceso no incluye este almacén, ubicación u operación.", CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND: "El cliente, expediente, almacén o artículo ya no está disponible.", CUSTOMER_CUSTODY_CLIENT_CASE_MISMATCH: "El expediente seleccionado no corresponde al cliente.", CUSTOMER_CUSTODY_VERSION_CONFLICT: "Otra persona modificó este artículo. Actualice antes de continuar.", CUSTOMER_CUSTODY_DISABLED: "La custodia de clientes todavía no está habilitada en este entorno." } as Record<string, string>)[code] || "No se pudo confirmar la operación. Actualice e intente de nuevo."; }

