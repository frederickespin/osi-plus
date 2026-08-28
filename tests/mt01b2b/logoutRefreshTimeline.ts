export type LogoutTimelineKind =
  | "LOGOUT_INTENT"
  | "BROADCAST_LOGOUT_SENT"
  | "BROADCAST_LOGOUT_RECEIVED"
  | "REFRESH_STARTED"
  | "REFRESH_OBSERVED"
  | "REFRESH_ABORTED"
  | "REFRESH_REJECTED"
  | "REFRESH_RESOLVED"
  | "COOKIE_PRESENT"
  | "TOKEN_PRESENT"
  | "SESSION_AUTHENTICATED"
  | "SESSION_LOGGED_OUT";

export type LogoutTimelineEvent = {
  sequence: number;
  atMs: number;
  tabId: string;
  kind: LogoutTimelineKind;
  requestId?: string;
  errorName?: string;
  status?: number;
  tokenPresent?: boolean;
};

export type RefreshClassification =
  | "STARTED_BEFORE_LOGOUT"
  | "STARTED_AFTER_LOGOUT_INTENT"
  | "OBSERVED_AFTER_LOGOUT";

export type ClassifiedRefresh = {
  requestId: string;
  tabId: string;
  classification: RefreshClassification;
  startedAtMs: number;
  observedAtMs: number | null;
  aborted: boolean;
  rejectedWithAbortError: boolean;
  resolved: boolean;
  tokenPresent: boolean;
};

export type FinalTabState = {
  tabId: string;
  state: string | null;
  authenticated: boolean;
  cookieCount: number;
  resources: { activities: number; channels: number; coordinators: number; timers: number };
};

function roundedMonotonic(value: number): number {
  return Number(value.toFixed(3));
}

export function classifyRefreshes(events: readonly LogoutTimelineEvent[]): ClassifiedRefresh[] {
  const logoutIntentAt = events.find((event) => event.kind === "LOGOUT_INTENT")?.atMs ?? Number.POSITIVE_INFINITY;
  return events
    .filter((event) => event.kind === "REFRESH_STARTED" && typeof event.requestId === "string")
    .map((started) => {
      const related = events.filter((event) => event.requestId === started.requestId && event.tabId === started.tabId);
      const observed = related.find((event) => event.kind === "REFRESH_OBSERVED");
      const rejected = related.find((event) => event.kind === "REFRESH_REJECTED");
      const resolved = related.find((event) => event.kind === "REFRESH_RESOLVED");
      const classification: RefreshClassification = started.atMs >= logoutIntentAt
        ? "STARTED_AFTER_LOGOUT_INTENT"
        : observed && observed.atMs >= logoutIntentAt
          ? "OBSERVED_AFTER_LOGOUT"
          : "STARTED_BEFORE_LOGOUT";
      return {
        requestId: started.requestId!,
        tabId: started.tabId,
        classification,
        startedAtMs: started.atMs,
        observedAtMs: observed?.atMs ?? null,
        aborted: related.some((event) => event.kind === "REFRESH_ABORTED"),
        rejectedWithAbortError: rejected?.errorName === "AbortError",
        resolved: Boolean(resolved),
        tokenPresent: resolved?.tokenPresent === true,
      };
    });
}

export function validateLogoutTimeline(
  events: readonly LogoutTimelineEvent[],
  tabs: readonly FinalTabState[],
): string[] {
  const violations: string[] = [];
  const intent = events.find((event) => event.kind === "LOGOUT_INTENT");
  if (!intent) violations.push("LOGOUT_INTENT_MISSING");

  for (const refresh of classifyRefreshes(events)) {
    if (refresh.classification === "STARTED_AFTER_LOGOUT_INTENT") {
      violations.push("REFRESH_STARTED_AFTER_LOGOUT");
      continue;
    }
    if (!refresh.aborted) violations.push("PRE_LOGOUT_REFRESH_NOT_ABORTED");
    if (!refresh.rejectedWithAbortError) violations.push("PRE_LOGOUT_REFRESH_NOT_REJECTED_WITH_ABORT_ERROR");
    if (refresh.resolved || refresh.tokenPresent) violations.push("PRE_LOGOUT_REFRESH_RESULT_DELIVERED");
  }

  const afterIntent = intent
    ? events.filter((event) => event.atMs >= intent.atMs)
    : events;
  if (afterIntent.some((event) => event.kind === "COOKIE_PRESENT" || event.kind === "TOKEN_PRESENT")) {
    violations.push("CREDENTIAL_EMITTED_AFTER_LOGOUT");
  }
  if (afterIntent.some((event) => event.kind === "SESSION_AUTHENTICATED")) {
    violations.push("SESSION_RESTORED_AFTER_LOGOUT");
  }

  const sentLogout = events.some((event) => event.kind === "BROADCAST_LOGOUT_SENT");
  for (const tab of tabs) {
    if (tab.state !== "LOGGED_OUT" || tab.authenticated) violations.push(`TAB_NOT_LOGGED_OUT:${tab.tabId}`);
    if (tab.cookieCount !== 0) violations.push(`TAB_COOKIE_PRESENT:${tab.tabId}`);
    if (Object.values(tab.resources).some((count) => count !== 0)) violations.push(`TAB_RESOURCE_LEAK:${tab.tabId}`);
    if (tabs.length > 1 && sentLogout && tab.tabId !== intent?.tabId
      && !events.some((event) => event.kind === "BROADCAST_LOGOUT_RECEIVED" && event.tabId === tab.tabId)) {
      violations.push(`TAB_IGNORED_LOGOUT_BROADCAST:${tab.tabId}`);
    }
  }
  return [...new Set(violations)].sort();
}

export function sanitizeLogoutTimeline(events: readonly LogoutTimelineEvent[]): LogoutTimelineEvent[] {
  return events.map((event) => ({
    sequence: event.sequence,
    atMs: roundedMonotonic(event.atMs),
    tabId: event.tabId.replace(/[^a-z0-9-]/gi, "-").slice(0, 64),
    kind: event.kind,
    ...(event.requestId ? { requestId: event.requestId.replace(/[^a-z0-9-]/gi, "-").slice(0, 64) } : {}),
    ...(event.errorName ? { errorName: event.errorName.slice(0, 40) } : {}),
    ...(typeof event.status === "number" ? { status: event.status } : {}),
    ...(typeof event.tokenPresent === "boolean" ? { tokenPresent: event.tokenPresent } : {}),
  }));
}
