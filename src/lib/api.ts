import { loadSession, normalizeRole } from "@/lib/sessionStore";
import type { PstTemplateContent } from "@/lib/templateSchemas";
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export type HealthResponse = {
  ok: boolean;
  service: string;
  status: string;
  timestamp: string;
};

export type AppInfoResponse = {
  ok: boolean;
  app: string;
  environment: string;
  region: string;
  commit: string | null;
  branch: string | null;
  timestamp: string;
};

export type UserDto = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  department?: string | null;
  joinDate: string;
  points: number;
  rating: number;
};

export type ClientDto = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  type: string;
  status: string;
  totalServices: number;
  lastService?: string | null;
  createdAt: string;
};

export type ProjectDto = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  quoteId?: string | null;
  leadId?: string | null;
  pstCode?: string | null;
  pstServiceName?: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  osiCount: number;
  totalValue: number;
  assignedTo?: string | null;
  notes?: string | null;
};

export type OsiDto = {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  clientId: string;
  clientName: string;
  kind?: "EXTERNAL" | "INTERNAL";
  status: string;
  type: string;
  origin: string;
  destination: string;
  scheduledDate: string;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  supervisorId?: string | null;
  driverId?: string | null;
  pstCode?: string | null;
  pstTemplateVersionId?: string | null;
  ptfCode?: string | null;
  petCode?: string | null;
  ptfMaterialPlan?: unknown;
  petPlan?: unknown;
  ptfEditedManually?: boolean;
  petEditedManually?: boolean;
  custodyStatus?: "DRIVER" | "SUPERVISOR";
  custodyTransferredAt?: string | null;
  driverAvailable?: boolean;
  vehicleAvailable?: boolean;
  lastMaterialDeviation?: Record<string, number> | null;
  startedAt?: string | null;
  endedAt?: string | null;
  npsScore?: number | null;
  supervisorNotes?: string | null;
  ecoPoints?: number | null;
  createdAt: string;
  assignedTo?: string | null;
  team: string[];
  vehicles: string[];
  value: number;
  notes?: string | null;
};

export type OsiChangeLogDto = {
  id: string;
  osiId: string;
  actorUserId?: string | null;
  actorRole: string;
  action: string;
  fieldPath?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null;
  createdAt: string;
};

export type OsiHandshakeDto = {
  id: string;
  osiId: string;
  status: "PENDING" | "COMPLETED" | "REJECTED";
  fromRole: string;
  fromUserId?: string | null;
  toRole: string;
  toUserId?: string | null;
  type: string;
  timestamp: string;
  completedAt?: string | null;
  notes?: string | null;
  payloadJson?: unknown;
  createdAt: string;
};

export type OsiMaterialReturnDto = {
  id: string;
  osiId: string;
  pstCode?: string | null;
  ptfCode?: string | null;
  dispatchedJson: unknown;
  returnedJson: unknown;
  deviationJson: Record<string, number>;
  recordedById?: string | null;
  recordedByRole?: string | null;
  recordedAt: string;
  createdAt: string;
};

export type PtfAdjustmentSuggestionDto = {
  id: string;
  pstCode: string;
  ptfCode?: string | null;
  status: "PENDING" | "APPLIED" | "IGNORED" | "ESCALATED";
  basedOnOsiIds: string[];
  occurrences: number;
  recommendedDelta: Record<string, number>;
  reason?: string | null;
  ignoredCount: number;
  lastIgnoredAt?: string | null;
  lastActionById?: string | null;
  createdAt: string;
  updatedAt: string;
  escalations?: EscalationEventDto[];
};

export type EscalationEventDto = {
  id: string;
  type: string;
  message: string;
  targetRoles: string[];
  suggestionId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  metadataJson?: unknown;
};

