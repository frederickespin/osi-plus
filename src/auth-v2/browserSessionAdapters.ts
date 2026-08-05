import { isMt01b2ClientEnabled } from "./sessionConfig.ts";
import { SessionCoordinator } from "./sessionCoordinator.ts";
import type {
  SessionActivity,
  SessionChannel,
  SessionChannelMessage,
  SessionClock,
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
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Operación cancelada", "AbortError"));
    }, { once: true });
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

export function createFetchSessionTransport(baseUrl = "/api"): SessionTransport {
  return {
    async refresh(signal) {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await responseBody(response);
      if (!response.ok) throw { code: body.error, recoverable: body.recoverable, retryAfterMs: body.retryAfterMs, body };
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
        throw { code: body.error, recoverable: body.recoverable, retryAfterMs: body.retryAfterMs, body };
      }
    },
  };
}

export function createInactiveBrowserSessionCoordinator(env: Record<string, unknown>): {
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
    }),
  };
}
