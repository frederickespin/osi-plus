import { getMembershipRef } from "@/lib/sessionStore";
import type { CaseDailyTravel, TransportCoordinate, TransportPolygon } from "../../shared/logisticsTransport";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const CASE_ROUTE_MAX_STOPS = 8;

export type CaseRouteAddress = Readonly<{
  sourceAddressRef: string | null;
  countryCode: string;
  provinceState: string | null;
  cityMunicipality: string;
  sector: string | null;
  streetAndNumber: string | null;
  buildingResidential: string | null;
  floorUnit: string | null;
  arrivalReference: string | null;
  locationContactName: string | null;
  locationContactPhone: string | null;
  point?: TransportCoordinate | null;
}>;
export type CaseRouteStop = Readonly<{ kind: "PICKUP" | "DELIVERY" | null; address: CaseRouteAddress }>;
export type CaseRouteOption = Readonly<{
  optionId: string;
  source: "REGISTERED" | "RECENT_SERVICE";
  label: string;
  caseCode: string | null;
  serviceType: string | null;
  usedAt: string;
  address: CaseRouteAddress;
}>;
export type CaseRouteWorkspace = Readonly<{
  caseRef: string;
  caseCode: string;
  version: number;
  route: Readonly<{
    revision: number;
    destinationStatus: "CONFIRMED" | "APPROXIMATE" | "PENDING";
    origin: CaseRouteAddress;
    destination: CaseRouteAddress | null;
    stops: readonly CaseRouteStop[];
  }>;
  options: readonly CaseRouteOption[];
}>;
export type ClientRouteOptions = Readonly<{ clientRef: string; options: readonly CaseRouteOption[] }>;
export type CaseRouteArea = Readonly<{ label: string; geometry: TransportPolygon }>;
export type CaseRouteCoverage = Readonly<{ areas: readonly CaseRouteArea[]; classification?: "METRO" | "INTERIOR" | null }>;

export class CaseRouteClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.name = "CaseRouteClientError"; this.status = status; this.code = code; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}
async function sha256(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}
function assertPrivate(response: Response) {
  const cache = (response.headers.get("cache-control") || "").toLowerCase();
  const vary = (response.headers.get("vary") || "").toLowerCase();
  if (!cache.includes("private") || !cache.includes("no-store") || !vary.includes("authorization") || !vary.includes("origin") || vary.includes("*")) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_HEADERS_INVALID");
}
function address(value: unknown): CaseRouteAddress {
  const row = record(value);
  if (row.point != null && (!Array.isArray(row.point) || row.point.length !== 2 || !row.point.every(Number.isFinite) ||
    Math.abs(row.point[0]) > 180 || Math.abs(row.point[1]) > 90)) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return Object.freeze({
    sourceAddressRef: typeof row.sourceAddressRef === "string" ? row.sourceAddressRef : null,
    countryCode: String(row.countryCode || ""), provinceState: row.provinceState == null ? null : String(row.provinceState),
    cityMunicipality: String(row.cityMunicipality || ""), sector: row.sector == null ? null : String(row.sector),
    streetAndNumber: row.streetAndNumber == null ? null : String(row.streetAndNumber), buildingResidential: row.buildingResidential == null ? null : String(row.buildingResidential),
    floorUnit: row.floorUnit == null ? null : String(row.floorUnit), arrivalReference: row.arrivalReference == null ? null : String(row.arrivalReference),
    locationContactName: row.locationContactName == null ? null : String(row.locationContactName), locationContactPhone: row.locationContactPhone == null ? null : String(row.locationContactPhone),
    ...(row.point != null && { point: [row.point[0], row.point[1]] as const }),
  });
}
function options(value: unknown): readonly CaseRouteOption[] {
  if (!Array.isArray(value)) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return Object.freeze(value.map((entry) => {
    const row = record(entry);
    if (!new Set(["REGISTERED", "RECENT_SERVICE"]).has(String(row.source))) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return Object.freeze({ optionId: String(row.optionId), source: row.source as CaseRouteOption["source"], label: String(row.label), caseCode: row.caseCode == null ? null : String(row.caseCode), serviceType: row.serviceType == null ? null : String(row.serviceType), usedAt: String(row.usedAt), address: address(row.address) });
  }));
}