export type ApiListResponse<T> = { ok: boolean; total: number; data: T[] };

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // MVP: el frontend trabaja con session en localStorage. Enviamos rol/usuario como headers.
  // Cuando integremos login real, esto debe migrar a Authorization: Bearer.
  try {
    const session = loadSession();
    const normalizedRole = normalizeRole(session.role);
    if (normalizedRole) headers["x-osi-role"] = normalizedRole;

    // Mantener compatibilidad con sesiones antiguas donde userId solo existe en storage crudo.
    const raw = JSON.parse(localStorage.getItem("osi-plus.session") || "null") as { userId?: string } | null;
    const userId = session.userId || raw?.userId;
    if (userId) headers["x-osi-userid"] = String(userId);
  } catch {}

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      try {
        body = await response.text();
      } catch {
        body = null;
      }
    }

    const err: any = new Error(`API ${response.status}: ${(body as any)?.error || response.statusText || "Request failed"}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return response.json() as Promise<T>;
}

export function getHealth() {
  return requestJson<HealthResponse>("/health");
}

export function getAppInfo() {
  return requestJson<AppInfoResponse>("/info");
}

export function login(email: string, password: string) {
  return requestJson<{ ok: boolean; token: string; user: UserDto }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function getMe(token: string) {
  return requestJson<{ ok: boolean; user: UserDto }>("/auth/me", { token });
}

export async function getUsers(query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<ApiListResponse<UserDto>>(`/users${suffix}`);
}

export async function createUser(payload: Partial<UserDto> & { password?: string }) {
  return requestJson<{ ok: boolean; data: UserDto }>("/users", {
    method: "POST",
    body: payload,
  });
}

export async function getClients(query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<ApiListResponse<ClientDto>>(`/clients${suffix}`);
}

export async function createClient(payload: Partial<ClientDto>) {
  return requestJson<{ ok: boolean; data: ClientDto }>("/clients", {
    method: "POST",
    body: payload,
  });
}

export async function getProjects(query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<ApiListResponse<ProjectDto>>(`/projects${suffix}`);
}

export async function createProject(payload: Partial<ProjectDto>) {
  return requestJson<{ ok: boolean; data: ProjectDto }>("/projects", {
    method: "POST",
    body: payload,
  });
}

export async function getOsis(query = "", status = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<ApiListResponse<OsiDto>>(`/osis${suffix}`);
}

export async function createOsi(payload: Partial<OsiDto>) {
  return requestJson<{ ok: boolean; data: OsiDto }>("/osis", {
    method: "POST",
    body: payload,
  });
}

export async function getOsiById(osiId: string) {
  return requestJson<{
    ok: boolean;
    data: OsiDto & {
      changeLogs: OsiChangeLogDto[];
      handshakes: OsiHandshakeDto[];
      materialReturns: OsiMaterialReturnDto[];
    };
  }>(`/osis/${encodeURIComponent(osiId)}`);
}

export async function updateOsi(osiId: string, payload: Partial<OsiDto> & { changeReason?: string; applySuggestedPtfPet?: boolean }) {
  return requestJson<{ ok: boolean; data: OsiDto; meta?: { changes: number } }>(`/osis/${encodeURIComponent(osiId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function registerOsiHandshake(
  osiId: string,
  payload: { supervisorId: string; driverId: string; timestamp?: string; notes?: string }
) {
  return requestJson<{ ok: boolean; data: { handshake: OsiHandshakeDto; osi: OsiDto } }>(
    `/osis/${encodeURIComponent(osiId)}/handshake`,
    {
      method: "POST",
      body: payload,
    }
  );
}

export async function registerOsiMaterialReturn(
  osiId: string,
  payload: {
    pstCode?: string;
    ptfCode?: string;
    dispatched: Array<{ code: string; qty: number; unit?: string }>;
    returned: Array<{ code: string; qty: number; unit?: string }>;
    recordedAt?: string;
  }
) {
  return requestJson<{
    ok: boolean;
    data: {
      materialReturn: OsiMaterialReturnDto;
      deviation: Record<string, number>;
      deviationSummary: string;
      osi: OsiDto;
      suggestion: PtfAdjustmentSuggestionDto | null;
    };
    meta: { hasDeviation: boolean; deviationCount: number };
  }>(`/osis/${encodeURIComponent(osiId)}/return`, {
    method: "POST",
    body: payload,
  });
}

export async function listPtfSuggestions(params?: { pstCode?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.pstCode) qs.set("pstCode", params.pstCode);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: boolean; total: number; data: PtfAdjustmentSuggestionDto[] }>(`/ptf/suggestions${suffix}`);
}

export async function recomputePtfSuggestions(payload?: { pstCode?: string }) {
  return requestJson<{ ok: boolean; total: number; data: PtfAdjustmentSuggestionDto[] }>(`/ptf/suggestions/recompute`, {
    method: "POST",
    body: payload || {},
  });
}

export async function actionPtfSuggestion(payload: { suggestionId: string; action: "APPLY" | "IGNORE"; note?: string }) {
  return requestJson<{
    ok: boolean;
    data: PtfAdjustmentSuggestionDto;
    escalation?: EscalationEventDto | null;
  }>(`/ptf/suggestions/action`, {
    method: "POST",
    body: payload,
  });
}

// ====================
// Templates (PIC/PGD/NPS/PST) - Centro de Plantillas
// ====================

export type TemplateType = "PIC" | "PGD" | "NPS" | "PST";
export type TemplateVersionStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "REJECTED" | "ARCHIVED";

export type TemplateDto = {
  id: string;
  type: TemplateType;
  name: string;
  scope: "GLOBAL" | "TENANT";
  tenantId: string | null;
  isActive: boolean;
  publishedVersionId: string | null;
  versions?: Array<{ id: string; version: number; status: TemplateVersionStatus; updatedAt: string }>;
  publishedVersion?: { id: string; version: number; status: TemplateVersionStatus; publishedAt: string | null } | null;
  updatedAt: string;
};

export type TemplateVersionDto = {
  id: string;
  templateId: string;
  version: number;
  status: TemplateVersionStatus;
  contentJson: unknown | null;
  contentHtml: string | null;
  changeSummary: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template?: TemplateDto;
  createdBy?: { id: string; name: string; email: string };
};

export function listTemplates(type?: TemplateType, tenantId?: string | null) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (tenantId) params.set("tenantId", tenantId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: boolean; total: number; data: TemplateDto[] }>(`/templates/list${qs}`);
}

export function listPendingTemplateApprovals(tenantId?: string | null) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: boolean; total: number; data: TemplateVersionDto[] }>(`/templates/pending${qs}`);
}

