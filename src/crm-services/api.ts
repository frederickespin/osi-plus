import { getMembershipRef } from "@/lib/sessionStore";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type RecordValue = Record<string, unknown>;
export type ServiceCatalogItem = Readonly<{ serviceRef: string; code: string; name: string; category: string | null; usage: "PRIMARY" | "COMPLEMENTARY" | "BOTH"; compatibleModes: readonly ("LOCAL" | "EXPORT" | "IMPORT")[]; status: "ACTIVE" | "INACTIVE"; sortOrder: number; version: number; usageCount: number; allowedComplementaryRefs: readonly string[] }>;
export type CaseServiceSelection = Readonly<{ selectionRef: string | null; revision: number; mode: "LOCAL" | "EXPORT" | "IMPORT" | null; source: "MANUAL" | "DEFAULT_COMBINATION" | null; defaultCombinationRef: string | null; primary: Readonly<{ serviceRef: string; code: string; name: string; category: string | null; catalogVersion: number; source: string }> | null; complementaries: readonly Readonly<{ serviceRef: string; code: string; name: string; category: string | null; catalogVersion: number; source: string }>[]; otherServices: readonly Readonly<{ description: string; classificationStatus: "PENDING" }>[]; historyCount: number }>;
export type CaseServiceWorkspace = Readonly<{ caseRef: string; mode: "LOCAL" | "EXPORT" | "IMPORT"; selection: CaseServiceSelection; primaries: readonly ServiceCatalogItem[]; allowedComplementaries: readonly Readonly<{ primaryServiceRef: string; service: ServiceCatalogItem }>[]; defaults: readonly Readonly<{ combinationRef: string; primaryServiceRef: string; name: string; isDefault: boolean; version: number; complementaryRefs: readonly string[] }>[] }>;

