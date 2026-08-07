import { isMt01b2ClientEnabled } from "./sessionConfig.ts";
import { SessionCoordinator } from "./sessionCoordinator.ts";
import type {
  SessionActivity,
  SessionChannel,
  SessionChannelMessage,
  SessionClock,
  SessionFence,
  FrontendSessionTransport,
  SessionLock,
  SessionTransport,
} from "./sessionTypes.ts";

type BrowserLockManager = {
  request<T>(name: string, options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: unknown | null) => T | Promise<T>): Promise<T>;
};

export class BrowserActivity implements SessionActivity {
  #lastActivityAt = Date.now();
  readonly #mark = () => { this.#lastActivityAt = Date.now(); };

  constructor() {
    window.addEventListener("pointerdown", this.#mark, { passive: true });
    window.addEventListener("keydown", this.#mark, { passive: true });
    document.addEventListener("visibilitychange", this.#mark);
  }

  isOnline(): boolean { return navigator.onLine; }
  isVisible(): boolean { return document.visibilityState === "visible"; }
  lastActivityAt(): number { return this.#lastActivityAt; }

  destroy(): void {
    window.removeEventListener("pointerdown", this.#mark);
    window.removeEventListener("keydown", this.#mark);
    document.removeEventListener("visibilitychange", this.#mark);
  }
}

export const browserClock: SessionClock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) => new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const cancel = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new DOMException("Operación cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  }),
};

export function createBrowserLock(): SessionLock | null {
  const manager = (navigator as Navigator & { locks?: BrowserLockManager }).locks;
  if (!manager) return null;
  return {
    tryRun: async <T>(name: string, task: () => Promise<T>) => manager.request(
      name,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => lock ? { acquired: true as const, value: await task() } : { acquired: false as const },
    ),
  };
}

export function createBrowserChannel(name = "osi-plus:mt01b2:session"): SessionChannel {
  const channel = new BroadcastChannel(name);
  return {
    post: (message: SessionChannelMessage) => channel.postMessage(message),
    subscribe: (listener) => {
      const handler = (event: MessageEvent<unknown>) => listener(event.data);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    close: () => channel.close(),
  };
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function responseError(response: Response, body: Record<string, unknown>) {
  const rawRetry = Number(body.retryAfterMs);
  const responseCode = typeof body.code === "string" ? body.code : body.error;
  return {
    code: typeof responseCode === "string" ? responseCode.slice(0, 120) : `HTTP_${response.status}`,
    recoverable: body.recoverable === true,
    retryAfterMs: Number.isFinite(rawRetry) ? rawRetry : undefined,
    status: response.status,
  };
}

export function createFetchSessionTransport(baseUrl = "/api"): FrontendSessionTransport {
  return {
    async upgrade(legacyAccessToken, signal) {
      const response = await fetch(`${baseUrl}/auth/session/upgrade`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${legacyAccessToken}`,
        },
        signal,
      });
      const body = await responseBody(response);
      if (!response.ok) throw responseError(response, body);
      return body as unknown as Awaited<ReturnType<FrontendSessionTransport["upgrade"]>>;
    },
    async refresh(signal) {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await responseBody(response);
      if (!response.ok) throw responseError(response, body);
      return body as unknown as Awaited<ReturnType<SessionTransport["refresh"]>>;
    },
    async logout(signal) {
      const response = await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok && response.status !== 204) {
        const body = await responseBody(response);
        throw responseError(response, body);
      }
    },
  };
}

export function createInactiveBrowserSessionCoordinator(
  env: Record<string, unknown>,
  expectedSession?: SessionFence,
): {
  coordinator: SessionCoordinator;
  activity: BrowserActivity;
} {
  const activity = new BrowserActivity();
  return {
    activity,
    coordinator: new SessionCoordinator({
      enabled: isMt01b2ClientEnabled(env),
      tabId: crypto.randomUUID(),
      transport: createFetchSessionTransport(),
      channel: createBrowserChannel(),
      lock: createBrowserLock(),
      clock: browserClock,
      activity,
      randomNonce: () => crypto.randomUUID(),
      randomUnit: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000,
      expectedSession,
      dispose: () => activity.destroy(),
    }),
  };
}
