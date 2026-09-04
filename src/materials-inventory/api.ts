export type MaterialRow = Readonly<{ materialRef: string; code: string; name: string; description: string | null; family: string; subfamily: string | null; baseUnit: { unitRef: string; code: string; name: string }; status: "ACTIVE" | "INACTIVE"; version: number; minimumStock: number | null; reorderPoint: number | null; currentCost: null | { costVersionRef: string; amount: number; currency: string; unitRef: string; unitCode: string; validFrom: string; version: number }; inventory: { physical: number; reserved: number; assigned: number; available: number; byWarehouse: readonly { warehouseRef: string; physical: number; reserved: number; assigned: number; available: number }[] } }>;
export type CatalogResponse = Readonly<{ page: number; pageSize: number; total: number; items: readonly MaterialRow[] }>;
export type MovementRow = Readonly<{ movementRef: string; transactionRef: string; movementType: string; material: { materialRef: string; code: string; name: string }; location: { locationRef: string; code: string; name: string; warehouse: string }; quantity: number; reasonCode: string; occurredAt: string }>;
export type ReservationRow = Readonly<{ reservationRef: string; material: { materialRef: string; code: string; name: string }; location: { locationRef: string; code: string; name: string }; quantity: number; status: string; version: number; createdAt: string }>;
export type WarehouseRow = Readonly<{ warehouseRef: string; code: string; name: string; status: string; version: number; locations: readonly { locationRef: string; code: string; name: string; kind: string; depth: number; path: string; status: string }[] }>;
export type RecipeRow = Readonly<{ recipeRef: string; code: string; name: string; status: string; versions: readonly { recipeVersionRef: string; version: number; status: string; lines: readonly unknown[] }[] }>;
export type RequirementRow = Readonly<{ requirementRef: string; surveyPublicationRef: string; recipe: { recipeRef: string; recipeVersionRef: string; code: string; version: number }; revision: number; status: string; createdAt: string; items: readonly { materialRef: string; code: string; name: string; quantity: number; unit: { unitRef: string; code: string } }[] }>;
async function read<T>(authorization: string | undefined, path: string): Promise<T> {
  const response = await fetch(path, { headers: authorization ? { Authorization: `Bearer ${authorization}` } : {}, credentials: "omit", cache: "no-store" });
  const body = await response.json(); if (!response.ok) throw new Error(body?.error || "MATERIALS_REQUEST_FAILED"); return body.data as T;
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function command<T>(authorization: string | undefined, path: string, operation: string, payload: Record<string, unknown>): Promise<T> {
  const requestId = crypto.randomUUID(); const payloadHash = await sha256(canonicalJson({ operation, requestId, ...payload }));
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) }, credentials: "omit", body: JSON.stringify({ requestId, payloadHash, ...payload }) });
  const body = await response.json(); if (!response.ok) throw new Error(body?.error || "MATERIALS_REQUEST_FAILED"); return body.data as T;
}
export const materialsApi = Object.freeze({
  catalog: (authorization?: string) => read<CatalogResponse>(authorization, "/api/materials/catalog"),
  movements: (authorization?: string) => read<{ items: readonly MovementRow[] }>(authorization, "/api/materials/movements"),
  reservations: (authorization?: string) => read<readonly ReservationRow[]>(authorization, "/api/materials/reservations"),
  recipes: (authorization?: string) => read<readonly RecipeRow[]>(authorization, "/api/materials/recipes"),
  requirements: (authorization?: string) => read<readonly RequirementRow[]>(authorization, "/api/materials/requirements"),
  warehouses: (authorization?: string) => read<readonly WarehouseRow[]>(authorization, "/api/materials/warehouses"),
  movement: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/materials/movements", "INVENTORY_MOVEMENT", payload),
  reserve: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/materials/reservations", "RESERVATION_CREATE", payload),
  assign: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/materials/reservations/assign", "RESERVATION_ASSIGN", payload),
  release: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/materials/reservations/release", "RESERVATION_RELEASE", payload),
});
