import { resolveSessionCoordinatorPolicy } from "./sessionConfig.ts";
import { SessionStateMachine, type SessionStateListener } from "./sessionStateMachine.ts";
import type {
  AuthenticatedMessage,
  RefreshResponse,
  SessionChannelMessage,
  SessionCoordinatorOptions,
  SessionFence,
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

const BASE_MESSAGE_KEYS = [
  "authorizationVersion",
  "issuedAt",
  "membershipId",
  "nonce",
  "senderId",
  "sessionEpoch",
  "sessionId",
  "subject",
  "tenantId",
  "type",
  "version",
] as const;

type SafeError = {
  code: string;
  recoverable: boolean;
  retryAfterMs: number | null;
  offline: boolean;
};

type JwtPresentation = {
  sessionId: string;
  subject: string;
  tenantId: string;
  membershipId: string;
  role: string;
  expiresAt: number;
  authorizationVersion: number;
};

type WinnerWaiter = {
  controller: AbortController;
  settle(won: boolean): void;
};

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

function boundedIdentity(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 191
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

function nonceIsValid(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function validFence(value: Partial<SessionFence>): value is SessionFence {
  return boundedIdentity(value.sessionId)
    && boundedIdentity(value.sessionEpoch)
    && boundedIdentity(value.subject)
    && boundedIdentity(value.tenantId)
    && boundedIdentity(value.membershipId)
    && Number.isInteger(value.authorizationVersion)
    && Number(value.authorizationVersion) >= 1;
}

function sameFence(left: SessionFence, right: SessionFence): boolean {
  return left.sessionId === right.sessionId
    && left.sessionEpoch === right.sessionEpoch
    && left.subject === right.subject
    && left.tenantId === right.tenantId
    && left.membershipId === right.membershipId
    && left.authorizationVersion === right.authorizationVersion;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function withinMessageLimit(value: unknown, maximumBytes: number): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximumBytes;
  } catch {
    return false;
  }
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
    if (payload.ver !== 2
      || payload.typ !== "access"
      || !boundedIdentity(payload.sid)
      || !boundedIdentity(payload.sub)
      || !boundedIdentity(payload.tenantId)
      || !boundedIdentity(payload.membershipId)
      || !boundedIdentity(payload.role)
      || !Number.isSafeInteger(expiresAt)
      || !Number.isInteger(authorizationVersion)
      || authorizationVersion < 1) return null;
    return {
      sessionId: payload.sid,
      subject: payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      role: payload.role,
      expiresAt,
      authorizationVersion,
    };
  } catch {
    return null;
  }
}

export class SessionCoordinator {
  readonly #options: SessionCoordinatorOptions;
  readonly #policy;
  readonly #machine: SessionStateMachine;
  readonly #winnerWaiters = new Set<WinnerWaiter>();
  readonly #recentOperations = new Map<string, number>();
  readonly #seenMessageNonces = new Map<string, number>();
  readonly #unsubscribe: () => void;
  readonly #lifecycleController = new AbortController();
  #expectedSession: SessionFence | null;
  #accessToken: string | null = null;
  #refreshPromise: Promise<string | null> | null = null;
  #transportController: AbortController | null = null;
  #generation = 0;
  #lastAcceptedMessageAt = 0;
  #messageWindowStartedAt = 0;
  #messageWindowCount = 0;
  #destroyed = false;

  constructor(options: SessionCoordinatorOptions) {
    this.#options = options;
    this.#policy = resolveSessionCoordinatorPolicy(options.policy);
    if (options.expectedSession && !validFence(options.expectedSession)) {
      throw new Error("MT01B2_INVALID_EXPECTED_SESSION");
    }
    this.#expectedSession = options.expectedSession ? { ...options.expectedSession } : null;
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
    if (this.#destroyed || !this.#options.enabled || this.snapshot.state === "LEGACY") return;
    const generation = ++this.#generation;
    this.#transportController?.abort();
    this.#lifecycleController.abort();
    this.#recentOperations.clear();
    this.#broadcastTerminal("LOGOUT");
    this.#clearToken();
    this.#transition("LOGGED_OUT", "LOGOUT");
    this.#settleWaiters(false);
    const controller = new AbortController();
    try {
      await this.#options.transport.logout(controller.signal);
    } catch {
      if (generation !== this.#generation) return;
    }
  }

  requireReauthentication(reason: SessionReason = "REVOKED"): void {
    if (this.#destroyed || !this.#options.enabled || this.snapshot.state === "LEGACY") return;
    ++this.#generation;
    this.#transportController?.abort();
    this.#lifecycleController.abort();
    this.#recentOperations.clear();
    this.#broadcastTerminal("REAUTH_REQUIRED");
    this.#clearToken();
    this.#transition("REAUTH_REQUIRED", reason);
    this.#settleWaiters(false);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    ++this.#generation;
    this.#transportController?.abort();
    this.#lifecycleController.abort();
    this.#recentOperations.clear();
    this.#seenMessageNonces.clear();
    this.#clearToken();
    this.#unsubscribe();
    this.#options.channel.close();
    this.#settleWaiters(false);
    this.#options.dispose?.();
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
        try {
          await this.#options.clock.sleep(jitter, this.#lifecycleController.signal);
        } catch {
          return null;
        }
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
    const fence = this.#expectedSession;
    if (fence) {
      this.#recentOperations.set(operationNonce, issuedAt);
      this.#options.channel.post({
        version: 2,
        type: "REFRESH_STARTED",
        senderId: this.#options.tabId,
        nonce: operationNonce,
        issuedAt,
        ...fence,
      });
    }
    const controller = new AbortController();
    this.#transportController = controller;
    try {
      const response = await this.#options.transport.refresh(controller.signal);
      if (generation !== this.#generation || this.#destroyed) return { kind: "TERMINAL" };
      const accepted = this.#acceptServerResponse(response);
      const message: AuthenticatedMessage = {
        version: 2,
        type: "AUTHENTICATED",
        senderId: this.#options.tabId,
        nonce: this.#options.randomNonce(),
        operationNonce,
        issuedAt: this.#options.clock.now(),
        expiresAt: accepted.presentation.expiresAt,
        accessToken: response.token,
        ...accepted.fence,
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
      if (this.#transportController === controller) this.#transportController = null;
    }
  }

  #acceptServerResponse(response: RefreshResponse): { presentation: JwtPresentation; fence: SessionFence } {
    const presentation = parseJwtPresentation(response.token);
    const now = this.#options.clock.now();
    if (!presentation
      || presentation.expiresAt <= now - this.#policy.maxClockSkewMs
      || presentation.expiresAt > now + this.#policy.maxAccessTokenTtlMs + this.#policy.maxClockSkewMs
      || presentation.tenantId !== response.session.tenantId
      || presentation.membershipId !== response.session.membershipId
      || presentation.role !== response.session.role
      || presentation.authorizationVersion !== response.session.authorizationVersion) {
      throw { code: "MT01B_AUTHORIZATION_INVALID" };
    }
    const fence: SessionFence = {
      sessionId: presentation.sessionId,
      sessionEpoch: this.#expectedSession?.sessionEpoch ?? presentation.sessionId,
      subject: presentation.subject,
      tenantId: presentation.tenantId,
      membershipId: presentation.membershipId,
      authorizationVersion: presentation.authorizationVersion,
    };
    if (this.#expectedSession && !sameFence(this.#expectedSession, fence)) {
      throw { code: "MT01B_AUTHORIZATION_INVALID" };
    }
    this.#expectedSession = fence;
    this.#installToken(response.token, presentation, "EXPLICIT");
    return { presentation, fence };
  }

  #acceptBroadcast(message: AuthenticatedMessage): boolean {
    if (!this.#expectedSession) return false;
    const presentation = parseJwtPresentation(message.accessToken);
    const messageFence = this.#messageFence(message);
    if (!presentation
      || !messageFence
      || !sameFence(this.#expectedSession, messageFence)
      || presentation.sessionId !== message.sessionId
      || presentation.subject !== message.subject
      || presentation.tenantId !== message.tenantId
      || presentation.membershipId !== message.membershipId
      || presentation.authorizationVersion !== message.authorizationVersion
      || presentation.expiresAt !== message.expiresAt) return false;
    const now = this.#options.clock.now();
    if (presentation.expiresAt <= now - this.#policy.maxClockSkewMs
      || presentation.expiresAt > now + this.#policy.maxAccessTokenTtlMs + this.#policy.maxClockSkewMs) return false;
    this.#installToken(message.accessToken, presentation, "CROSS_TAB");
    return true;
  }

  #installToken(token: string, presentation: JwtPresentation, reason: SessionReason): void {
    this.#accessToken = token;
    this.#transition("AUTHENTICATED", reason, {
      expiresAt: presentation.expiresAt,
      authorizationVersion: presentation.authorizationVersion,
      hasAccessToken: true,
    });
  }

  #receive(value: unknown): void {
    if (this.#destroyed || !value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const type = record.type;
    const expectedKeys = type === "AUTHENTICATED"
      ? [...BASE_MESSAGE_KEYS, "accessToken", "expiresAt", "operationNonce"]
      : BASE_MESSAGE_KEYS;
    if (!exactKeys(record, expectedKeys)) return;
    const message = record as unknown as SessionChannelMessage;
    if (message.version !== 2
      || !["REFRESH_STARTED", "AUTHENTICATED", "LOGOUT", "REAUTH_REQUIRED"].includes(message.type)
      || message.senderId === this.#options.tabId
      || !nonceIsValid(message.senderId)
      || !nonceIsValid(message.nonce)
      || typeof message.issuedAt !== "number") return;
    if (message.type === "AUTHENTICATED"
      && (typeof message.accessToken !== "string" || message.accessToken.length > 16_384 || !nonceIsValid(message.operationNonce))) return;
    const messageFence = this.#messageFence(message);
    if (!messageFence || !this.#expectedSession || !sameFence(this.#expectedSession, messageFence)) return;
    if (!withinMessageLimit(value, this.#policy.maxBroadcastMessageBytes)) return;
    const now = this.#options.clock.now();
    if (message.issuedAt < now - this.#policy.maxBroadcastAgeMs || message.issuedAt > now + this.#policy.maxClockSkewMs) return;
    const replayKey = `${message.senderId}:${message.nonce}`;
    if (this.#seenMessageNonces.has(replayKey)) return;
    if (!this.#allowMessage(now)) return;
    this.#seenMessageNonces.set(replayKey, message.issuedAt);
    this.#pruneMessageState(now);

    if (message.type === "REFRESH_STARTED") {
      this.#recentOperations.set(message.nonce, message.issuedAt);
      return;
    }
    if (message.issuedAt < this.#lastAcceptedMessageAt) return;
    if (message.type === "LOGOUT" || message.type === "REAUTH_REQUIRED") {
      this.#lastAcceptedMessageAt = message.issuedAt;
      ++this.#generation;
      this.#transportController?.abort();
      this.#lifecycleController.abort();
      this.#recentOperations.clear();
      this.#clearToken();
      this.#transition(message.type === "LOGOUT" ? "LOGGED_OUT" : "REAUTH_REQUIRED", message.type === "LOGOUT" ? "LOGOUT" : "REVOKED");
      this.#settleWaiters(false);
      return;
    }
    if (message.type !== "AUTHENTICATED" || !nonceIsValid(message.operationNonce)) return;
    if (["DISABLED", "LEGACY", "REAUTH_REQUIRED", "LOGGED_OUT"].includes(this.snapshot.state)) return;
    const startedAt = this.#recentOperations.get(message.operationNonce);
    if (startedAt == null || message.issuedAt < startedAt || !this.#acceptBroadcast(message)) return;
    this.#lastAcceptedMessageAt = message.issuedAt;
    this.#settleWaiters(true);
  }

  #messageFence(message: Partial<SessionChannelMessage>): SessionFence | null {
    const fence: Partial<SessionFence> = {
      sessionId: message.sessionId,
      sessionEpoch: message.sessionEpoch,
      subject: message.subject,
      tenantId: message.tenantId,
      membershipId: message.membershipId,
      authorizationVersion: message.authorizationVersion,
    };
    return validFence(fence) ? fence : null;
  }

  #allowMessage(now: number): boolean {
    if (this.#messageWindowStartedAt === 0 || now - this.#messageWindowStartedAt >= this.#policy.maxBroadcastAgeMs) {
      this.#messageWindowStartedAt = now;
      this.#messageWindowCount = 0;
    }
    this.#messageWindowCount += 1;
    return this.#messageWindowCount <= this.#policy.maxMessagesPerWindow;
  }

  async #waitForWinner(milliseconds: number, generation: number): Promise<boolean> {
    if (this.#accessToken) return true;
    const controller = new AbortController();
    let resolveWinner: (won: boolean) => void = () => undefined;
    const winner = new Promise<boolean>((resolve) => { resolveWinner = resolve; });
    const waiter: WinnerWaiter = {
      controller,
      settle: (won) => {
        controller.abort();
        resolveWinner(won);
      },
    };
    this.#winnerWaiters.add(waiter);
    try {
      const timeout = this.#options.clock.sleep(Math.max(1, milliseconds), controller.signal)
        .then(() => false, () => false);
      const won = await Promise.race([winner, timeout]);
      return generation === this.#generation && won;
    } finally {
      controller.abort();
      this.#winnerWaiters.delete(waiter);
    }
  }

  #settleWaiters(won: boolean): void {
    for (const waiter of this.#winnerWaiters) waiter.settle(won);
    this.#winnerWaiters.clear();
  }

  #transition(state: SessionSnapshot["state"], reason: SessionReason, details: Partial<SessionSnapshot> = {}): void {
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
    if (!this.#expectedSession) return;
    this.#options.channel.post({
      version: 2,
      type,
      senderId: this.#options.tabId,
      nonce: this.#options.randomNonce(),
      issuedAt: this.#options.clock.now(),
      ...this.#expectedSession,
    });
  }

  #pruneMessageState(now: number): void {
    for (const [nonce, issuedAt] of this.#recentOperations) {
      if (issuedAt < now - this.#policy.maxBroadcastAgeMs) this.#recentOperations.delete(nonce);
    }
    for (const [nonce, issuedAt] of this.#seenMessageNonces) {
      if (issuedAt < now - this.#policy.maxBroadcastAgeMs || this.#seenMessageNonces.size > this.#policy.maxReplayNonces) {
        this.#seenMessageNonces.delete(nonce);
      }
    }
  }
}
