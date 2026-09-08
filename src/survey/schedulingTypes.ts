export type EvaluationMethod =
  | "IN_PERSON"
  | "VIRTUAL"
  | "CLIENT_PHOTOS_DOCUMENTS"
  | "WRITTEN_REPORT"
  | "VOXME"
  | "MINI"
  | "NONE";
export type EvaluationState =
  | "NOT_REQUIRED"
  | "PENDING_METHOD"
  | "WAITING_CLIENT_INFO"
  | "READY_TO_SCHEDULE"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type SchedulingWorkspace = Readonly<{
  caseRef: string;
  caseCode: string;
  routeVersion: number;
  decision: null | Readonly<{
    decisionRef: string;
    method: EvaluationMethod;
    state: EvaluationState;
    informationSource: string | null;
    rationaleCode: string | null;
    routeVersion: number;
    version: number;
    createdAt: string;
  }>;
  assignment: null | Readonly<{
    assignmentRef: string;
    scheduledStart: string;
    scheduledEnd: string | null;
    evaluator: { displayName: string };
    reason: null | { reasonRef: string; code: string; name: string };
    slotKey: string;
    profile: string;
    zoneCode: string;
    status: string;
    version: number;
    travelBufferMinutes: number;
    clientConfirmation: string;
    evaluatorConfirmation: string;
    resources: readonly unknown[];
    instruction: string | null;
    routeStale: boolean;
    surveyRef: string | null;
  }>;
  policy: null | Readonly<{
    policyRef: string;
    version: number;
    timezone: string;
    profiles: readonly { code: string; dailyCapacity: number }[];
    slots: readonly {
      profile: string;
      key: string;
      label: string;
      startTime: string;
      endTime: string;
      capacity: number;
    }[];
    closedWeekdays: readonly number[];
    closedDates: readonly string[];
    saturdayRequiresApproval: boolean;
  }>;
  operationalPolicy: null | Readonly<{
    policyRef: string;
    version: number;
    timezone: string;
    minimumTravelBufferMinutes: number;
    virtualPreparationMinutes: number;
    canRequestException: boolean;
    precedence: readonly string[];
  }>;
  visitReasons: readonly Readonly<{
    reasonRef: string;
    code: string;
    name: string;
  }>[];
  schedulingContext: null | Readonly<{
    profile: string;
    zoneCode: string;
    distanceStatus: "KNOWN" | "PENDING";
    distanceKm: number | null;
  }>;
  availability: null | Readonly<{
    date: string;
    profile: string;
    dayOccupied: number;
    dayCapacity: number;
    closed: boolean;
    saturdayApprovalRequired: boolean;
    slots: readonly Readonly<{
      key: string;
      occupied: number;
      capacity: number;
      available: boolean;
    }>[];
  }>;
  evaluatorCandidates: readonly Readonly<{
    membershipRef: string;
    profileRef: string | null;
    displayName: string;
    capabilities: readonly string[];
  }>[];
  visitFee: null | Readonly<{
    feeRef: string;
    disposition: string;
    suggestedAmount: number | null;
    currency: string | null;
    communicationStatus: string;
    approvalStatus: string;
    paymentStatus: string;
    version: number;
  }>;
  communications: readonly Readonly<{
    communicationRef: string;
    templateCode: string;
    templateVersion: number;
    audience: string;
    channel: string;
    status: string;
    preparedAt: string;
  }>[];
  history: readonly Readonly<{
    eventRef: string;
    type: string;
    reasonCode: string | null;
    notificationRequired: boolean;
    createdAt: string;
  }>[];
  publication: null | Readonly<{
    publicationRef: string;
    publishedAt: string;
    evaluatorDisplayName: string;
    totals: Record<string, unknown>;
    needs: { flaggedItems: number };
    access: readonly unknown[];
  }>;
}>;
