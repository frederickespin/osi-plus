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

export type CrmPipelineCase = Readonly<{
  id: string;
  caseCode: string;
  clientName: string | null;
  mode: PipelineMode;
  serviceType: string;
  customerType: string;
  status: PipelineCaseStatus;
  estimatedCbm: number;
  requiresSurvey: boolean;
  surveyMethod: string;
  originLocation: string;
  destinationLocation: string;
  destinationContracted: boolean;
  assetsCount: number;
  owner: CrmOwner | null;
  quoteCount: number;
  eventCount: number;
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
  sla: Readonly<{ overdue: null; basis: "UNAVAILABLE" }>;
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
  ownerMembershipId: string;
}>;

export type UnassignOwnerInput = Readonly<{
  caseId: string;
  expectedVersion: number;
}>;
