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
  status: string;
  type: string;
  origin: string;
  destination: string;
  scheduledDate: string;
  createdAt: string;
  assignedTo?: string | null;
  team: string[];
  vehicles: string[];
  value: number;
  notes?: string | null;
};

type ApiListResponse<T> = { ok: boolean; total: number; data: T[] };

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
    const s = JSON.parse(localStorage.getItem("osi-plus.session") || "null") as { role?: string; userId?: string } | null;
    if (s?.role) headers["x-osi-role"] = String(s.role);
    if (s?.userId) headers["x-osi-userid"] = String(s.userId);
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
    throw new Error(`API request failed: ${response.status}`);
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

// ====================
// Templates (PIC/PGD/NPS) - Centro de Plantillas
// ====================

export type TemplateType = "PIC" | "PGD" | "NPS";
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
