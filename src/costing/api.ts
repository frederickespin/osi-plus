import type { PackageMeasures, PackageShipment, PackageVolumeTier } from "../../shared/servicePackagePricing.js";

export type CostingPackageEstimate = Readonly<{ versionRef: string; volumeM3: string; grossKg: string | null }>;
export type CostingPackageOption = Readonly<{
  versionRef: string; name: string; version: number; currency: string;
  shipment: PackageShipment; includeRouteTransport: boolean; needsWeight: boolean;
  minimumSale: string; volumeTiers: readonly PackageVolumeTier[];
}>;
export type CostingPackageOptions = Readonly<{
  hasService: boolean; packages: readonly CostingPackageOption[]; volumeM3: number | null; selectedPackageVersionRef?: string;
}>;
export type CostingPackagePricing = Readonly<{
  versionRef: string; name: string; version: number; pricingVersion: number;
  minimumSale: string; minimumMarginBps: number; recommendedMarginBps: number;
  afterM3?: number | null; maxM3?: number | null; allowEdits?: boolean;
  measures: PackageMeasures; shipment: PackageShipment;
}>;

export type CostingLine = Readonly<{ lineRef?: string; logisticsItemRef: string | null; family: string; concept: string; classification: "PR" | "EX" | "DE"; source: string; sourceRef: string | null; sourceVersion: number | null; quantity: string; unit: string; originalCurrency: string; originalUnitCost: string; exchangeRateRef: string | null; exchangeRateVersion: number | null; exchangeRate: string; baseCurrency: string; baseUnitCost: string; totalCost: string; minimumMarginBps: number | null; recommendedMarginBps: number | null; suggestedPrice: string | null; priceStatus: string; position: number; snapshot?: Record<string, unknown> }>;
export type QuoteCatalogItem = Readonly<{
  ruleRef: string; version: number; name: string; family: string;
  unit: string; currency: string; unitPrice: string; classification: "PR" | "EX" | "DE";
}>;
export type CostingIssue = Readonly<{ issueRef?: string; code: string; severity: "INFO" | "WARNING" | "BLOCKER"; family: string | null; message: string; source: string; status: "OPEN" | "RESOLVED"; version: number }>;
export type CostingTotals = Readonly<{ ownCosts: string; externalCosts: string; disbursements: string; risks: string; currencyCompensation: string; totalCost: string; suggestedPrice: string; expectedMarginBps: number | null }>;
export type CostingOverride = Readonly<{ overrideRef: string; lineRef: string | null; kind: string; suggestedValue: Record<string, unknown>; finalValue: Record<string, unknown>; reason: string; status: string; createdAt: string; authorization: null | { authorizationRef: string; decision: "AUTHORIZED" | "REJECTED"; reason: string; createdAt: string } }>;
export type CostingRevision = Readonly<{ revisionRef: string; revision: number; status: string; baseCurrency: string; logicalSha256: string; publishedAt: string; totals: CostingTotals; lines: readonly CostingLine[]; issues: readonly CostingIssue[]; overrides: readonly CostingOverride[]; packagePricing?: CostingPackagePricing }>;
export type CostingCalculation = Readonly<{ calculationRef: string; status: string; baseCurrency: string; inputHash: string; resultHash: string; result: { lines: readonly CostingLine[]; issues: readonly CostingIssue[]; totals: CostingTotals; packagePricing?: CostingPackagePricing } }>;
export type CostingRule = Readonly<{ ruleRef: string; seriesRef: string; family: string; code: string; name: string; classification: string; source: string; priority: number; specificity: number; unitCost: string | null; currency: string; minimumMarginBps: number | null; recommendedMarginBps: number | null; state: string; version: number; conditions?: Record<string, unknown>; result?: Record<string, unknown>; validFrom?: string | null; validTo?: string | null }>;
export type CostingRate = Readonly<{ rateRef: string; seriesRef: string; baseCurrency: string; quoteCurrency: string; rate: string; source: string; state: string; version: number; effectiveAt: string; logicalSha256: string }>;

async function request<T>(authorization: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "omit", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), ...(init.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "COSTING_REQUEST_FAILED");
  return body.data as T;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(",")}}`;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function command<T>(authorization: string | undefined, path: string, operation: string, payload: Record<string, unknown>, requestId: string = crypto.randomUUID()) {
  const payloadHash = await sha256(canonicalJson({ operation, requestId, ...payload }));
  return request<T>(authorization, path, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...payload }) });
}

export const costingApi = Object.freeze({
  revision: (authorization: string | undefined, caseRef: string, revisionRef?: string, signal?: AbortSignal) =>
    request<CostingRevision | null>(authorization, `/api/costing/revisions/${encodeURIComponent(caseRef)}${revisionRef ? "?revisionRef=" + encodeURIComponent(revisionRef) : ""}`, { signal }),
  currentLogistics: (authorization: string | undefined, caseRef: string) => request<{ revisionRef: string } | null>(authorization, `/api/logistics/plans/${encodeURIComponent(caseRef)}`),
  packageOptions: (authorization: string | undefined, caseRef: string, signal: AbortSignal) => request<CostingPackageOptions>(authorization, `/api/costing/revisions/${encodeURIComponent(caseRef)}?view=packages`, { signal }),
  calculate: (authorization: string | undefined, payload: { caseRef: string; logisticsPlanRevisionRef: string | null; baseCurrency: string; packageEstimate?: CostingPackageEstimate }, requestId?: string) => command<CostingCalculation>(authorization, "/api/costing/calculate", "COSTING_CALCULATE", payload, requestId),
  publish: (authorization: string | undefined, calculationRef: string, requestId?: string) => command<CostingRevision>(authorization, "/api/costing/publish", "COSTING_PUBLISH", { calculationRef }, requestId),
  override: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/costing/overrides", "COSTING_OVERRIDE", payload),
  authorize: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/costing/authorizations", "COSTING_MARGIN_AUTHORIZE", payload),
  resolve: (authorization: string | undefined, payload: Record<string, unknown>) => command(authorization, "/api/costing/issues/resolve", "COSTING_ISSUE_RESOLVE", payload),
  rules: (authorization?: string) => request<readonly CostingRule[]>(authorization, "/api/costing/rules"),
  versionRule: (authorization: string | undefined, payload: Record<string, unknown>, requestId?: string) => command<Pick<CostingRule, "ruleRef" | "seriesRef" | "family" | "classification" | "state" | "version" | "validFrom">>(authorization, "/api/costing/rules", "COSTING_RULE_VERSION", payload, requestId),
  quoteCatalog: (authorization: string | undefined, caseRef: string, currency: string, signal: AbortSignal) => request<readonly QuoteCatalogItem[]>(authorization, `/api/costing/revisions/${encodeURIComponent(caseRef)}?view=addons&currency=${encodeURIComponent(currency)}`, { signal }),
  rates: (authorization?: string) => request<readonly CostingRate[]>(authorization, "/api/costing/exchange-rates"),
  versionRate: (authorization: string | undefined, payload: Record<string, unknown>) => command<CostingRate>(authorization, "/api/costing/exchange-rates", "COSTING_EXCHANGE_RATE_VERSION", payload),
});
