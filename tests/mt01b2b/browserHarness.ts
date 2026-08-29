import {
  BrowserActivity,
  browserClock,
  createBrowserChannel,
  createBrowserLock,
} from "../../src/auth-v2/browserSessionAdapters.ts";
import { FrontendSessionRuntime } from "../../src/auth-v2/frontendSessionRuntime.ts";
import { SessionCoordinator } from "../../src/auth-v2/sessionCoordinator.ts";
import type {
  FrontendSessionTransport,
  RefreshResponse,
  SessionFence,
  SessionSnapshot,
} from "../../src/auth-v2/sessionTypes.ts";
import type { LogoutTimelineEvent, LogoutTimelineKind } from "./logoutRefreshTimeline.ts";

type CreateOptions = {
  channelName: string;
  session: SessionFence;
  noLocks?: boolean;
  refreshPath?: string;
  tokenTtlMs?: number;
};

type ResourceCounts = {
  activities: number;
  channels: number;
  coordinators: number;
};

let coordinator: SessionCoordinator | null = null;
let activity: BrowserActivity | null = null;
let runtime: FrontendSessionRuntime | null = null;
let currentSession: SessionFence | null = null;
let tokenTtlMs = 10 * 60_000;
const resources: ResourceCounts = { activities: 0, channels: 0, coordinators: 0 };
const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
const NativeBroadcastChannel = window.BroadcastChannel;
let timelineEvents: LogoutTimelineEvent[] = [];
let timelineOrigin = 0;
let timelineSequence = 0;
let timelineTabId: string | null = null;
let timelineRefreshSequence = 0;
let trackedTimers = new Set<number>();

function recordTimeline(kind: LogoutTimelineKind, details: Partial<LogoutTimelineEvent> = {}): void {
  if (!timelineTabId) return;
  timelineEvents.push({
    sequence: ++timelineSequence,
    atMs: performance.now() - timelineOrigin,
    tabId: timelineTabId,
    kind,
    ...details,
  });
}

function beginTimeline(tabId: string): void {
  timelineEvents = [];
  timelineOrigin = performance.now();
  timelineSequence = 0;
  timelineRefreshSequence = 0;
  timelineTabId = tabId;
  trackedTimers = new Set<number>();
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    let timerId = 0;
    const wrapped: TimerHandler = typeof handler === "function"
      ? (...callbackArgs: unknown[]) => {
        trackedTimers.delete(timerId);
        return handler(...callbackArgs);
      }
      : handler;
    timerId = nativeSetTimeout(wrapped, timeout, ...args);
    trackedTimers.add(timerId);
    return timerId;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((timerId?: number) => {
    if (typeof timerId === "number") trackedTimers.delete(timerId);
    nativeClearTimeout(timerId);
  }) as typeof window.clearTimeout;

  class TimelineBroadcastChannel extends NativeBroadcastChannel {
    constructor(name: string) {
      super(name);
      super.addEventListener("message", (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (value && typeof value === "object" && (value as { type?: unknown }).type === "LOGOUT") {
          recordTimeline("BROADCAST_LOGOUT_RECEIVED");
        }
      });
    }

    override postMessage(value: unknown): void {
      if (value && typeof value === "object" && (value as { type?: unknown }).type === "LOGOUT") {
        recordTimeline("BROADCAST_LOGOUT_SENT");
      }
      super.postMessage(value);
    }
  }
  window.BroadcastChannel = TimelineBroadcastChannel;
}

