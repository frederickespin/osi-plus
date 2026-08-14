export type EvaluatorSurveyMethod = "PRESENTIAL" | "VIRTUAL_VIDEO";

export type SurveyCaptureChannel =
  | "EVALUATOR_PRESENTIAL"
  | "EVALUATOR_VIRTUAL"
  | "WRITTEN_REPORT"
  | "MINI_SURVEY";

export type VerificationLevel = "HIGH" | "MEDIUM" | "LOW";

export type EvaluatorVisitStatus =
  | "ASSIGNED"
  | "EN_ROUTE"
  | "ON_SITE"
  | "DRAFT"
  | "SUBMITTED";

export type EvaluatorSyncStatus = "LOCAL_DRAFT" | "SYNC_PENDING" | "SYNCED";
export type EvaluatorAccessType = "ELEVATOR" | "STAIRS" | "BOTH";
export type InventoryWeightSource = "CATALOG" | "DENSITY" | "MANUAL";
export type InventoryShipmentMode = "AIR" | "SEA" | "LOCAL" | "STORAGE";
export type StairCarryScope = "NONE" | "FULL_MOVE" | "SELECTED_ITEMS";
export type ItemAccessHandling = "STANDARD" | "STAIRS" | "ROPE" | "CRANE";
export type CapturedPhoto = {
  id: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  capturedAt: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

export type AccessConditions = {
  propertyType: string;
  floorLevel: string;
  originAddress: string;
  destinationAddress: string;
  originResidenceType: string;
  destinationResidenceType: string;
  originFloorLevel: string;
  destinationFloorLevel: string;
  originAccessType?: EvaluatorAccessType;
  destinationAccessType?: EvaluatorAccessType;
  originElevatorAvailable?: boolean;
  destinationElevatorAvailable?: boolean;
  elevatorAvailable: boolean;
  stairs: boolean;
  stairsFloors?: number;
  stairCarryScope?: StairCarryScope;
  /** @deprecated Conservado para compatibilidad con borradores anteriores. */
  stairsDistanceMeters: number;
  longCarryMeters: number;
  longCarryNotes: string;
  stairsNotes: string;
  additionalStopRequired: boolean;
  additionalStopNotes: string;
  parkingRestrictions: string;
  accessNotes: string;
  photos: CapturedPhoto[];
};

export type InventoryItem = {
  id: string;
  catalogArticleId?: string;
  roomName: string;
  itemName: string;
  quantity: number;
  estimatedVolumeM3: number;
  estimatedWeightKg: number;
  catalogWeightKg?: number;
  calculatedWeightKg?: number;
  weightSource: InventoryWeightSource;
  shipmentMode: InventoryShipmentMode;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  needsCrating: boolean;
  fragile: boolean;
  needsAssembly: boolean;
  needsDisassembly: boolean;
  accessHandling?: ItemAccessHandling;
  accessHandlingQuantity?: number;
  accessFloors?: number;
  highValue: boolean;
  declaredValue?: number;
  suggestedPackingMaterial?: string;
  notes: string;
  photos: CapturedPhoto[];
};

export type CratingItem = {
  id: string;
  roomName?: string;
  itemName: string;
  quantity: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  notes: string;
};

export type PackingMaterial = {
  id: string;
  materialName: string;
  quantity: number;
  notes: string;
};

export type PermitRequirement = {
  id: string;
  permitType: string;
  required: boolean;
  quantity?: number;
  distanceMeters?: number;
  optionType?: string;
  notes: string;
};

export type ThirdPartyRequirement = {
  id: string;
  serviceName: string;
  required: boolean;
  quantity?: number;
  distanceMeters?: number;
  optionType?: string;
  notes: string;
};

export type ScopeVolumeSummary = {
  estimatedTotalVolumeM3: number;
  estimatedTotalWeightKg: number;
  estimatedVolumetricWeightKg: number;
};

export type AllowanceSnapshot = {
  volumeM3?: number;
  weightKg?: number;
};

export type AllowanceVarianceAlert = {
  code: "ALLOWANCE_VOLUME_EXCEEDED" | "ALLOWANCE_WEIGHT_EXCEEDED";
  message: string;
  severity: "warning";
};

export type EvaluatorVisitOutput = {
  visitId: string;
  caseId: string;
  caseCode: string;
  surveyMethod: EvaluatorSurveyMethod;
  captureChannel: SurveyCaptureChannel;
  verificationLevel: VerificationLevel;
  inventoryItems: InventoryItem[];
  cratingItems: CratingItem[];
  scopeVolumeSummary: ScopeVolumeSummary;
  packingMaterials: PackingMaterial[];
  permitRequirements: PermitRequirement[];
  thirdPartyRequirements: ThirdPartyRequirement[];
  accessConditions: AccessConditions;
  surveyObservations: string;
  allowanceVarianceAlerts: AllowanceVarianceAlert[];
  generatedAt: string;
};

export type EvaluatorSubmissionReceipt = {
  serverReportId: string;
  externalVisitId: string;
  caseId: string;
  caseCode: string;
  status: "SUBMITTED";
  payloadHash: string;
  itemCount: number;
  pieceCount: number;
  photoCount: number;
  revision: number;
  serverReceivedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluatorVisitTask = {
  visitId: string;
  caseId: string;
  caseCode: string;
  clientName: string;
  customerTypeLabel?: string;
  serviceType: string;
  mode: string;
  modeLabel?: string;
  surveyMethod: EvaluatorSurveyMethod;
  captureChannel: SurveyCaptureChannel;
  verificationLevel: VerificationLevel;
  scheduledDate: string;
  scheduledTimeLabel: string;
  originAddress: string;
  originResidenceType?: string;
  originFloorLevel?: string;
  originAccessType?: EvaluatorAccessType;
  originCountryName?: string;
  originCity?: string;
  destinationAddress?: string;
  destinationResidenceType?: string;
  destinationFloorLevel?: string;
  destinationAccessType?: EvaluatorAccessType;
  destinationCountryName?: string;
  destinationCity?: string;
  linkageName?: string;
  picName: string;
  picPhone: string;
  evaluatorNote?: string;
  surveyorName: string;
  status: EvaluatorVisitStatus;
  syncStatus: EvaluatorSyncStatus;
  serverReceipt?: EvaluatorSubmissionReceipt;
  lastSyncError?: string;
  allowanceSnapshot?: AllowanceSnapshot;
};

export type EvaluatorVisitDraft = {
  status: EvaluatorVisitStatus;
  syncStatus: EvaluatorSyncStatus;
  startedAt?: string;
  completedAt?: string;
  accessConditions: AccessConditions;
  inventoryItems: InventoryItem[];
  cratingItems: CratingItem[];
  packingMaterials: PackingMaterial[];
  permitRequirements: PermitRequirement[];
  thirdPartyRequirements: ThirdPartyRequirement[];
  scopeVolumeSummary: ScopeVolumeSummary;
  surveyObservations: string;
  serverReceipt?: EvaluatorSubmissionReceipt;
  lastSyncError?: string;
};

function buildId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createInventoryItem(seed?: Partial<InventoryItem>): InventoryItem {
  return {
    id: buildId("inv"),
    roomName: "Sala",
    itemName: "",
    quantity: 1,
    estimatedVolumeM3: 0,
    estimatedWeightKg: 0,
    catalogWeightKg: undefined,
    calculatedWeightKg: undefined,
    weightSource: "DENSITY",
    shipmentMode: "LOCAL",
    lengthCm: undefined,
    widthCm: undefined,
    heightCm: undefined,
    needsCrating: false,
    fragile: false,
    needsAssembly: false,
    needsDisassembly: false,
    accessHandling: "STANDARD",
    accessHandlingQuantity: 1,
    accessFloors: 0,
    highValue: false,
    declaredValue: undefined,
    suggestedPackingMaterial: "",
    notes: "",
    photos: [],
    ...seed,
  };
}

export function createCratingItem(): CratingItem {
  return {
    id: buildId("crate"),
    itemName: "",
    quantity: 1,
    notes: "",
  };
}

export function createPackingMaterial(materialName = ""): PackingMaterial {
  return {
    id: buildId("pack"),
    materialName,
    quantity: 0,
    notes: "",
  };
}

export function createPermitRequirement(permitType = "Permiso de estacionamiento"): PermitRequirement {
  return {
    id: buildId("permit"),
    permitType,
    required: false,
    quantity: 0,
    distanceMeters: 0,
    optionType: "",
    notes: "",
  };
}

export function createThirdPartyRequirement(serviceName = "Uso de grúa"): ThirdPartyRequirement {
  return {
    id: buildId("third"),
    serviceName,
    required: false,
    quantity: 0,
    distanceMeters: 0,
    optionType: "",
    notes: "",
  };
}

export function createEmptyEvaluatorVisitDraft(task: EvaluatorVisitTask): EvaluatorVisitDraft {
  const originElevatorAvailable =
    task.originAccessType === "ELEVATOR" || task.originAccessType === "BOTH";
  const destinationElevatorAvailable =
    task.destinationAccessType === "ELEVATOR" || task.destinationAccessType === "BOTH";
  const stairs =
    task.originAccessType === "STAIRS" ||
    task.originAccessType === "BOTH" ||
    task.destinationAccessType === "STAIRS" ||
    task.destinationAccessType === "BOTH";
  return {
    status: task.status,
    syncStatus: task.syncStatus,
    accessConditions: {
      propertyType: "",
      floorLevel: "",
      originAddress: task.originAddress || "",
      destinationAddress: task.destinationAddress || "",
      originResidenceType: task.originResidenceType || "",
      destinationResidenceType: task.destinationResidenceType || "",
      originFloorLevel: task.originFloorLevel || "",
      destinationFloorLevel: task.destinationFloorLevel || "",
      originAccessType: task.originAccessType,
      destinationAccessType: task.destinationAccessType,
      originElevatorAvailable,
      destinationElevatorAvailable,
      elevatorAvailable: originElevatorAvailable || destinationElevatorAvailable,
      stairs,
      stairsFloors: 0,
      stairCarryScope: "NONE",
      stairsDistanceMeters: 0,
      longCarryMeters: 0,
      longCarryNotes: "",
      stairsNotes: "",
      additionalStopRequired: false,
      additionalStopNotes: "",
      parkingRestrictions: "",
      accessNotes: "",
      photos: [],
    },
    inventoryItems: [createInventoryItem()],
    cratingItems: [createCratingItem()],
    packingMaterials: [createPackingMaterial("")],
    permitRequirements: [
      createPermitRequirement("Permiso de estacionamiento"),
      createPermitRequirement("Reservar Estacionamiento"),
      createPermitRequirement("Permiso de uso de elevador"),
      createPermitRequirement("Permiso de grúa"),
    ],
    thirdPartyRequirements: [
      createThirdPartyRequirement("Transbordo"),
      createThirdPartyRequirement("Desmontura de Ventanas y Verjas"),
      createThirdPartyRequirement("Levantamiento en Altura"),
      createThirdPartyRequirement("Uso de grúa"),
      createThirdPartyRequirement("Otros"),
    ],
    scopeVolumeSummary: {
      estimatedTotalVolumeM3: 0,
      estimatedTotalWeightKg: 0,
      estimatedVolumetricWeightKg: 0,
    },
    surveyObservations: "",
  };
}
