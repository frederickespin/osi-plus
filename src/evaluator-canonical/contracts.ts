export const EVALUATOR_BACKEND_STATUS = "UNAVAILABLE" as const;

export type EvaluatorVisitState =
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "READY_TO_SUBMIT"
  | "SUBMITTED";

export type EvaluatorVisitSummary = Readonly<{
  id: string;
  code: string;
  status: EvaluatorVisitState;
  scheduledAt: string;
  customerDisplayName: string;
  locationLabel: string;
  version: number;
}>;

export type EvaluatorVisitDetail = EvaluatorVisitSummary & Readonly<{
  serviceType: string;
  surveyMethod: "PRESENTIAL" | "VIRTUAL_VIDEO";
  draftVersion: number;
}>;

export type EvaluatorCatalogItem = Readonly<{
  id: string;
  code: string;
  name: string;
  volumeM3: number;
  weightKg: number | null;
  active: boolean;
}>;

export type EvaluatorDraftEnvelope = Readonly<{
  visitId: string;
  version: number;
  updatedAt: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type EvaluatorSubmissionReceipt = Readonly<{
  visitId: string;
  submissionId: string;
  submittedAt: string;
  resultingVersion: number;
  commercialSync: "PENDING" | "COMPLETED" | "FAILED";
}>;

export type EvaluatorListQuery = Readonly<{
  page: number;
  pageSize: number;
  status?: EvaluatorVisitState;
}>;

export interface EvaluatorServerGateway {
  listVisits(query: EvaluatorListQuery, signal?: AbortSignal): Promise<Readonly<{
    total: number;
    data: readonly EvaluatorVisitSummary[];
  }>>;
  getVisit(visitId: string, signal?: AbortSignal): Promise<EvaluatorVisitDetail>;
  listCatalog(signal?: AbortSignal): Promise<readonly EvaluatorCatalogItem[]>;
  saveDraft(input: Readonly<{
    visitId: string;
    expectedVersion: number;
    draft: Readonly<Record<string, unknown>>;
  }>, signal?: AbortSignal): Promise<EvaluatorDraftEnvelope>;
  submit(input: Readonly<{
    visitId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>, signal?: AbortSignal): Promise<EvaluatorSubmissionReceipt>;
}
