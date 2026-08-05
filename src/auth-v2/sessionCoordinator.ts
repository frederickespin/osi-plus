import { resolveSessionCoordinatorPolicy } from "./sessionConfig.ts";
import { SessionStateMachine, type SessionStateListener } from "./sessionStateMachine.ts";
import type {
  AuthenticatedMessage,
  RefreshResponse,
  SessionChannelMessage,
  SessionCoordinatorOptions,
  SessionReason,
  SessionSnapshot,
} from "./sessionTypes.ts";

const RECOVERABLE_CODES = new Set([
  "MT01B_REFRESH_IN_PROGRESS",
  "MT01B_AUTH_LOCK_TIMEOUT",
  "MT01B_AUTH_STATEMENT_TIMEOUT",
]);

const TERMINAL_CODES = new Set([
  "MT01B_SESSION_REVOKED",
  "MT01B_SESSION_COMPROMISED",
  "MT01B_SESSION_INVALID",
  "MT01B_MEMBERSHIP_INACTIVE",
  "MT01B_AUTHORIZATION_CHANGED",
  "MT01B_AUTHORIZATION_INVALID",
]);

type SafeError = {
  code: string;
  recoverable: boolean;
  retryAfterMs: number | null;
  offline: boolean;
};

type JwtPresentation = {
  expiresAt: number;
  authorizationVersion: number;
};

type WinnerWaiter = (won: boolean) => void;

function safeError(error: unknown): SafeError {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const body = candidate.body && typeof candidate.body === "object" ? candidate.body as Record<string, unknown> : {};
  const rawCode = body.error ?? body.code ?? candidate.code;
  const code = typeof rawCode === "string" && /^MT01B_[A-Z0-9_]+$/.test(rawCode)
    ? rawCode
    : "MT01B_AUTH_DATABASE_UNAVAILABLE";
  const rawRetry = body.retryAfterMs ?? candidate.retryAfterMs;
  const retryAfterMs = Number.isInteger(rawRetry) && Number(rawRetry) > 0 ? Number(rawRetry) : null;
  const offline = code === "MT01B_AUTH_DATABASE_UNAVAILABLE" || candidate.name === "TypeError";
  return {
    code,
    recoverable: body.recoverable === true || candidate.recoverable === true || RECOVERABLE_CODES.has(code),
    retryAfterMs,
    offline,
  };
}

function parseJwtPresentation(token: string): JwtPresentation | null {
  if (!token || token.length > 16_384) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(padded)) as Record<string, unknown>;
    const expiresAt = Number(payload.exp) * 1_000;
    const authorizationVersion = Number(payload.authorizationVersion);
    if (!Number.isSafeInteger(expiresAt) || !Number.isInteger(authorizationVersion)) return null;
    return { expiresAt, authorizationVersion };
  } catch {
    return null;
  }
}

