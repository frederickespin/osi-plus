import { getMembershipRef } from "@/lib/sessionStore";
import type { FleetCreate, FleetList, FleetListFilters, FleetUpdate, FleetVehicle } from "./types";

export class FleetApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.name = "FleetApiError"; this.code = code; this.status = status; }
}

const VEHICLE_KEYS = ["vehicleRef", "businessCode", "plate", "vin", "vehicleType", "brand", "model", "modelYear", "capacityWeight", "capacityVolume", "usableLength", "usableWidth", "usableHeight", "weightUnit", "volumeUnit", "dimensionUnit", "operationalStatus", "availableForCalculation", "effectiveFrom", "effectiveTo", "hubCode", "rowVersion", "updatedAt", "retiredAt", "calculationLocked"];
const fail = (): never => { throw new FleetApiError("ADMIN_FLEET_RESPONSE_INVALID", 502); };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const iso = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value));
const text = (value: unknown, maximum: number, nullable = false) => nullable && value === null || typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
const ref = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,191}$/u.test(value);

function vehicleOf(value: unknown): FleetVehicle {
  if (!record(value) || Object.keys(value).length !== VEHICLE_KEYS.length || VEHICLE_KEYS.some((key) => !(key in value))) return fail();
  if (!ref(value.vehicleRef) || !text(value.businessCode, 80) || !text(value.vehicleType, 80)
    || !text(value.plate, 40, true) || !text(value.vin, 80, true) || !text(value.brand, 120, true)
    || !text(value.model, 120, true) || !text(value.hubCode, 80, true)) return fail();
  if (value.modelYear !== null && (!Number.isInteger(value.modelYear) || Number(value.modelYear) < 1900 || Number(value.modelYear) > 2200)) return fail();
  for (const key of ["capacityWeight", "capacityVolume", "usableLength", "usableWidth", "usableHeight"]) {
    if (value[key] !== null && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || Number(value[key]) <= 0)) return fail();
  }
  if (!["KG", "LB"].includes(String(value.weightUnit)) || !["CBM", "CFT"].includes(String(value.volumeUnit))
    || !["M", "CM", "FT", "IN"].includes(String(value.dimensionUnit))
    || !["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"].includes(String(value.operationalStatus))
    || typeof value.availableForCalculation !== "boolean" || typeof value.calculationLocked !== "boolean"
    || !Number.isInteger(value.rowVersion) || Number(value.rowVersion) < 1 || !iso(value.updatedAt) || !iso(value.effectiveFrom)
    || value.effectiveTo !== null && !iso(value.effectiveTo) || value.retiredAt !== null && !iso(value.retiredAt)) return fail();
  if (["UNAVAILABLE", "RETIRED"].includes(String(value.operationalStatus)) && value.availableForCalculation) return fail();
  return value as FleetVehicle;
}

async function bodyOf(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) return fail();
  const body: unknown = await response.json().catch(fail);
  if (!record(body)) return fail();
  if (!response.ok) throw new FleetApiError(typeof body.error === "string" ? body.error : "ADMIN_FLEET_UNAVAILABLE", response.status);
  if (body.ok !== true) return fail();
  return body;
}

