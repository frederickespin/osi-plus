import { getMembershipRef } from "@/lib/sessionStore";
import type { TransportCalculateInput, TransportCalculation, TransportPublication, TransportPurpose, TransportWorkspace, TransportZone, TransportZoneInput } from "../../shared/logisticsTransport";

export type * from "../../shared/logisticsTransport";

export class TransportRequestError extends Error {
  readonly status: number;
  readonly uncertain: boolean;
  constructor(code: string, status = 0, uncertain = false) {
    super(code);
    this.name = "TransportRequestError";
    this.status = status;
    this.uncertain = uncertain;
  }
}

async function request<T>(authorization: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const membershipRef = getMembershipRef();
  let response: Response;
  try {
    response = await fetch(path, {
      ...init, credentials: "omit", cache: "no-store",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        ...(membershipRef ? { "X-OSI-Membership-Ref": membershipRef } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new TransportRequestError("TRANSPORT_CONNECTION_FAILED", 0, Boolean(init.body));
  }
  let body: { ok?: boolean; data?: T; error?: string };
  try { body = await response.json(); }
  catch { throw new TransportRequestError("TRANSPORT_RESPONSE_INVALID", response.status, Boolean(init.body)); }
  if (!response.ok || body.ok === false) throw new TransportRequestError(typeof body.error === "string" ? body.error : "TRANSPORT_REQUEST_FAILED", response.status, Boolean(init.body) && response.status >= 500);
  if (!("data" in body)) throw new TransportRequestError("TRANSPORT_RESPONSE_INVALID", response.status, Boolean(init.body));
  return body.data as T;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(",")}}`;
}

async function command<T>(authorization: string | undefined, path: string, operation: string, payload: object, signal?: AbortSignal): Promise<T> {
  const requestId = crypto.randomUUID();
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ operation, requestId, ...payload })));
  const payloadHash = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return request<T>(authorization, path, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...payload }), signal });
}

export type TransportPublicationQuery = Readonly<{ caseRef: string; purpose: TransportPurpose; contextRef: string | null }>;

export const transportApi = Object.freeze({
  zones: (authorization?: string, signal?: AbortSignal) => request<readonly TransportZone[]>(authorization, "/api/logistics/transport/zones", { signal }),
  versionZone: (authorization: string | undefined, input: TransportZoneInput, signal?: AbortSignal) => command<TransportZone>(authorization, "/api/logistics/transport/zones", "TRANSPORT_ZONE_VERSION", input, signal),
  context: (authorization: string | undefined, query: { search?: string; caseRef?: string } = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.caseRef) params.set("caseRef", query.caseRef);
    return request<TransportWorkspace>(authorization, `/api/logistics/transport/context?${params}`, { signal });
  },
  publication: (authorization: string | undefined, query: TransportPublicationQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({ caseRef: query.caseRef, purpose: query.purpose });
    if (query.contextRef) params.set("contextRef", query.contextRef);
    return request<TransportPublication | null>(authorization, `/api/logistics/transport/plans?${params}`, { signal }).then((publication) => {
      if (publication && (publication.context.purpose !== query.purpose || publication.context.contextRef !== query.contextRef || publication.input.caseRef !== query.caseRef || publication.input.purpose !== query.purpose || publication.input.contextRef !== query.contextRef || publication.result.context.purpose !== query.purpose || publication.result.context.contextRef !== query.contextRef)) throw new TransportRequestError("TRANSPORT_CONTEXT_MISMATCH", 502);
      return publication;
    });
  },
  calculate: (authorization: string | undefined, input: TransportCalculateInput, signal?: AbortSignal) => command<TransportCalculation>(authorization, "/api/logistics/transport/calculate", "TRANSPORT_CALCULATE", input, signal),
  publish: (authorization: string | undefined, calculationRef: string, signal?: AbortSignal) => command<TransportPublication>(authorization, "/api/logistics/transport/publish", "TRANSPORT_PUBLISH", { calculationRef }, signal),
});

export function transportErrorMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (cause instanceof TransportRequestError && cause.status === 403) return "Su acceso no permite esta operación de transporte.";
  if (code === "LOGISTICS_TRANSPORT_ZONE_CODE_CONFLICT") return "Ese código pertenece a otra zona. Use un código diferente o abra la zona existente para crear su versión.";
  if (code === "LOGISTICS_TRANSPORT_ZONE_LIMIT") return "Se alcanzó el límite de zonas de la empresa. Revise las zonas existentes antes de añadir otra.";
  if (/ZONE_INTEGRITY|TARIFF_INTEGRITY/.test(code)) return "La configuración guardada de esta zona necesita revisión. Actualice y consulte al responsable de Flota / Logística.";
  if (code === "TRANSPORT_ZONE_CODE_INVALID") return "El código de zona debe comenzar con una letra y tener entre 2 y 64 letras, números o guiones bajos.";
  if (code === "TRANSPORT_COMPONENT_CODE_INVALID") return "El código de cada renglón debe comenzar con una letra y usar hasta 48 letras, números o guiones bajos.";
  if (/CONCEPT_DUPLICATED|COMPONENT_DUPLICATED/.test(code)) return "Un concepto está repetido o ya está cubierto por la base o un viático. Revise los renglones y sus conceptos incluidos.";
  if (code === "TRANSPORT_MARGIN_INVALID") return "El margen recomendado debe ser igual o mayor que el margen mínimo.";
  if (code === "TRANSPORT_NUMBER_INVALID") return "Revise los valores numéricos: kilómetros, rendimiento y cantidades admiten hasta 4 decimales; las tarifas y el factor, hasta 6.";
  if (code === "TRANSPORT_INTERVAL_INVALID") return "El fin debe ser posterior al inicio y el período no puede exceder un año.";
  if (code === "TRANSPORT_ROUTE_REQUIRED") return "Confirme la ruta del caso antes de calcular su transporte.";
  if (/VEHICLE_NOT_FOUND|VEHICLE_UNAVAILABLE|VEHICLE_REFERENCE_INVALID/.test(code)) return "Actualice los vehículos y seleccione uno habilitado, o indique el perfil de vehículo para estimar el recorrido.";
  if (/VERSION|STALE|CONFLICT/.test(code)) return "La información cambió desde que la abrió. Actualice y revise la versión vigente antes de continuar.";
  if (/SERVICES.*REQUIRED|SERVICE.*REVISION|NO_SERVICES/.test(code)) return "El caso necesita una revisión de Servicios publicada antes de calcular su transporte.";
  if (code === "TRANSPORT_CONTEXT_MISMATCH") return "La publicación recibida no corresponde a este caso y uso. Actualice para consultar el resultado correcto.";
  if (/CONTEXT|VISIT.*REQUIRED/.test(code)) return "Seleccione un caso y, si corresponde, una visita presencial vigente.";
  if (/GEOMETRY|POLYGON|COORDINATE/.test(code)) return "Revise el perímetro: necesita al menos tres puntos distintos, sin cruces y con coordenadas válidas.";
  if (/INCOMPLETE|BLOCKER|PENDING/.test(code)) return "El cálculo tiene datos pendientes. Revise el detalle antes de publicar.";
  if (/AUTH|SESSION/.test(code) || cause instanceof TransportRequestError && cause.status === 401) return "Su sesión necesita actualizarse.";
  if (/INVALID|VALIDATION|REQUIRED/.test(code)) return "Revise los datos señalados, las tarifas y las unidades de este formulario.";
  return "No se pudo completar la operación. Actualice la información para comprobar su estado.";
}

export function isTransportUnauthorized(cause: unknown): boolean {
  return cause instanceof TransportRequestError && cause.status === 401;
}
