export type EvaluationMethod =
  | "IN_PERSON"
  | "VIRTUAL"
  | "CLIENT_PHOTOS_DOCUMENTS"
  | "WRITTEN_REPORT"
  | "VOXME"
  | "MINI"
  | "NONE";
export type ScheduledEvaluationMethod = Extract<EvaluationMethod, "IN_PERSON" | "VIRTUAL" | "MINI">;
export type SurveyCoordinationDraft = Readonly<{
  visitLocation: string | null;
  date: string | null;
  time: string | null;
  durationMinutes: number;
  evaluatorMembershipRef: string | null;
  visitReasonRef: string | null;
  instruction: string | null;
  approvalReason: string | null;
}>;
export type EvaluationState =
  | "NOT_REQUIRED"
  | "PENDING_METHOD"
  | "WAITING_CLIENT_INFO"
  | "READY_TO_SCHEDULE"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type SurveyTimeAvailability = Readonly<{
  date: string;
  time: string;
  durationMinutes: number;
  timezone: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  slotKey: string | null;
  requiresApproval?: boolean;
  evaluators: readonly string[];
  alternatives: readonly Readonly<{
    time: string;
    slotKey: string;
    evaluatorMembershipRefs: readonly string[];
  }>[];
  agenda: readonly Readonly<{
    evaluatorMembershipRef: string;
    scheduledStart: string;
    scheduledEnd: string | null;
    label: string;
    outsideMetro: boolean;
    returnedToMetroAt: string | null;
  }>[];
}>;
export type SchedulingWorkspace = Readonly<{
  caseRef: string;
  caseCode: string;
  routeVersion: number;
  coordinationDraft?: SurveyCoordinationDraft | null;
  coordinationRef?: string | null;
  schedulingIssue?: string | null;
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
    evaluator: { displayName: string; membershipRef?: string };
    reason: null | { reasonRef: string; code: string; name: string };
    slotKey: string;
    profile: string;
    zoneCode: string;
    status: string;
    version: number;
    returnedToMetroAt?: string | null;
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
    defaultVisitMinutes: number;
    minimumTravelBufferMinutes: number;
    virtualPreparationMinutes: number;
    canRequestException: boolean;
    precedence: readonly string[];
    windows: readonly Readonly<{
      weekday: number;
      startMinute: number;
      endMinute: number;
      method: string;
      requiresApproval: boolean;
      kind: string;
      calendarDate: string | null;
    }>[];
  }>;
  visitReasons: readonly Readonly<{
    reasonRef: string;
    code: string;
    name: string;
  }>[];
  visitLocations: readonly Readonly<{
    role: "ORIGIN" | "DESTINATION" | "ADDITIONAL";
    order: number;
    countryCode: string;
    provinceState: string | null;
    cityMunicipality: string;
    sector: string | null;
    streetAndNumber: string | null;
    buildingResidential: string | null;
    floorUnit: string | null;
    arrivalReference: string | null;
    compactAddress: string | null;
    metroZone?: "METRO" | "INTERIOR" | null;
  }>[];
  schedulingContext: null | Readonly<{
    profile: string;
    zoneType: string;
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
  timeAvailability?: SurveyTimeAvailability | null;
  evaluatorCandidates: readonly Readonly<{
    membershipRef: string;
    profileRef: string | null;
    displayName: string;
    capabilities: readonly string[];
    dailyAssigned: number;
    dailyLimit: number | null;
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