export function getTemplateVersion(versionId: string) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/version?id=${encodeURIComponent(versionId)}`);
}

export function upsertTemplateDraft(input: {
  templateType: TemplateType;
  templateName: string;
  tenantId: string | null;
  versionId?: string;
  contentJson?: unknown;
  contentHtml?: string;
  changeSummary?: string;
}) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/draft`, { method: "POST", body: input });
}

export function submitTemplateForApproval(versionId: string) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/submit`, { method: "POST", body: { versionId } });
}

export function approveTemplateVersion(versionId: string) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/approve`, { method: "POST", body: { versionId } });
}

export function approveTemplateBatch(versionIds: string[]) {
  return requestJson<{ ok: boolean; data: { count: number } }>(`/templates/approve-batch`, { method: "POST", body: { versionIds } });
}

export function rejectTemplateVersion(versionId: string, reason: string) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/reject`, { method: "POST", body: { versionId, reason } });
}

export function publishTemplateVersion(versionId: string) {
  return requestJson<{ ok: boolean; data: TemplateVersionDto }>(`/templates/publish`, { method: "POST", body: { versionId } });
}

export type PstActiveTemplateDto = {
  templateId: string;
  templateName: string;
  serviceCode: string;
  serviceName: string;
  versionId: string;
  version: number;
  status: TemplateVersionStatus;
  publishedAt?: string | null;
  content: PstTemplateContent;
};

export type PstTemplateDetailDto = PstActiveTemplateDto & {
  linkedPgd?: {
    templateId: string;
    templateName: string;
    versionId: string;
    version: number;
  } | null;
};

export function listActivePstTemplates(tenantId?: string | null) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: boolean; total: number; data: PstActiveTemplateDto[] }>(`/pst/active${qs}`);
}

export function getPstTemplateByServiceCode(serviceCode: string, tenantId?: string | null) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: boolean; data: PstTemplateDetailDto }>(`/pst/${encodeURIComponent(serviceCode)}${qs}`);
}

// ====================
// K (Coordinación) - MVP Sprint 1
// ====================

export type ProjectKState = "PENDING_VALIDATION" | "VALIDATED" | "RELEASED";
export type SignalPolicy = "HARD_BLOCK" | "SOFT_ALERT";
export type SignalKind = "PAYMENT" | "PERMITS_PARKING" | "PGD_BLOCKING_DOCS" | "CRATES" | "THIRD_PARTIES";
export type SignalColor = "GREEN" | "AMBER" | "RED";

export type ProjectSignalDto = {
  id: string;
  projectId: string;
  kind: SignalKind;
  policy: SignalPolicy;
  warnAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  ackAt: string | null;
  ackNote: string | null;
  ackById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPgdItemStatus = "MISSING" | "SUBMITTED" | "VALIDATED" | "REJECTED";
export type ProjectPgdItemDto = {
  id: string;
  projectPgdId: string;
  name: string;
  visibility: "CLIENT_VIEW" | "INTERNAL_VIEW";
  responsible: "CLIENT" | "SUPERVISOR" | "DRIVER" | "INTERNAL";
  isBlocking: boolean;
  expectedFileType: "PDF" | "PHOTO" | "SIGNATURE" | "OTHER";
  serviceTags: string[];
  status: ProjectPgdItemStatus;
  validatedAt: string | null;
  validatedById: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPgdDto = {
  id: string;
  projectId: string;
  templateId: string;
  templateVersionId: string;
  appliedAt: string;
  appliedById: string | null;
  items: ProjectPgdItemDto[];
  template?: { id: string; name: string; type: TemplateType } | null;
  templateVersion?: { id: string; version: number; status: TemplateVersionStatus } | null;
};

export type KSemaphores = {
  payment: SignalColor;
  permits: SignalColor;
  pgd: SignalColor;
  crates: SignalColor;
  thirdParties: SignalColor;
  pgdSummary?: { applied: boolean; blockingTotal: number; blockingValidated: number; blockingMissing: number };
};

export type KDashboardProjectDto = ProjectDto & {
  kState: ProjectKState;
  kValidatedAt?: string | null;
  kReleasedAt?: string | null;
  semaphores: KSemaphores;
};

export function getKDashboard() {
  return requestJson<{ ok: boolean; counts: { total: number; byKState: Record<string, number> }; data: KDashboardProjectDto[] }>(
    "/k/dashboard",
  );
}

export function getKProject(projectId: string) {
  return requestJson<{
    ok: boolean;
    data: {
      project: ProjectDto & {
        kState: ProjectKState;
        kValidatedAt?: string | null;
        kReleasedAt?: string | null;
        signals: ProjectSignalDto[];
        pgd: ProjectPgdDto | null;
      };
      semaphores: KSemaphores;
    };
  }>(`/k/project?id=${encodeURIComponent(projectId)}`);
}

export function updateProjectSignal(payload: { signalId: string; done?: boolean; ack?: boolean; ackNote?: string }) {
  return requestJson<{ ok: boolean; data: ProjectSignalDto }>("/k/signal", { method: "POST", body: payload });
}

export function applyProjectPgd(payload: { projectId: string; templateId: string }) {
  return requestJson<{ ok: boolean; data: ProjectPgdDto }>("/k/pgd/apply", { method: "POST", body: payload });
}

export function setProjectValidated(projectId: string) {
  return requestJson<{ ok: boolean; data: ProjectDto & { kState: ProjectKState } }>("/k/project-validate", {
    method: "POST",
    body: { projectId },
  });
}

export function setProjectReleased(projectId: string) {
  return requestJson<{ ok: boolean; data: ProjectDto & { kState: ProjectKState } }>("/k/project-release", {
    method: "POST",
    body: { projectId },
  });
}

export function setProjectPgdItemStatus(payload: { itemId: string; status: ProjectPgdItemStatus; note?: string }) {
  return requestJson<{ ok: boolean; data: ProjectPgdItemDto }>("/k/pgd/item", { method: "POST", body: payload });
}
