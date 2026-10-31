export const TRANSPORT_CONTRACT = "V17_TRANSPORT_ZONES_V1" as const;
export type TransportPurpose = "QUOTE" | "SERVICE" | "VISIT";
export type TransportContext = Readonly<{ contract: typeof TRANSPORT_CONTRACT; purpose: TransportPurpose; contextRef: string | null }>;
export type TransportCoordinate = readonly [number, number]; // longitude, latitude
export type TransportPolygon = Readonly<{ type: "Polygon"; coordinates: readonly (readonly TransportCoordinate[])[] }>;
export type TransportComponentKind = "BASE" | "FUEL" | "TOLL" | "PER_DIEM" | "ALLOWANCE" | "OTHER";
export type TransportBasis = "TRIP" | "GALLON" | "PASS" | "PERSON_DAY" | "FIXED" | "KM";
export type TransportComponentInput = Readonly<{
  code: string; label: string; kind: TransportComponentKind; basis: TransportBasis;
  unitCost: string | null; classification: "PR" | "EX" | "DE";
  minimumMarginBps: number | null; recommendedMarginBps: number | null;
  includedConcepts: readonly TransportComponentKind[];
}>;
export type TransportComponent = TransportComponentInput & Readonly<{ costRuleRef: string; costRuleVersion: number }>;
export type TransportZoneInput = Readonly<{
  seriesRef: string | null; expectedVersion: number | null; code: string; name: string;
  zoneType: "METRO" | "INTERIOR"; priority: number; vehicleType: string | null;
  purposes: readonly TransportPurpose[]; geometry: TransportPolygon;
  mode: "ITEMIZED" | "FACTOR"; factor: string | null; currency: string;
  kmPerGallon: string | null; gallonUnit: "US" | "IMPERIAL"; fuelType: string | null;
  includedConcepts: readonly TransportComponentKind[]; components: readonly TransportComponentInput[];
  state: "DRAFT" | "ACTIVE" | "INACTIVE";
}>;
export type TransportZone = Omit<TransportZoneInput, "seriesRef" | "expectedVersion" | "components"> & Readonly<{
  ruleRef: string; seriesRef: string; version: number; components: readonly TransportComponent[];
  validFrom: string | null; validTo: string | null;
}>;
export type TransportJourney = Readonly<{
  journeyRef: string; label: string; vehicleType: string; vehicleRef: string | null;
  origin: TransportCoordinate | null; destination: TransportCoordinate | null;
  distanceKm: string | null; distanceSource: string; returnToOrigin: boolean; trips: number;
  people: number | null; days: string | null;
  quantities: Readonly<Record<string, string>>; // PASS/FIXED totals for this journey, already including return and trips
}>;
export type TransportCalculateInput = Readonly<{
  caseRef: string; purpose: TransportPurpose; contextRef: string | null;
  intervalStart: string; intervalEnd: string; journeys: readonly TransportJourney[];
}>;
export type TransportIssue = Readonly<{ code: string; message: string; journeyRef: string | null; severity: "WARNING" | "BLOCKER" }>;
export type TransportLine = Readonly<{
  journeyRef: string; zoneRuleRef: string; zoneVersion: number; zoneCode: string; zoneType: "METRO" | "INTERIOR";
  componentCode: string; concept: string; kind: TransportComponentKind; basis: TransportBasis;
  quantity: string | null; unit: string; unitCost: string | null; baseUnitCost: string | null; totalCost: string | null; currency: string;
  costRuleRef: string; costRuleVersion: number; factor: string | null; distanceKm: string | null;
  kmPerGallon: string | null; gallonUnit: "US" | "IMPERIAL" | null; fuelType: string | null;
}>;
export type TransportResult = Readonly<{
  context: TransportContext; lines: readonly TransportLine[]; issues: readonly TransportIssue[];
  totals: readonly Readonly<{ currency: string; amount: string | null }>[]; complete: boolean;
}>;
export type TransportCalculation = Readonly<{
  calculationRef: string; status: string; inputHash: string; resultHash: string;
  calculatedAt: string; input: TransportCalculateInput; result: TransportResult;
}>;
export type TransportPublication = Readonly<{
  revisionRef: string; revision: number; publishedAt: string; context: TransportContext;
  calculationRef: string; result: TransportResult; input: TransportCalculateInput;
}>;
export type TransportWorkspace = Readonly<{
  cases: readonly Readonly<{ caseRef: string; label: string; mode: string }>[];
  visits: readonly Readonly<{ contextRef: string; label: string }>[];
  vehicles: readonly Readonly<{ vehicleRef: string; businessCode: string; vehicleType: string }>[];
}>;