function nonceIsValid(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

export class SessionCoordinator {
  readonly #options: SessionCoordinatorOptions;
  readonly #policy;
  readonly #machine: SessionStateMachine;
  readonly #winnerWaiters = new Set<WinnerWaiter>();
  readonly #recentOperations = new Map<string, number>();
  readonly #unsubscribe: () => void;
  #accessToken: string | null = null;
  #refreshPromise: Promise<string | null> | null = null;
  #abortController: AbortController | null = null;
  #generation = 0;
  #lastAcceptedMessageAt = 0;
  #destroyed = false;

  constructor(options: SessionCoordinatorOptions) {
    this.#options = options;
    this.#policy = resolveSessionCoordinatorPolicy(options.policy);
    this.#machine = new SessionStateMachine(options.enabled ? "INITIALIZING" : "DISABLED", "BOOTSTRAP");
    this.#unsubscribe = options.channel.subscribe((message) => this.#receive(message));
  }

  get snapshot(): SessionSnapshot {
    return this.#machine.snapshot;
  }

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  subscribe(listener: SessionStateListener): () => void {
    return this.#machine.subscribe(listener);
  }

  async initialize(): Promise<SessionSnapshot> {
    if (!this.#options.enabled) return this.snapshot;
    await this.refresh("BOOTSTRAP");
    return this.snapshot;
  }

  shouldMaintainActiveSession(): boolean {
    if (!this.#accessToken || this.snapshot.expiresAt == null) return false;
    const now = this.#options.clock.now();
    return this.#options.activity.isOnline()
      && this.#options.activity.isVisible()
      && now - this.#options.activity.lastActivityAt() <= this.#policy.recentActivityMs
      && this.snapshot.expiresAt - now <= this.#policy.refreshAheadMs;
  }

  async maintainActiveSession(): Promise<string | null> {
    return this.shouldMaintainActiveSession() ? this.refresh("EXPIRING") : this.#accessToken;
  }

  async notifyOnline(): Promise<string | null> {
    if (!this.#options.enabled || !this.#options.activity.isOnline()) return null;
    return this.refresh("RECONNECTED");
  }

  refresh(reason: SessionReason = "EXPLICIT"): Promise<string | null> {
    if (!this.#options.enabled || this.#destroyed) return Promise.resolve(null);
    if (["LEGACY", "REAUTH_REQUIRED", "LOGGED_OUT"].includes(this.snapshot.state)) return Promise.resolve(null);
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = this.#refreshLoop(reason).finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  async logout(): Promise<void> {
    if (this.#destroyed || !this.#options.enabled) return;
    if (this.snapshot.state === "LEGACY") return;
    const generation = ++this.#generation;
    this.#abortController?.abort();
    this.#recentOperations.clear();
    this.#clearToken();
    this.#transition("LOGGED_OUT", "LOGOUT");
    this.#broadcastTerminal("LOGOUT");
    const controller = new AbortController();
    try {
      await this.#options.transport.logout(controller.signal);
    } catch {
      if (generation !== this.#generation) return;
    }
  }

  requireReauthentication(reason: SessionReason = "REVOKED"): void {
    if (this.#destroyed || !this.#options.enabled) return;
    if (this.snapshot.state === "LEGACY") return;
    ++this.#generation;
    this.#abortController?.abort();
    this.#recentOperations.clear();
    this.#clearToken();
    this.#transition("REAUTH_REQUIRED", reason);
    this.#broadcastTerminal("REAUTH_REQUIRED");
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    ++this.#generation;
    this.#abortController?.abort();
    this.#recentOperations.clear();
    this.#clearToken();
    this.#unsubscribe();
    this.#options.channel.close();
    this.#settleWaiters(false);
  }

  async #refreshLoop(reason: SessionReason): Promise<string | null> {
    if (!this.#options.activity.isOnline()) {
      this.#transition("OFFLINE", "RECOVERABLE_ERROR");
      return null;
    }
    const generation = this.#generation;
    let lastCode = "";
    for (let attempt = 0; attempt <= this.#policy.maxRetries; attempt += 1) {
      if (generation !== this.#generation || this.#destroyed) return null;
      this.#transition("REFRESHING", reason);
      const result = this.#options.lock
        ? await this.#options.lock.tryRun("osi-plus:mt01b2:refresh", () => this.#refreshAsLeader(generation))
        : { acquired: true as const, value: await this.#refreshAsLeader(generation) };
      let retryAfterMs = this.#policy.winnerWaitMs;
      if (result.acquired) {
        const outcome = result.value;
        if (outcome.kind === "SUCCESS") return outcome.token;
        if (outcome.kind === "LEGACY" || outcome.kind === "TERMINAL") return null;
        lastCode = outcome.code;
        retryAfterMs = outcome.retryAfterMs;
      }
      if (this.#accessToken) return this.#accessToken;

      this.#transition("RECOVERABLE_WAIT", "RECOVERABLE_ERROR");
      const won = await this.#waitForWinner(Math.min(retryAfterMs, this.#policy.maxRetryAfterMs), generation);
      if (won && this.#accessToken) return this.#accessToken;
      if (lastCode === "MT01B_REFRESH_ALREADY_ROTATED") {
        this.requireReauthentication("REVOKED");
        return null;
      }
      if (attempt < this.#policy.maxRetries) {
        const jitter = Math.floor(this.#options.randomUnit() * (this.#policy.retryJitterMs + 1));
        await this.#options.clock.sleep(jitter);
      }
    }
    this.#transition("RECOVERABLE_WAIT", "RECOVERABLE_ERROR");
    return null;
  }

  async #refreshAsLeader(generation: number): Promise<
    | { kind: "SUCCESS"; token: string }
    | { kind: "RECOVERABLE"; code: string; retryAfterMs: number }
    | { kind: "TERMINAL" }
    | { kind: "LEGACY" }
  > {
    const operationNonce = this.#options.randomNonce();
    const issuedAt = this.#options.clock.now();
    this.#recentOperations.set(operationNonce, issuedAt);
    this.#options.channel.post({ version: 1, type: "REFRESH_STARTED", senderId: this.#options.tabId, nonce: operationNonce, issuedAt });
    const controller = new AbortController();
    this.#abortController = controller;
    try {
      const response = await this.#options.transport.refresh(controller.signal);
      if (generation !== this.#generation || this.#destroyed) return { kind: "TERMINAL" };
      const presentation = this.#acceptResponse(response);
      const message: AuthenticatedMessage = {
        version: 1,
        type: "AUTHENTICATED",
        senderId: this.#options.tabId,
        nonce: this.#options.randomNonce(),
        operationNonce,
        issuedAt: this.#options.clock.now(),
        expiresAt: presentation.expiresAt,
        authorizationVersion: presentation.authorizationVersion,
        accessToken: response.token,
      };
      this.#options.channel.post(message);
      this.#settleWaiters(true);
      return { kind: "SUCCESS", token: response.token };
    } catch (error) {
      if (controller.signal.aborted || generation !== this.#generation || this.#destroyed) return { kind: "TERMINAL" };
      const normalized = safeError(error);
      if (normalized.code === "MT01B_AUTH_V2_DISABLED") {
        this.#recentOperations.clear();
        this.#clearToken();
        this.#transition("LEGACY", "SERVER_DISABLED");
        return { kind: "LEGACY" };
      }
      if (TERMINAL_CODES.has(normalized.code)) {
        this.requireReauthentication("REVOKED");
        return { kind: "TERMINAL" };
      }
      if (normalized.offline) {
        this.#clearToken();
        this.#transition("OFFLINE", "RECOVERABLE_ERROR");
        return { kind: "TERMINAL" };
      }
      if (normalized.code === "MT01B_REFRESH_ALREADY_ROTATED" || normalized.recoverable) {
        return {
          kind: "RECOVERABLE",
          code: normalized.code,
          retryAfterMs: Math.min(normalized.retryAfterMs ?? this.#policy.winnerWaitMs, this.#policy.maxRetryAfterMs),
        };
      }
      this.requireReauthentication("REVOKED");
      return { kind: "TERMINAL" };
    } finally {
      if (this.#abortController === controller) this.#abortController = null;
    }
  }

  #acceptResponse(response: RefreshResponse): JwtPresentation {
    const presentation = parseJwtPresentation(response.token);
    const now = this.#options.clock.now();
    if (!presentation
      || presentation.expiresAt <= now - this.#policy.maxClockSkewMs
      || presentation.expiresAt > now + this.#policy.maxAccessTokenTtlMs + this.#policy.maxClockSkewMs
      || presentation.authorizationVersion !== response.session.authorizationVersion) {
      throw { code: "MT01B_AUTHORIZATION_INVALID" };
    }
    this.#accessToken = response.token;
    this.#transition("AUTHENTICATED", "EXPLICIT", {
      expiresAt: presentation.expiresAt,
      authorizationVersion: presentation.authorizationVersion,
      hasAccessToken: true,
    });
    return presentation;
  }

  #receive(value: unknown): void {
    if (this.#destroyed || !value || typeof value !== "object") return;
    const message = value as Partial<SessionChannelMessage>;
    if (message.version !== 1 || message.senderId === this.#options.tabId || !nonceIsValid(message.nonce)) return;
    if (typeof message.issuedAt !== "number") return;
    const now = this.#options.clock.now();
    if (message.issuedAt < now - this.#policy.maxBroadcastAgeMs || message.issuedAt > now + this.#policy.maxClockSkewMs) return;
    if (message.type === "REFRESH_STARTED") {
      this.#recentOperations.set(message.nonce, message.issuedAt);
      this.#pruneOperations(now);
      return;
    }
    if (message.issuedAt < this.#lastAcceptedMessageAt) return;
    if (message.type === "LOGOUT" || message.type === "REAUTH_REQUIRED") {
      this.#lastAcceptedMessageAt = message.issuedAt;
      ++this.#generation;
      this.#abortController?.abort();
      this.#recentOperations.clear();
      this.#clearToken();
      this.#transition(message.type === "LOGOUT" ? "LOGGED_OUT" : "REAUTH_REQUIRED", message.type === "LOGOUT" ? "LOGOUT" : "REVOKED");
      this.#settleWaiters(false);
      return;
    }
    if (message.type !== "AUTHENTICATED" || !nonceIsValid(message.operationNonce)) return;
    if (["DISABLED", "LEGACY", "REAUTH_REQUIRED", "LOGGED_OUT"].includes(this.snapshot.state)) return;
    const startedAt = this.#recentOperations.get(message.operationNonce);
    if (startedAt == null || message.issuedAt < startedAt) return;
    const response: RefreshResponse = {
      ok: true,
      token: typeof message.accessToken === "string" ? message.accessToken : "",
      session: {
        tenantId: "presentation-only",
        membershipId: "presentation-only",
        role: "presentation-only",
        authorizationVersion: Number(message.authorizationVersion),
      },
    };
    const presentation = parseJwtPresentation(response.token);
    if (!presentation || presentation.expiresAt !== message.expiresAt || presentation.authorizationVersion !== message.authorizationVersion) return;
    try {
      this.#acceptResponse(response);
    } catch {
      return;
    }
    this.#lastAcceptedMessageAt = message.issuedAt;
    this.#settleWaiters(true);
  }

  async #waitForWinner(milliseconds: number, generation: number): Promise<boolean> {
    if (this.#accessToken) return true;
    let settle: WinnerWaiter | null = null;
    const winner = new Promise<boolean>((resolve) => {
      settle = resolve;
      this.#winnerWaiters.add(resolve);
    });
    let won = false;
    try {
      won = await Promise.race([
        winner,
        this.#options.clock.sleep(Math.max(1, milliseconds)).then(() => false),
      ]);
    } finally {
      if (settle) this.#winnerWaiters.delete(settle);
    }
    return generation === this.#generation && won;
  }

  #settleWaiters(won: boolean): void {
    for (const waiter of this.#winnerWaiters) waiter(won);
    this.#winnerWaiters.clear();
  }

  #transition(state: SessionSnapshot["state"], reason: SessionReason, details: Partial<SessionSnapshot> = {}): void {
    if (this.#machine.snapshot.state === state) {
      this.#machine.transition(state, reason, details);
      return;
    }
    this.#machine.transition(state, reason, details);
  }

  #clearToken(): void {
    this.#accessToken = null;
    const snapshot = this.#machine.snapshot;
    if (snapshot.hasAccessToken || snapshot.expiresAt != null || snapshot.authorizationVersion != null) {
      const target = snapshot.state === "AUTHENTICATED" ? "REAUTH_REQUIRED" : snapshot.state;
      this.#machine.transition(target, "REVOKED", { hasAccessToken: false, expiresAt: null, authorizationVersion: null });
    }
  }

  #broadcastTerminal(type: "LOGOUT" | "REAUTH_REQUIRED"): void {
    this.#options.channel.post({
      version: 1,
      type,
      senderId: this.#options.tabId,
      nonce: this.#options.randomNonce(),
      issuedAt: this.#options.clock.now(),
    });
  }

  #pruneOperations(now: number): void {
    for (const [nonce, issuedAt] of this.#recentOperations) {
      if (issuedAt < now - this.#policy.maxBroadcastAgeMs) this.#recentOperations.delete(nonce);
    }
  }
}