function endTimeline(): void {
  window.setTimeout = nativeSetTimeout;
  window.clearTimeout = nativeClearTimeout;
  window.BroadcastChannel = NativeBroadcastChannel;
  trackedTimers.clear();
  timelineTabId = null;
}

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function makeToken(session: SessionFence, now = Date.now(), ttl = tokenTtlMs, nonce = crypto.randomUUID()): string {
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    ver: 2,
    typ: "access",
    sid: session.sessionId,
    sub: session.subject,
    tenantId: session.tenantId,
    membershipId: session.membershipId,
    role: "V",
    authorizationVersion: session.authorizationVersion,
    iat: Math.floor(now / 1_000),
    exp: Math.floor((now + ttl) / 1_000),
    jti: nonce,
  })}.signature`;
}

async function body(responseValue: Response): Promise<Record<string, unknown>> {
  try { return await responseValue.json() as Record<string, unknown>; }
  catch { return {}; }
}

function transport(path = "/__mt01b2b/refresh"): FrontendSessionTransport {
  const request = async (url: string, signal: AbortSignal, headers?: HeadersInit) => {
    const isRefresh = url === path;
    const requestId = isRefresh && timelineTabId ? `refresh-${++timelineRefreshSequence}` : null;
    const requestHeaders = new Headers(headers);
    if (requestId) {
      requestHeaders.set("X-MT01B2-Timeline-Request", requestId);
      recordTimeline("REFRESH_STARTED", { requestId });
    }
    const onAbort = () => requestId && recordTimeline("REFRESH_ABORTED", { requestId });
    signal.addEventListener("abort", onAbort, { once: true });
    let result: Response;
    try {
      result = await fetch(url, { method: "POST", credentials: "include", headers: requestHeaders, signal });
    } catch (error) {
      if (requestId) {
        recordTimeline("REFRESH_REJECTED", {
          requestId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    const value = await body(result);
    if (requestId) {
      recordTimeline("REFRESH_RESOLVED", {
        requestId,
        status: result.status,
        tokenPresent: typeof value.token === "string" && value.token.length > 0,
      });
    }
    if (!result.ok) {
      throw {
        code: value.error,
        recoverable: value.recoverable === true,
        retryAfterMs: Number(value.retryAfterMs),
        status: result.status,
      };
    }
    return value;
  };
  return {
    upgrade: async (legacyAccessToken, signal) => request(
      "/__mt01b2b/upgrade",
      signal,
      { Authorization: `Bearer ${legacyAccessToken}` },
    ) as Promise<Awaited<ReturnType<FrontendSessionTransport["upgrade"]>>>,
    refresh: async (signal) => request(path, signal) as Promise<RefreshResponse>,
    logout: async (signal) => { await request("/__mt01b2b/logout", signal); },
  };
}

function destroy(): void {
  runtime?.destroy();
  runtime = null;
  coordinator?.destroy();
  coordinator = null;
  if (activity) {
    activity.destroy();
    activity = null;
    resources.activities = Math.max(0, resources.activities - 1);
  }
  resources.channels = 0;
  resources.coordinators = 0;
  currentSession = null;
}

function create(options: CreateOptions): SessionSnapshot {
  destroy();
  currentSession = { ...options.session };
  tokenTtlMs = options.tokenTtlMs ?? 10 * 60_000;
  activity = new BrowserActivity();
  resources.activities += 1;
  const channel = createBrowserChannel(options.channelName);
  resources.channels += 1;
  coordinator = new SessionCoordinator({
    enabled: true,
    tabId: crypto.randomUUID(),
    transport: transport(options.refreshPath),
    channel,
    lock: options.noLocks ? null : createBrowserLock(),
    clock: browserClock,
    activity,
    randomNonce: () => crypto.randomUUID(),
    randomUnit: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000,
    expectedSession: currentSession,
    dispose: () => {
      activity?.destroy();
      resources.activities = Math.max(0, resources.activities - 1);
      resources.channels = Math.max(0, resources.channels - 1);
      resources.coordinators = Math.max(0, resources.coordinators - 1);
    },
    policy: { winnerWaitMs: 300, maxRetryAfterMs: 400, retryJitterMs: 10 },
  });
  resources.coordinators += 1;
  return coordinator.snapshot;
}

async function createRuntime(channelName: string): Promise<unknown> {
  destroy();
  runtime = new FrontendSessionRuntime({
    transport: transport(),
    legacyToken: () => "legacy-test-token",
    channelName,
  });
  return runtime.start();
}

function snapshot() { return coordinator?.snapshot ?? runtime?.view ?? null; }
function accessToken() { return coordinator?.getAccessToken() ?? null; }

const harness = {
  create,
  createRuntime,
  initialize: () => coordinator?.initialize() ?? Promise.resolve(null),
  refresh: () => coordinator?.refresh("EXPLICIT") ?? Promise.resolve(null),
  maintain: () => coordinator?.maintainActiveSession() ?? Promise.resolve(null),
  notifyOnline: () => coordinator?.notifyOnline() ?? Promise.resolve(null),
  logout: () => coordinator?.logout() ?? runtime?.logout() ?? Promise.resolve(),
  requestLogout: () => {
    window.dispatchEvent(new CustomEvent("mt01b2b:logout-request"));
    return pendingLogout;
  },
  reauthenticate: () => coordinator?.requireReauthentication("REVOKED"),
  destroy,
  snapshot,
  accessToken,
  resources: () => ({ ...resources }),
  timelineTimers: () => trackedTimers.size,
  beginTimeline,
  endTimeline,
  recordTimeline,
  timeline: () => timelineEvents.map((event) => ({ ...event })),
  observeRefresh: (requestId: string) => recordTimeline("REFRESH_OBSERVED", { requestId }),
  webLocks: () => Boolean((navigator as Navigator & { locks?: unknown }).locks),
  storage: async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    indexedDatabases: typeof indexedDB.databases === "function" ? await indexedDB.databases() : [],
  }),
  makeToken: (session: SessionFence, ttl?: number, nonce?: string) => makeToken(session, Date.now(), ttl, nonce),
  broadcast: (channelName: string, message: unknown) => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(message);
    channel.close();
  },
};

let pendingLogout: Promise<void> = Promise.resolve();
window.addEventListener("mt01b2b:logout-request", () => {
  pendingLogout = coordinator?.logout() ?? runtime?.logout() ?? Promise.resolve();
});

declare global {
  interface Window {
    mt01b2bHarness: typeof harness;
  }
}

window.addEventListener("pagehide", destroy, { once: true });
window.mt01b2bHarness = harness;
document.querySelector("#status")!.textContent = "ready";