export class CrmServicesApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string) { super(code); this.name = "CrmServicesApiError"; this.status = status; this.code = code; } }
function record(value: unknown): RecordValue { if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return value as RecordValue; }
function exact(value: RecordValue, keys: readonly string[]) { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); }
function text(value: unknown, uuid = false) { if (typeof value !== "string" || !value || value.length > 320 || (uuid && !UUID_V4.test(value))) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return value; }
function integer(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return Number(value); }
function catalog(value: unknown): ServiceCatalogItem { const row = record(value); exact(row, ["serviceRef", "code", "name", "category", "usage", "compatibleModes", "status", "sortOrder", "version", "usageCount", "allowedComplementaryRefs"]); if (!Array.isArray(row.compatibleModes) || !Array.isArray(row.allowedComplementaryRefs)) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return Object.freeze({ serviceRef: text(row.serviceRef, true), code: text(row.code), name: text(row.name), category: row.category === null ? null : text(row.category), usage: row.usage as ServiceCatalogItem["usage"], compatibleModes: Object.freeze(row.compatibleModes.map((mode) => text(mode) as "LOCAL" | "EXPORT" | "IMPORT")), status: row.status as ServiceCatalogItem["status"], sortOrder: integer(row.sortOrder), version: integer(row.version), usageCount: integer(row.usageCount), allowedComplementaryRefs: Object.freeze(row.allowedComplementaryRefs.map((ref) => text(ref, true))) }); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; const row = value as RecordValue; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`; }
async function hash(value: unknown) { const bytes = new TextEncoder().encode(canonical(value)); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((item) => item.toString(16).padStart(2, "0")).join(""); }
function selectionItem(value: unknown) { const row = record(value); exact(row, ["serviceRef", "code", "name", "category", "catalogVersion", "source"]); return Object.freeze({ serviceRef: text(row.serviceRef, true), code: text(row.code), name: text(row.name), category: row.category === null ? null : text(row.category), catalogVersion: integer(row.catalogVersion), source: text(row.source) }); }
function selection(value: unknown): CaseServiceSelection {
  const row = record(value); exact(row, ["selectionRef", "revision", "mode", "source", "defaultCombinationRef", "primary", "complementaries", "otherServices", "historyCount"]);
  if (!Array.isArray(row.complementaries) || !Array.isArray(row.otherServices)) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID");
  const otherServices = row.otherServices.map((value) => { const item = record(value); exact(item, ["description", "classificationStatus"]); if (item.classificationStatus !== "PENDING") throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return Object.freeze({ description: text(item.description), classificationStatus: "PENDING" as const }); });
  return Object.freeze({ selectionRef: row.selectionRef === null ? null : text(row.selectionRef, true), revision: integer(row.revision), mode: row.mode === null ? null : text(row.mode) as CaseServiceSelection["mode"], source: row.source === null ? null : text(row.source) as CaseServiceSelection["source"], defaultCombinationRef: row.defaultCombinationRef === null ? null : text(row.defaultCombinationRef, true), primary: row.primary === null ? null : selectionItem(row.primary), complementaries: Object.freeze(row.complementaries.map(selectionItem)), otherServices: Object.freeze(otherServices), historyCount: integer(row.historyCount) });
}
function workspace(value: unknown): CaseServiceWorkspace {
  const row = record(value); exact(row, ["caseRef", "mode", "selection", "primaries", "allowedComplementaries", "defaults"]);
  if (!Array.isArray(row.primaries) || !Array.isArray(row.allowedComplementaries) || !Array.isArray(row.defaults)) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID");
  return Object.freeze({ caseRef: text(row.caseRef, true), mode: text(row.mode) as CaseServiceWorkspace["mode"], selection: selection(row.selection), primaries: Object.freeze(row.primaries.map(catalog)), allowedComplementaries: Object.freeze(row.allowedComplementaries.map((value) => { const item = record(value); exact(item, ["primaryServiceRef", "service"]); return Object.freeze({ primaryServiceRef: text(item.primaryServiceRef, true), service: catalog(item.service) }); })), defaults: Object.freeze(row.defaults.map((value) => { const item = record(value); exact(item, ["combinationRef", "primaryServiceRef", "name", "isDefault", "version", "complementaryRefs"]); if (!Array.isArray(item.complementaryRefs) || typeof item.isDefault !== "boolean") throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return Object.freeze({ combinationRef: text(item.combinationRef, true), primaryServiceRef: text(item.primaryServiceRef, true), name: text(item.name), isDefault: item.isDefault, version: integer(item.version), complementaryRefs: Object.freeze(item.complementaryRefs.map((ref) => text(ref, true))) }); })) });
}

export class CrmServicesApi {
  private readonly tokenProvider: () => string | null;
  constructor(tokenProvider: () => string | null) { this.tokenProvider = tokenProvider; }
  private async request(path: string, init: RequestInit = {}) {
    const token = this.tokenProvider(); const membershipRef = getMembershipRef();
    if (!token || !membershipRef) throw new CrmServicesApiError(401, "COMMERCIAL_AUTH_REQUIRED");
    const response = await fetch(`/api/crm/services${path}`, { ...init, credentials: "omit", cache: "no-store", headers: { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membershipRef, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    const body = record(await response.json());
    if (!response.ok) throw new CrmServicesApiError(response.status, typeof body.error === "string" ? body.error : "CRM_SERVICES_UNAVAILABLE");
    exact(body, ["ok", "data"]); if (body.ok !== true) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID");
    return body.data;
  }
  async workspace(caseRef: string, signal?: AbortSignal): Promise<CaseServiceWorkspace> {
    if (!UUID_V4.test(caseRef)) throw new CrmServicesApiError(404, "CRM_SERVICES_RESOURCE_NOT_FOUND");
    return workspace(await this.request(`/cases/${encodeURIComponent(caseRef)}`, { signal }));
  }
  async saveSelection(caseRef: string, unsigned: Omit<RecordValue, "payloadHash">) {
    const payload = { operation: "CASE_SELECTION_SAVE", ...unsigned }; const body = { ...unsigned, payloadHash: await hash(payload) };
    return this.request(`/cases/${encodeURIComponent(caseRef)}`, { method: "PATCH", body: JSON.stringify(body) });
  }
  async catalog(signal?: AbortSignal): Promise<readonly ServiceCatalogItem[]> { const value = await this.request("/catalog", { signal }); if (!Array.isArray(value)) throw new CrmServicesApiError(502, "CRM_SERVICES_RESPONSE_INVALID"); return Object.freeze(value.map(catalog)); }
  async createCatalog(unsigned: Omit<RecordValue, "payloadHash">) { const payload = { operation: "CATALOG_CREATE", ...unsigned }; return this.request("/catalog", { method: "POST", body: JSON.stringify({ ...unsigned, payloadHash: await hash(payload) }) }); }
  async updateCatalog(serviceRef: string, unsigned: Omit<RecordValue, "payloadHash">) { const payload = { operation: "CATALOG_UPDATE", ...unsigned }; return this.request(`/catalog/${encodeURIComponent(serviceRef)}`, { method: "PATCH", body: JSON.stringify({ ...unsigned, payloadHash: await hash(payload) }) }); }
  async history(serviceRef: string) { return this.request(`/catalog/${encodeURIComponent(serviceRef)}`) as Promise<Readonly<{ serviceRef: string; events: readonly Readonly<{ action: string; version: number; createdAt: string }>[] }>>; }
  async defaults(primaryServiceRef: string) { return this.request(`/defaults?primaryRef=${encodeURIComponent(primaryServiceRef)}`) as Promise<readonly Readonly<{ combinationRef: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; isDefault: boolean; version: number; complementaries: readonly ServiceCatalogItem[] }>[]>; }
  async saveDefaults(unsigned: Omit<RecordValue, "payloadHash">) { const payload = { operation: "DEFAULTS_SAVE", ...unsigned }; return this.request("/defaults", { method: "POST", body: JSON.stringify({ ...unsigned, payloadHash: await hash(payload) }) }); }
}
