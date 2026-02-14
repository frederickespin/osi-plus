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

