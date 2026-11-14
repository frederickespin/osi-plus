export const PIPELINE_CASE_STATUSES = Object.freeze([
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION",
  "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
] as const);

export type PipelineCaseStatus = typeof PIPELINE_CASE_STATUSES[number];
export type PipelineMode = "LOCAL" | "EXPORT" | "IMPORT";
export type EvidenceType = "SURVEY" | "QUOTE" | "PROJECT" | "APPROVAL" | "ADDENDUM";

export type CrmOwner = Readonly<{
  displayName: string;
  role: string;
  membershipStatus: string;
}>;

export type CrmServiceClient = Readonly<{
  clientRef: string;
  displayName: string;
  type: string | null;
  status: string;
}>;

export type CrmRouteArea = "METRO" | "INTERIOR" | "UNAVAILABLE";
export type CrmRouteEndpoint = Readonly<{
  compactAddress: string;
  area: CrmRouteArea;
  areaSource: "PUBLISHED_LOGISTICS" | "UNAVAILABLE";
}>;
export type CrmPublishedRoute = Readonly<{
  revision: number;
  origin: CrmRouteEndpoint | null;
  destination: CrmRouteEndpoint | null;
}>;

export type CrmPipelineCase = Readonly<{
  caseRef: string;
  caseCode: string;
  client: CrmServiceClient | null;
  mode: PipelineMode;
  serviceType: string;
  customerType: string;
  status: PipelineCaseStatus;
  estimatedCbm: number;
  requiresSurvey: boolean;
  surveyMethod: string;
  originLocation: string;
  destinationLocation: string;
  route?: CrmPublishedRoute | null;
  destinationContracted: boolean;
  assetsCount: number;
  owner: CrmOwner | null;
  quoteCount: number;
  eventCount: number;
  sla: CrmCaseSla;
  createdAt: string;
  updatedAt: string;
}>;

export type CrmPipelineCaseDetail = Readonly<{
  caseRef: string;
  caseCode: string;
  version: number;
  status: PipelineCaseStatus;
  mode: PipelineMode | null;
  serviceType: string | null;
  customerType: string | null;
  estimatedCbm: number | null;
  requiresSurvey: boolean;
  surveyMethod: string | null;
  originLocation: string | null;
  destinationLocation: string | null;
  route?: CrmPublishedRoute | null;
  destinationContracted: boolean | null;
  assetsCount: number;
  quoteCount: number;
  eventCount: number;
  sla: CrmCaseSla;
  client: CrmServiceClient | null;
  owner: Readonly<{ displayName: string; isCurrentActor: boolean }> | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CrmPipelineList = Readonly<{
  total: number;
  page: number;
  pageSize: number;
  data: readonly CrmPipelineCase[];
}>;

export type CrmPipelineSummary = Readonly<{
  total: number;
  assigned: number;
  unassigned: number;
  byStatus: Readonly<Record<PipelineCaseStatus, number>>;
  sla: Readonly<{ overdue: number; atRisk: number; basis: "STATUS_POLICY" }>;
}>;

export type CrmCaseSla = Readonly<{
  state: "ON_TRACK" | "AT_RISK" | "OVERDUE" | "COMPLETED";
  dueAt: string | null;
  remainingMinutes: number | null;
  basis: "STATUS_POLICY";
}>;

export type CrmOwnerOption = Readonly<{
  presentationKey: string;
  ownerRef: string;
  displayName: string;
  role: "V";
  activeCases: number;
  maxActiveCases: number;
  loadPercent: number;
  availabilityStatus: "AVAILABLE" | "LIMITED";
  recommended: boolean;
}>;

export type CrmOwnerCatalog = Readonly<{
  total: number;
  page: number;
  pageSize: number;
  data: readonly CrmOwnerOption[];
}>;

export type CrmAllowedTransition = Readonly<{
  toStatus: PipelineCaseStatus;
  evidenceType: EvidenceType | null;
}>;

export type CrmAllowedTransitions = Readonly<{
  caseId: string;
  version: number;
  status: PipelineCaseStatus;
  transitions: readonly CrmAllowedTransition[];
}>;

export type CrmMutationReceipt = Readonly<{
  caseId: string;
  commandType: "TRANSITION" | "REOPEN" | "ASSIGN_OWNER" | "UNASSIGN_OWNER";
  previousVersion: number;
  resultingVersion: number;
  previousStatus: PipelineCaseStatus;
  resultingStatus: PipelineCaseStatus;
  replayed: boolean;
}>;

export type CrmPipelineFilters = Readonly<{
  page: number;
  pageSize: number;
  status?: PipelineCaseStatus;
  mode?: PipelineMode;
  owner?: "assigned" | "unassigned";
  search?: string;
}>;

export type TransitionInput = Readonly<{
  caseId: string;
  expectedVersion: number;
  toStatus: PipelineCaseStatus;
  reasonCode: string | null;
  evidence: Readonly<{ type: EvidenceType; id: string }> | null;
}>;

export type AssignOwnerInput = Readonly<{
  caseId: string;
  expectedVersion: number;
  ownerRef: string;
}>;

export type UnassignOwnerInput = Readonly<{
  caseId: string;
  expectedVersion: number;
}>;
