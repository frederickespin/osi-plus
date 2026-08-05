import { getToken } from "../lib/sessionStore";
import {
  BrowserActivity,
  browserClock,
  createBrowserChannel,
  createBrowserLock,
  createFetchSessionTransport,
} from "./browserSessionAdapters.ts";
import { DEFAULT_SESSION_COORDINATOR_POLICY } from "./sessionConfig.ts";
import { SessionCoordinator } from "./sessionCoordinator.ts";
import type {
  FrontendSessionTransport,
  SessionSnapshot,
  UpgradeResponse,
} from "./sessionTypes.ts";

export type FrontendAuthView = {
  mode: "LEGACY" | "V2";
  state: SessionSnapshot["state"];
  reason: SessionSnapshot["reason"];
  authenticated: boolean;
  tenantId: string | null;
  membershipId: string | null;
  role: string | null;
  authorizationVersion: number | null;
  expiresAt: number | null;
};

export type FrontendRuntimeOptions = {
  transport?: FrontendSessionTransport;
  legacyToken?: () => string | null;
  channelName?: string;
  now?: () => number;
};

type Listener = (view: FrontendAuthView) => void;

const LEGACY_VIEW: FrontendAuthView = Object.freeze({
  mode: "LEGACY",
  state: "LEGACY",
  reason: "BOOTSTRAP",
  authenticated: false,
  tenantId: null,
  membershipId: null,
  role: null,
  authorizationVersion: null,
  expiresAt: null,
});

function safeCode(error: unknown): string {
  if (!error || typeof error !== "object") return "MT01B_AUTH_UNKNOWN";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "MT01B_AUTH_UNKNOWN";
}

export class FrontendSessionRuntime {
  readonly #transport: FrontendSessionTransport;
  readonly #legacyToken: () => string | null;
  readonly #channelName: string;
  readonly #now: () => number;
  readonly #listeners = new Set<Listener>();
  #coordinator: SessionCoordinator | null = null;
  #activity: BrowserActivity | null = null;
  #unsubscribeCoordinator: (() => void) | null = null;
  #refreshTimer: number | null = null;
  #operationController: AbortController | null = null;
  #generation = 0;
  #destroyed = false;
  #identity: UpgradeResponse["session"] | null = null;
  #view: FrontendAuthView = LEGACY_VIEW;

  constructor(options: FrontendRuntimeOptions = {}) {
    this.#transport = options.transport ?? createFetchSessionTransport();
    this.#legacyToken = options.legacyToken ?? getToken;
    this.#channelName = options.channelName ?? "osi-plus:mt01b2:session";
    this.#now = options.now ?? (() => Date.now());
  }

  get view(): FrontendAuthView {
    return { ...this.#view };
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.view);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<FrontendAuthView> {
    return this.#upgradeFromLegacy();
  }

  async legacyLoginCompleted(): Promise<FrontendAuthView> {
    this.#resetCoordinator();
    return this.#upgradeFromLegacy();
  }

  async logout(): Promise<void> {
    const coordinator = this.#coordinator;
    ++this.#generation;
    this.#operationController?.abort();
    this.#clearRefreshTimer();
    if (coordinator) await coordinator.logout();
    this.#resetCoordinator();
    this.#setView({ ...LEGACY_VIEW, state: "LOGGED_OUT", reason: "LOGOUT" });
  }

  requireReauthentication(): void {
    this.#coordinator?.requireReauthentication("REVOKED");
    this.#syncFromCoordinator();
  }

  async authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = this.#coordinator?.getAccessToken();
    if (!token) throw Object.assign(new Error("Sesión V2 no disponible."), { code: "MT01B2_SESSION_UNAVAILABLE" });
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    ++this.#generation;
    this.#operationController?.abort();
    this.#resetCoordinator();
    this.#listeners.clear();
  }