export class FleetApi {
  constructor(
    privateToken: () => string | null,
    fetchImpl: typeof fetch = fetch,
    membershipProvider: () => string | null = getMembershipRef,
  ) { this.tokenProvider = privateToken; this.fetchImpl = fetchImpl; this.membershipProvider = membershipProvider; }
  private readonly tokenProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly membershipProvider: () => string | null;
  private headers(write = false) {
    const token = this.tokenProvider();
    const membership = this.membershipProvider();
    if (!token) throw new FleetApiError("COMMERCIAL_AUTH_REQUIRED", 401);
    if (!membership) throw new FleetApiError("MT01B_MEMBERSHIP_SELECTION_INVALID", 400);
    return { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membership, ...(write ? { "Content-Type": "application/json" } : {}) };
  }
  async list(filters: FleetListFilters, signal?: AbortSignal): Promise<FleetList> {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
    if (filters.search.trim()) query.set("search", filters.search.trim());
    if (filters.vehicleType.trim()) query.set("vehicleType", filters.vehicleType.trim());
    if (filters.operationalStatus) query.set("operationalStatus", filters.operationalStatus);
    const response = await this.fetchImpl(`/api/admin/fleet/vehicles?${query}`, { headers: this.headers(), cache: "no-store", signal });
    const body = await bodyOf(response);
    if (!Array.isArray(body.data) || !Number.isInteger(body.total) || Number(body.total) < 0
      || body.page !== filters.page || body.pageSize !== filters.pageSize || body.data.length > filters.pageSize || body.data.length > Number(body.total)) return fail();
    const data = body.data.map(vehicleOf);
    if (new Set(data.map((vehicle) => vehicle.vehicleRef)).size !== data.length) return fail();
    return { data, total: Number(body.total), page: filters.page, pageSize: filters.pageSize };
  }
  async get(vehicleRef: string, signal?: AbortSignal) {
    if (!ref(vehicleRef)) throw new FleetApiError("ADMIN_FLEET_INPUT_INVALID", 400);
    const response = await this.fetchImpl(`/api/admin/fleet/vehicles/${encodeURIComponent(vehicleRef)}`, { headers: this.headers(), cache: "no-store", signal });
    const vehicle = vehicleOf((await bodyOf(response)).vehicle);
    if (vehicle.vehicleRef !== vehicleRef) return fail();
    return vehicle;
  }
  async create(payload: FleetCreate, signal?: AbortSignal) {
    const response = await this.fetchImpl("/api/admin/fleet/vehicles", { method: "POST", headers: this.headers(true), body: JSON.stringify(payload), cache: "no-store", signal });
    const body = await bodyOf(response);
    if (typeof body.created !== "boolean" || typeof body.idempotent !== "boolean") return fail();
    return vehicleOf(body.vehicle);
  }
  async update(vehicleRef: string, payload: FleetUpdate, signal?: AbortSignal) {
    if (!ref(vehicleRef)) throw new FleetApiError("ADMIN_FLEET_INPUT_INVALID", 400);
    const response = await this.fetchImpl(`/api/admin/fleet/vehicles/${encodeURIComponent(vehicleRef)}`, { method: "PATCH", headers: this.headers(true), body: JSON.stringify(payload), cache: "no-store", signal });
    const vehicle = vehicleOf((await bodyOf(response)).vehicle);
    if (vehicle.vehicleRef !== vehicleRef || vehicle.rowVersion < payload.expectedVersion) return fail();
    return vehicle;
  }
}

export function fleetErrorText(error: unknown, context: "request" | "details" | "availability" | "active" = "request") {
  const code = error instanceof FleetApiError ? error.code : "";
  if (code === "ADMIN_FLEET_INPUT_INVALID") return ({
    request: "No se pudo validar la solicitud.",
    details: "No se pudo guardar la ficha. Revise los datos ingresados.",
    availability: "No se pudo guardar la disponibilidad. Revise el estado y la vigencia.",
    active: "No se pudo cambiar el estado Activo del vehículo.",
  })[context];
  return ({
    ADMIN_FLEET_DISABLED: "La flota no está habilitada en este entorno.",
    ADMIN_FLEET_FORBIDDEN: "No tiene permiso para esta operación.",
    ADMIN_FLEET_NOT_FOUND: "El vehículo ya no está disponible en esta empresa.",
    ADMIN_FLEET_VERSION_CONFLICT: "La ficha cambió desde que la abrió. Recárguela para revisar la versión actual.",
    ADMIN_FLEET_DUPLICATE: "El código, la matrícula o el VIN ya pertenecen a otro vehículo.",
    ADMIN_FLEET_REQUEST_CONFLICT: "La solicitud ya cambió. Recargue para confirmar el estado del vehículo.",
    ADMIN_FLEET_RETIRED: "El vehículo fue retirado. Su ficha se conserva para consulta.",
    ADMIN_FLEET_CALCULATION_LOCKED: "Las características técnicas ya se utilizaron en un cálculo. Recargue la ficha.",
    ADMIN_FLEET_SCHEMA_UNAVAILABLE: "El registro de flota aún no está disponible en este entorno.",
    ADMIN_FLEET_CONFIGURATION_INVALID: "No fue posible comprobar la configuración de flota.",
    ADMIN_FLEET_RESPONSE_INVALID: "La respuesta no permitió verificar los datos de flota.",
  } as Record<string, string>)[code] || "No fue posible completar la operación. Compruebe el estado actual antes de repetirla.";
}
