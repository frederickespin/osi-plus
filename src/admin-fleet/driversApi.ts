import { getMembershipRef } from "@/lib/sessionStore";
import { FleetApiError } from "./api";
import type { FleetDriverAuthorization, FleetDriverDecisionInput, FleetDriverHistoryEntry, FleetDriverHistoryKind, FleetDriverOptions, FleetDriverPageFilters, FleetDriverPerson, FleetDriverPrimaryEvent, FleetDriverPrimaryInput, FleetDriverReceipt, FleetDriverRequestInput, FleetDriverWorkspace } from "./driverTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const VEHICLE_REF = /^[A-Za-z0-9_-]{1,191}$/u;
const PRIMARY_KEYS = ["kind", "assignmentRef", "revision", "driver", "driverEligible", "assignedBy", "assignedAt", "reason"];
const TEMPORARY_KEYS = ["kind", "authorizationRef", "driver", "driverEligible", "startsAt", "endsAt", "reason", "status", "effectiveStatus", "requestedBy", "requestedAt", "decidedBy", "decidedAt", "decisionReason", "revokedBy", "revokedAt", "revocationReason", "version", "canApprove", "canReject", "canRevoke"];
function invalid(): never { throw new FleetApiError("FLEET_DRIVERS_RESPONSE_INVALID", 502); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function exact(value: unknown, keys: readonly string[]) { const row = object(value); if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) invalid(); return row; }
function text(value: unknown, maximum: number) { if (typeof value !== "string" || !value.trim() || value.length > maximum) invalid(); return value; }
function nullableText(value: unknown, maximum: number) { return value === null ? null : text(value, maximum); }
function uuid(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function integer(value: unknown, minimum = 0) { if (!Number.isSafeInteger(value) || Number(value) < minimum) invalid(); return Number(value); }
function boolean(value: unknown) { if (typeof value !== "boolean") invalid(); return value; }
function timestamp(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(); return value; }
function person(value: unknown): FleetDriverPerson { const row = exact(value, ["membershipRef", "displayName"]); return { membershipRef: uuid(row.membershipRef), displayName: text(row.displayName, 160) }; }
function primary(value: unknown): FleetDriverPrimaryEvent {
  const row = exact(value, PRIMARY_KEYS); if (row.kind !== "PRIMARY") invalid();
  return { kind: "PRIMARY", assignmentRef: uuid(row.assignmentRef), revision: integer(row.revision, 1), driver: row.driver === null ? null : person(row.driver), driverEligible: boolean(row.driverEligible), assignedBy: person(row.assignedBy), assignedAt: timestamp(row.assignedAt), reason: text(row.reason, 2000) };
}
function temporary(value: unknown): FleetDriverAuthorization {
  const row = exact(value, TEMPORARY_KEYS);
  if (row.kind !== "TEMPORARY" || !["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"].includes(String(row.status))
    || !["PENDING", "SCHEDULED", "ACTIVE", "EXPIRED", "REJECTED", "CANCELLED", "REVOKED", "UNAVAILABLE"].includes(String(row.effectiveStatus))) invalid();
  const startsAt = timestamp(row.startsAt); const endsAt = timestamp(row.endsAt); if (endsAt <= startsAt) invalid();
  return { kind: "TEMPORARY", authorizationRef: uuid(row.authorizationRef), driver: person(row.driver), driverEligible: boolean(row.driverEligible), startsAt, endsAt,
    reason: text(row.reason, 2000), status: row.status as FleetDriverAuthorization["status"], effectiveStatus: row.effectiveStatus as FleetDriverAuthorization["effectiveStatus"],
    requestedBy: person(row.requestedBy), requestedAt: timestamp(row.requestedAt), decidedBy: row.decidedBy === null ? null : person(row.decidedBy), decidedAt: row.decidedAt === null ? null : timestamp(row.decidedAt),
    decisionReason: nullableText(row.decisionReason, 2000), revokedBy: row.revokedBy === null ? null : person(row.revokedBy), revokedAt: row.revokedAt === null ? null : timestamp(row.revokedAt), revocationReason: nullableText(row.revocationReason, 2000),
    version: integer(row.version, 1), canApprove: boolean(row.canApprove), canReject: boolean(row.canReject), canRevoke: boolean(row.canRevoke) };
}
function pageOf(body: Record<string, unknown>, filters: FleetDriverPageFilters) {
  const total = integer(body.total);
  if (body.page !== filters.page || body.pageSize !== filters.pageSize || !Array.isArray(body.data) || body.data.length > filters.pageSize || body.data.length > total) invalid();
  return { total, page: filters.page, pageSize: filters.pageSize, data: body.data };
}
async function bodyOf(response: Response) {
  if (!(response.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) invalid();
  const body = object(await response.json().catch(invalid));
  if (!response.ok) throw new FleetApiError(typeof body.error === "string" ? body.error : "FLEET_DRIVERS_UNAVAILABLE", response.status);
  if (body.ok !== true) invalid();
  return body;
}
function vehiclePath(vehicleRef: string) {
  if (!VEHICLE_REF.test(vehicleRef)) throw new FleetApiError("FLEET_DRIVERS_INPUT_INVALID", 400);
  return `/api/admin/fleet/vehicles/${encodeURIComponent(vehicleRef)}/drivers`;
}
function receipt(value: unknown, vehicleRef: string, reference?: string): FleetDriverReceipt {
  const row = exact(value, ["ok", "vehicleRef", "reference", "version", "idempotent"]);
  if (row.vehicleRef !== vehicleRef || reference !== undefined && row.reference !== reference) invalid();
  return { vehicleRef, reference: uuid(row.reference), version: integer(row.version, 1), idempotent: boolean(row.idempotent) };
}

export class FleetDriversApi {
  private readonly tokenProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly membershipProvider: () => string | null;
  constructor(
    tokenProvider: () => string | null,
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    membershipProvider: () => string | null = getMembershipRef,
  ) { this.tokenProvider = tokenProvider; this.fetchImpl = fetchImpl; this.membershipProvider = membershipProvider; }
  private headers(write = false) {
    const token = this.tokenProvider(); const membership = this.membershipProvider();
    if (!token) throw new FleetApiError("COMMERCIAL_AUTH_REQUIRED", 401);
    if (!membership) throw new FleetApiError("MT01B_MEMBERSHIP_SELECTION_INVALID", 400);
    return { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membership, ...(write ? { "Content-Type": "application/json" } : {}) };
  }
  async options(filters: FleetDriverPageFilters & { search: string }, signal?: AbortSignal): Promise<FleetDriverOptions> {
    const query = new URLSearchParams({ search: filters.search.trim(), page: String(filters.page), pageSize: String(filters.pageSize) });
    const body = exact(await bodyOf(await this.fetchImpl(`/api/admin/fleet/drivers/options?${query}`, { headers: this.headers(), cache: "no-store", signal })), ["ok", "data", "total", "page", "pageSize"]);
    const result = pageOf(body, filters); const data = result.data.map(person);
    if (new Set(data.map((row) => row.membershipRef)).size !== data.length) invalid();
    return { ...result, data };
  }
  async get(vehicleRef: string, filters: FleetDriverPageFilters & { historyKind: FleetDriverHistoryKind }, signal?: AbortSignal): Promise<FleetDriverWorkspace> {
    const query = new URLSearchParams({ historyKind: filters.historyKind, page: String(filters.page), pageSize: String(filters.pageSize) });
    const body = exact(await bodyOf(await this.fetchImpl(`${vehiclePath(vehicleRef)}?${query}`, { headers: this.headers(), cache: "no-store", signal })), ["ok", "vehicle", "primaryDriver", "primaryVersion", "generatedAt", "historyKind", "data", "total", "page", "pageSize", "permissions"]);
    const vehicle = exact(body.vehicle, ["vehicleRef", "businessCode", "plate", "operationalStatus"]);
    if (vehicle.vehicleRef !== vehicleRef || body.historyKind !== filters.historyKind || !["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"].includes(String(vehicle.operationalStatus))) invalid();
    const permissions = exact(body.permissions, ["assign", "request", "authorize"]);
    const result = pageOf(body, filters); const data: FleetDriverHistoryEntry[] = result.data.map((row) => filters.historyKind === "PRIMARY" ? primary(row) : temporary(row));
    if (new Set(data.map((row) => row.kind === "PRIMARY" ? row.assignmentRef : row.authorizationRef)).size !== data.length) invalid();
    return { ...result, vehicle: { vehicleRef, businessCode: text(vehicle.businessCode, 80), plate: nullableText(vehicle.plate, 40), operationalStatus: vehicle.operationalStatus as FleetDriverWorkspace["vehicle"]["operationalStatus"] },
      primaryDriver: body.primaryDriver === null ? null : primary(body.primaryDriver), primaryVersion: integer(body.primaryVersion), generatedAt: timestamp(body.generatedAt), historyKind: filters.historyKind, data,
      permissions: { assign: boolean(permissions.assign), request: boolean(permissions.request), authorize: boolean(permissions.authorize) } };
  }
  async setPrimary(vehicleRef: string, input: FleetDriverPrimaryInput, signal?: AbortSignal) {
    const body = await bodyOf(await this.fetchImpl(`${vehiclePath(vehicleRef)}/primary`, { method: "PUT", headers: this.headers(true), body: JSON.stringify(input), cache: "no-store", signal }));
    return receipt(body, vehicleRef);
  }
  async requestAuthorization(vehicleRef: string, input: FleetDriverRequestInput, signal?: AbortSignal) {
    const body = await bodyOf(await this.fetchImpl(`${vehiclePath(vehicleRef)}/authorizations`, { method: "POST", headers: this.headers(true), body: JSON.stringify(input), cache: "no-store", signal }));
    return receipt(body, vehicleRef);
  }
  async decideAuthorization(vehicleRef: string, authorizationRef: string, input: FleetDriverDecisionInput, signal?: AbortSignal) {
    if (!UUID.test(authorizationRef)) throw new FleetApiError("FLEET_DRIVERS_INPUT_INVALID", 400);
    const body = await bodyOf(await this.fetchImpl(`${vehiclePath(vehicleRef)}/authorizations/${encodeURIComponent(authorizationRef)}`, { method: "PATCH", headers: this.headers(true), body: JSON.stringify(input), cache: "no-store", signal }));
    return receipt(body, vehicleRef, authorizationRef);
  }
}

export function fleetDriversErrorText(cause: unknown) {
  const code = cause instanceof FleetApiError ? cause.code : "";
  return ({
    FLEET_DRIVERS_DISABLED: "La gestión de choferes no está habilitada en este entorno.",
    FLEET_DRIVERS_FORBIDDEN: "Su acceso no permite esta operación con choferes.",
    FLEET_DRIVERS_NOT_FOUND: "El vehículo o la autorización ya no está disponible en esta empresa.",
    FLEET_DRIVERS_INPUT_INVALID: "Revise el chofer, las fechas y el motivo.",
    FLEET_DRIVERS_DRIVER_INELIGIBLE: "El chofer ya no está habilitado. Actualice y seleccione un chofer activo.",
    FLEET_DRIVERS_DRIVER_UNAVAILABLE: "El chofer ya no está habilitado. Actualice y seleccione un chofer activo.",
    FLEET_DRIVERS_DRIVER_NOT_FOUND: "El chofer ya no está disponible en esta empresa. Recargue los datos.",
    FLEET_DRIVERS_VERSION_CONFLICT: "La asignación o autorización cambió. Recargue los datos antes de volver a guardar.",
    FLEET_DRIVERS_REQUEST_CONFLICT: "La solicitud ya cambió. Recargue los datos para comprobar su estado.",
    FLEET_DRIVERS_STATE_CONFLICT: "La autorización cambió de estado. Recargue los datos antes de decidir.",
    FLEET_DRIVERS_CONFLICT: "El uso solicitado coincide con otra asignación. Recargue y revise el intervalo.",
    FLEET_DRIVERS_EXPIRED: "La autorización venció. Revise las fechas y cree una nueva solicitud si corresponde.",
    FLEET_DRIVERS_RETIRED: "El vehículo está retirado. Sus asignaciones se conservan para consulta.",
    FLEET_DRIVERS_VEHICLE_RETIRED: "El vehículo está retirado. Sus asignaciones se conservan para consulta.",
    FLEET_DRIVERS_SELF_AUTHORIZATION_FORBIDDEN: "No puede autorizarse a sí mismo como chofer. Debe decidir otro responsable habilitado.",
    FLEET_DRIVERS_SCHEMA_UNAVAILABLE: "El registro de choferes todavía no está disponible en este entorno.",
    FLEET_DRIVERS_CONFIGURATION_INVALID: "No fue posible comprobar la configuración de choferes.",
    FLEET_DRIVERS_RESPONSE_INVALID: "La respuesta no permitió verificar los datos de choferes.",
  } as Record<string, string>)[code] || "No fue posible confirmar la operación. Recargue los datos para comprobar el estado antes de repetirla.";
}
