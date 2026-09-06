import type { SchedulingWorkspace } from "./schedulingTypes";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") { const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`; }
  return JSON.stringify(value);
}
async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function privateJson<T>(authorization: string | undefined, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer", headers: { Authorization: `Bearer ${authorization || ""}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const type = response.headers.get("content-type") || "";
  const cache = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  if (!type.toLowerCase().includes("application/json") || !cache.toLowerCase().includes("no-store") || !/authorization/i.test(vary) || !/origin/i.test(vary)) throw new Error("CRM_SURVEY_PRIVATE_CONTRACT_INVALID");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "CRM_SURVEY_SCHEDULING_REQUEST_FAILED"), { status: response.status, code: body.error });
  return body.data as T;
}
export function createSurveySchedulingApi(authorization?: string) {
  const mutate = async <T>(operation: string, payload: Record<string, unknown>) => {
    const requestId = crypto.randomUUID();
    const command = { operation, requestId, ...payload };
    return privateJson<T>(authorization, "/api/crm/survey/scheduling", { method: "POST", body: JSON.stringify({ ...command, payloadHash: await sha256(command) }) });
  };
  return Object.freeze({
    workspace: (caseRef: string, date?: string) => privateJson<SchedulingWorkspace>(authorization, `/api/crm/survey/scheduling?caseRef=${encodeURIComponent(caseRef)}${date ? `&date=${encodeURIComponent(date)}` : ""}`),
    decide: (payload: Record<string, unknown>) => mutate("DECIDE_METHOD", payload),
    schedule: (payload: Record<string, unknown>) => mutate("SCHEDULE", payload),
    reschedule: (payload: Record<string, unknown>) => mutate("RESCHEDULE", payload),
    cancel: (payload: Record<string, unknown>) => mutate("CANCEL", payload),
    changeEvaluator: (payload: Record<string, unknown>) => mutate("CHANGE_EVALUATOR", payload),
    updateVisitFee: (payload: Record<string, unknown>) => mutate("UPDATE_VISIT_FEE", payload),
    prepareCommunication: async (payload: Record<string, unknown>) => mutate("PREPARE_COMMUNICATION", { ...payload, contentHash: await sha256(payload) }),
  });
}