export class CaseRouteApi {
  constructor(private readonly tokenProvider: () => string | null, private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), private readonly membershipRefProvider: () => string | null = getMembershipRef) {}
  private headers(json = false) {
    const token = this.tokenProvider(); const membership = this.membershipRefProvider();
    if (!token) throw new CaseRouteClientError(401, "COMMERCIAL_AUTH_REQUIRED");
    if (!membership) throw new CaseRouteClientError(400, "MT01B_MEMBERSHIP_SELECTION_INVALID");
    return { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membership };
  }
  private async read(response: Response) {
    assertPrivate(response);
    let parsed: unknown; try { parsed = JSON.parse(await response.text()); } catch { throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID"); }
    const root = record(parsed);
    if (!response.ok) throw new CaseRouteClientError(response.status, typeof root.error === "string" ? root.error : "CRM_PIPELINE_REQUEST_FAILED");
    return record(root.data);
  }
  async clientOptions(clientRef: string): Promise<ClientRouteOptions> {
    if (!UUID.test(clientRef)) throw new CaseRouteClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    const data = await this.read(await this.fetchImpl(`/api/crm/clients/${encodeURIComponent(clientRef)}/route-options`, { headers: this.headers(), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }));
    return Object.freeze({ clientRef: String(data.clientRef), options: options(data.options) });
  }
  async workspace(caseRef: string): Promise<CaseRouteWorkspace> {
    if (!UUID.test(caseRef)) throw new CaseRouteClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    return this.parseWorkspace(await this.read(await this.fetchImpl(`/api/crm/pipeline-cases/${encodeURIComponent(caseRef)}/route`, { headers: this.headers(), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })));
  }
  async travel(caseRef: string, base: string, terminal: string, signal: AbortSignal): Promise<CaseDailyTravel> {
    if (!UUID.test(caseRef)) throw new CaseRouteClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    const query = new URLSearchParams({ travel: "1" });
    if (base) query.set(UUID.test(base) ? "baseRef" : "baseAddress", base);
    if (terminal) query.set(UUID.test(terminal) ? "localTerminalRef" : "localTerminalAddress", terminal);
    const data = await this.read(await this.fetchImpl(`/api/crm/pipeline-cases/${encodeURIComponent(caseRef)}/route?${query}`, { headers: this.headers(), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal }));
    if (!Number.isInteger(data.revision) || !Array.isArray(data.bases) || !Array.isArray(data.legs) || !Array.isArray(data.preparation) || !data.area) {
      throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return data as CaseDailyTravel;
  }
  async coverage(caseRef: string, [longitude, latitude]: TransportCoordinate, signal: AbortSignal): Promise<CaseRouteCoverage> {
    if (!UUID.test(caseRef)) throw new CaseRouteClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    const query = new URLSearchParams({ longitude: longitude.toFixed(6), latitude: latitude.toFixed(6) });
    const data = await this.read(await this.fetchImpl(`/api/crm/pipeline-cases/${encodeURIComponent(caseRef)}/route?${query}`, { headers: this.headers(), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal }));
    if (!Array.isArray(data.areas)
      || data.classification !== undefined && data.classification !== null && data.classification !== "METRO" && data.classification !== "INTERIOR") {
      throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return { areas: data.areas as CaseRouteArea[], classification: data.classification };
  }
  async update(caseRef: string, value: Omit<CaseRouteWorkspace["route"], "revision" | "stops"> & Readonly<{ stops?: readonly CaseRouteStop[]; expectedVersion: number; expectedRouteRevision: number }>): Promise<CaseRouteWorkspace> {
    if (!UUID.test(caseRef)) throw new CaseRouteClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    const fields = { requestId: crypto.randomUUID(), expectedVersion: value.expectedVersion, expectedRouteRevision: value.expectedRouteRevision, destinationStatus: value.destinationStatus, origin: value.origin, destination: value.destination,
      ...(value.stops !== undefined && { stops: value.stops }) };
    const body = { ...fields, payloadHash: await sha256({ operation: "UPDATE_CASE_ROUTE", ...fields }) };
    const response = await this.fetchImpl(`/api/crm/pipeline-cases/${encodeURIComponent(caseRef)}/route`, { method: "PATCH", headers: this.headers(true), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", body: JSON.stringify(body) });
    const root = record(await (async () => { assertPrivate(response); try { return JSON.parse(await response.text()); } catch { throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID"); } })());
    if (!response.ok) throw new CaseRouteClientError(response.status, typeof root.error === "string" ? root.error : "CRM_PIPELINE_REQUEST_FAILED");
    return this.workspace(caseRef);
  }
  private parseWorkspace(data: Record<string, unknown>): CaseRouteWorkspace {
    const route = record(data.route);
    const destinationStatus = String(route.destinationStatus) as CaseRouteWorkspace["route"]["destinationStatus"];
    if (!new Set(["CONFIRMED", "APPROXIMATE", "PENDING"]).has(destinationStatus)) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    if (route.stops !== undefined && (!Array.isArray(route.stops) || route.stops.length > CASE_ROUTE_MAX_STOPS)) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const stops = (route.stops ?? []).map((entry: unknown): CaseRouteStop => {
      const stop = record(entry);
      if (stop.kind !== "PICKUP" && stop.kind !== "DELIVERY" && stop.kind !== null) throw new CaseRouteClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
      return { kind: stop.kind, address: address(stop.address) };
    });
    return Object.freeze({ caseRef: String(data.caseRef), caseCode: String(data.caseCode), version: Number(data.version), route: Object.freeze({ revision: Number(route.revision), destinationStatus, origin: address(route.origin), destination: route.destination === null ? null : address(route.destination), stops }), options: options(data.options) });
  }
}
