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
  | "STARTED_AFTER_LOGOUT_INTENT";

export type RefreshObservation =
  | "OBSERVED_BEFORE_LOGOUT"
  | "OBSERVED_AFTER_LOGOUT";

export type ClassifiedRefresh = {
  requestId: string;
  tabId: string;
  classification: RefreshClassification | null;
  observation: RefreshObservation | null;
  causalOrderKnown: boolean;
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

function validSequence(event: LogoutTimelineEvent): boolean {
  return Number.isSafeInteger(event.sequence) && event.sequence > 0
    && Number.isFinite(event.atMs) && event.atMs >= 0;
}

function compareTimelineEvents(left: LogoutTimelineEvent, right: LogoutTimelineEvent): number {
  if (left.atMs !== right.atMs) return left.atMs - right.atMs;
  return left.sequence - right.sequence;
}

function logoutBoundaryFor(event: LogoutTimelineEvent, events: readonly LogoutTimelineEvent[]): LogoutTimelineEvent | null {
  const localIntent = events.find((candidate) => candidate.kind === "LOGOUT_INTENT" && candidate.tabId === event.tabId);
  if (localIntent) return localIntent;
  return events.find((candidate) => candidate.kind === "BROADCAST_LOGOUT_RECEIVED" && candidate.tabId === event.tabId) ?? null;
}

export function classifyRefreshes(events: readonly LogoutTimelineEvent[]): ClassifiedRefresh[] {
  return events
    .filter((event) => event.kind === "REFRESH_STARTED" && typeof event.requestId === "string")
    .map((started) => {
      const related = events.filter((event) => event.requestId === started.requestId && event.tabId === started.tabId);
      const observed = related.find((event) => event.kind === "REFRESH_OBSERVED");
      const rejected = related.find((event) => event.kind === "REFRESH_REJECTED");
      const resolved = related.find((event) => event.kind === "REFRESH_RESOLVED");
      const boundary = logoutBoundaryFor(started, events);
      const causalOrderKnown = Boolean(boundary && validSequence(started) && validSequence(boundary));
      const classification: RefreshClassification | null = !causalOrderKnown
        ? null
        : compareTimelineEvents(started, boundary!) < 0
          ? "STARTED_BEFORE_LOGOUT"
          : "STARTED_AFTER_LOGOUT_INTENT";
      const observation: RefreshObservation | null = !observed || !boundary
        || !validSequence(observed) || !validSequence(boundary)
        ? null
        : compareTimelineEvents(observed, boundary) < 0
          ? "OBSERVED_BEFORE_LOGOUT"
          : "OBSERVED_AFTER_LOGOUT";
      return {
        requestId: started.requestId!,
        tabId: started.tabId,
        classification,
        observation,
        causalOrderKnown,
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

  const invalidSequences = events.filter((event) => !validSequence(event));
  if (invalidSequences.length > 0) violations.push("INVALID_EVENT_SEQUENCE");
  const duplicatedSequences = new Set<string>();
  const seenSequences = new Set<string>();
  for (const event of events) {
    const key = `${event.tabId}:${event.sequence}`;
    if (seenSequences.has(key)) duplicatedSequences.add(key);
    seenSequences.add(key);
  }
  if (duplicatedSequences.size > 0) violations.push("DUPLICATE_EVENT_SEQUENCE");

  for (const refresh of classifyRefreshes(events)) {
    if (!refresh.causalOrderKnown) {
      violations.push(`REFRESH_CAUSAL_ORDER_INSUFFICIENT:${refresh.tabId}:${refresh.requestId}`);
      continue;
    }
    if (refresh.classification === "STARTED_AFTER_LOGOUT_INTENT") {
      violations.push("REFRESH_STARTED_AFTER_LOGOUT");
      continue;
    }
    if (!refresh.aborted) violations.push("PRE_LOGOUT_REFRESH_NOT_ABORTED");
    if (!refresh.rejectedWithAbortError) violations.push("PRE_LOGOUT_REFRESH_NOT_REJECTED_WITH_ABORT_ERROR");
    if (refresh.resolved || refresh.tokenPresent) violations.push("PRE_LOGOUT_REFRESH_RESULT_DELIVERED");
  }

  const afterIntent = intent && validSequence(intent)
    ? events.filter((event) => event.tabId === intent.tabId && validSequence(event)
      && compareTimelineEvents(event, intent) >= 0)
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
