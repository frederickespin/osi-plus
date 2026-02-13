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

export type ModuleItem = {
  id: string;
  name: string;
  area: string;
};

export type ModulesResponse = {
  ok: boolean;
  total: number;
  data: ModuleItem[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getHealth() {
  return getJson<HealthResponse>("/health");
}

export function getAppInfo() {
  return getJson<AppInfoResponse>("/info");
}

export function getModules() {
  return getJson<ModulesResponse>("/modules");
}