  async #upgradeFromLegacy(): Promise<FrontendAuthView> {
    if (this.#destroyed) return this.view;
    const token = this.#legacyToken();
    if (!token) {
      this.#setView(LEGACY_VIEW);
      return this.view;
    }
    const generation = ++this.#generation;
    this.#operationController?.abort();
    const controller = new AbortController();
    this.#operationController = controller;
    try {
      const response = await this.#transport.upgrade(token, controller.signal);
      if (this.#destroyed || generation !== this.#generation) return this.view;
      this.#installCoordinator(response);
      return this.view;
    } catch (error) {
      if (controller.signal.aborted || this.#destroyed || generation !== this.#generation) return this.view;
      const code = safeCode(error);
      if (code === "MT01B_AUTH_V2_DISABLED") {
        this.#setView({ ...LEGACY_VIEW, reason: "SERVER_DISABLED" });
      } else if (code === "MT01B_AUTH_DATABASE_UNAVAILABLE" || code === "MT01B_AUTH_STATEMENT_TIMEOUT") {
        this.#setView({ ...LEGACY_VIEW, state: "OFFLINE", reason: "RECOVERABLE_ERROR" });
      } else {
        this.#setView({ ...LEGACY_VIEW, state: "REAUTH_REQUIRED", reason: "REVOKED" });
      }
      return this.view;
    } finally {
      if (this.#operationController === controller) this.#operationController = null;
    }
  }

  #installCoordinator(response: UpgradeResponse): void {
    this.#resetCoordinator();
    this.#identity = response.session;
    this.#activity = new BrowserActivity();
    this.#coordinator = new SessionCoordinator({
      enabled: true,
      tabId: crypto.randomUUID(),
      transport: this.#transport,
      channel: createBrowserChannel(this.#channelName),
      lock: createBrowserLock(),
      clock: browserClock,
      activity: this.#activity,
      randomNonce: () => crypto.randomUUID(),
      randomUnit: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000,
      dispose: () => this.#activity?.destroy(),
    });
    this.#unsubscribeCoordinator = this.#coordinator.subscribe(() => this.#syncFromCoordinator());
    this.#coordinator.establish(response);
    window.addEventListener("online", this.#handleOnline);
    document.addEventListener("visibilitychange", this.#handleVisibility);
    this.#syncFromCoordinator();
  }

  readonly #handleOnline = () => {
    void this.#coordinator?.notifyOnline().finally(() => this.#syncFromCoordinator());
  };

  readonly #handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void this.#coordinator?.maintainActiveSession().finally(() => this.#syncFromCoordinator());
    }
  };

  #syncFromCoordinator(): void {
    const snapshot = this.#coordinator?.snapshot;
    if (!snapshot) return;
    this.#setView({
      mode: snapshot.state === "LEGACY" ? "LEGACY" : "V2",
      state: snapshot.state,
      reason: snapshot.reason,
      authenticated: snapshot.hasAccessToken,
      tenantId: this.#identity?.tenantId ?? null,
      membershipId: this.#identity?.membershipId ?? null,
      role: this.#identity?.role ?? null,
      authorizationVersion: snapshot.authorizationVersion,
      expiresAt: snapshot.expiresAt,
    });
    this.#scheduleRefresh(snapshot);
  }

  #scheduleRefresh(snapshot: SessionSnapshot): void {
    this.#clearRefreshTimer();
    if (!snapshot.hasAccessToken || snapshot.expiresAt == null || this.#destroyed) return;
    const delay = Math.max(1, snapshot.expiresAt - this.#now() - DEFAULT_SESSION_COORDINATOR_POLICY.refreshAheadMs);
    this.#refreshTimer = window.setTimeout(() => {
      this.#refreshTimer = null;
      void this.#coordinator?.maintainActiveSession().finally(() => this.#syncFromCoordinator());
    }, delay);
  }

  #clearRefreshTimer(): void {
    if (this.#refreshTimer != null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
  }

  #resetCoordinator(): void {
    this.#clearRefreshTimer();
    window.removeEventListener("online", this.#handleOnline);
    document.removeEventListener("visibilitychange", this.#handleVisibility);
    this.#unsubscribeCoordinator?.();
    this.#unsubscribeCoordinator = null;
    this.#coordinator?.destroy();
    this.#coordinator = null;
    this.#activity = null;
    this.#identity = null;
  }

  #setView(view: FrontendAuthView): void {
    this.#view = { ...view };
    for (const listener of this.#listeners) listener(this.view);
  }
}

export function createFrontendSessionRuntime(options: FrontendRuntimeOptions = {}): FrontendSessionRuntime {
  return new FrontendSessionRuntime(options);
}
