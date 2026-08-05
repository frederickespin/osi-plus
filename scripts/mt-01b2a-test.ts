import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SessionCoordinator } from "../src/auth-v2/sessionCoordinator.ts";
import type {
  RefreshResponse,
  SessionActivity,
  SessionChannel,
  SessionClock,
  SessionFence,
  SessionLock,
  SessionTransport,
} from "../src/auth-v2/sessionTypes.ts";

const results: Array<{ name: string; passed: true }> = [];

async function test(name: string, action: () => void | Promise<void>): Promise<void> {
  await action();
  results.push({ name, passed: true });
}

function fence(overrides: Partial<SessionFence> = {}): SessionFence {
  return {
    sessionId: "session-a",
    sessionEpoch: "session-a",
    subject: "user-a",
    tenantId: "tenant-a",
    membershipId: "member-a",
    authorizationVersion: 1,
    ...overrides,
  };
}

function token(now: number, session = fence(), ttlMs = 10 * 60_000, jti = "token-a"): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    ver: 2,
    typ: "access",
    sid: session.sessionId,
    sub: session.subject,
    tenantId: session.tenantId,
    membershipId: session.membershipId,
    role: "ADMIN",
    authorizationVersion: session.authorizationVersion,
    jti,
    exp: Math.floor((now + ttlMs) / 1_000),
  })}.signature`;
}

function success(now: number, session = fence(), ttlMs = 10 * 60_000): RefreshResponse {
  return {
    ok: true,
    token: token(now, session, ttlMs),
    session: {
      tenantId: session.tenantId,
      membershipId: session.membershipId,
      role: "ADMIN",
      authorizationVersion: session.authorizationVersion,
    },
  };
}

function tokenPayload(accessToken: string): Record<string, unknown> {
  const encoded = accessToken.split(".")[1]!;
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as Record<string, unknown>;
}

class TestHub {
  readonly #listeners = new Map<number, (message: unknown) => void>();
  #nextId = 1;

  connect(): SessionChannel {
    const id = this.#nextId++;
    let listener: ((message: unknown) => void) | null = null;
    return {
      post: (message) => {
        for (const [targetId, target] of this.#listeners) {
          if (targetId !== id) queueMicrotask(() => target(message));
        }
      },
      subscribe: (next) => {
        listener = next;
        this.#listeners.set(id, next);
        return () => this.#listeners.delete(id);
      },
      close: () => {
        if (listener) this.#listeners.delete(id);
      },
    };
  }

  inject(message: unknown): void {
    for (const target of this.#listeners.values()) queueMicrotask(() => target(message));
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }
}

class TrackedClock implements SessionClock {
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();

  now(): number { return Date.now(); }

  sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolveSleep, reject) => {
      const finish = () => {
        this.#timers.delete(timer);
        signal?.removeEventListener("abort", cancel);
        resolveSleep();
      };
      const cancel = () => {
        clearTimeout(timer);
        this.#timers.delete(timer);
        signal?.removeEventListener("abort", cancel);
        reject(new DOMException("cancelled", "AbortError"));
      };
      const timer = setTimeout(finish, Math.min(milliseconds, 20));
      this.#timers.add(timer);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  get activeTimers(): number { return this.#timers.size; }
}

class TestLock implements SessionLock {
  #busy = false;
  async tryRun<T>(_name: string, task: () => Promise<T>) {
    if (this.#busy) return { acquired: false as const };
    this.#busy = true;
    try {
      return { acquired: true as const, value: await task() };
    } finally {
      this.#busy = false;
    }
  }
}

class MissOnceLock implements SessionLock {
  attempts = 0;
  async tryRun<T>(_name: string, task: () => Promise<T>) {
    this.attempts += 1;
    if (this.attempts === 1) return { acquired: false as const };
    return { acquired: true as const, value: await task() };
  }
}

const clock: SessionClock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) => new Promise<void>((resolveSleep, reject) => {
    const timer = setTimeout(resolveSleep, Math.min(milliseconds, 8));
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("cancelled", "AbortError"));
    }, { once: true });
  }),
};

function activity(overrides: Partial<{ online: boolean; visible: boolean; lastActivityAt: number }> = {}): SessionActivity {
  return {
    isOnline: () => overrides.online ?? true,
    isVisible: () => overrides.visible ?? true,
    lastActivityAt: () => overrides.lastActivityAt ?? Date.now(),
  };
}

let nonceSequence = 0;
function nextNonce(): string {
  nonceSequence += 1;
  return `nonce_${String(nonceSequence).padStart(10, "0")}`;
}

function refreshStartedMessage(session: SessionFence, operationNonce: string, issuedAt = Date.now()) {
  return {
    version: 2 as const,
    type: "REFRESH_STARTED" as const,
    senderId: "peer_sender_0001",
    nonce: operationNonce,
    issuedAt,
    ...session,
  };
}

function authenticatedMessage(
  session: SessionFence,
  operationNonce: string,
  accessToken: string,
  issuedAt = Date.now(),
) {
  const payload = tokenPayload(accessToken) as { exp: number };
  return {
    version: 2 as const,
    type: "AUTHENTICATED" as const,
    senderId: "peer_sender_0001",
    nonce: nextNonce(),
    operationNonce,
    issuedAt,
    expiresAt: payload.exp * 1_000,
    accessToken,
    ...session,
  };
}

function coordinator(options: {
  tab: number;
  hub: TestHub;
  transport: SessionTransport;
  lock?: SessionLock | null;
  enabled?: boolean;
  sessionActivity?: SessionActivity;
  expectedSession?: SessionFence | null;
  sessionClock?: SessionClock;
  dispose?: () => void;
}): SessionCoordinator {
  return new SessionCoordinator({
    enabled: options.enabled ?? true,
    tabId: `tab_id_${String(options.tab).padStart(8, "0")}`,
    transport: options.transport,
    channel: options.hub.connect(),
    lock: options.lock === undefined ? new TestLock() : options.lock,
    clock: options.sessionClock ?? clock,
    activity: options.sessionActivity ?? activity(),
    randomNonce: nextNonce,
    randomUnit: () => 0,
    expectedSession: options.expectedSession === undefined ? fence() : options.expectedSession ?? undefined,
    dispose: options.dispose,
    policy: {
      winnerWaitMs: 15,
      maxRetryAfterMs: 20,
      retryJitterMs: 0,
      maxRetries: 3,
      maxBroadcastAgeMs: 2_000,
    },
  });
}

async function initializeAll(items: SessionCoordinator[]): Promise<Array<string | null>> {
  return Promise.all(items.map(async (item) => {
    await item.initialize();
    return item.getAccessToken();
  }));
}

await test("20 pestañas usan una sola llamada refresh y comparten sólo access token en memoria", async () => {
  const hub = new TestHub();
  const lock = new TestLock();
  let calls = 0;
  const transport: SessionTransport = {
    refresh: async () => {
      calls += 1;
      await clock.sleep(5);
      return success(Date.now());
    },
    logout: async () => undefined,
  };
  const tabs = Array.from({ length: 20 }, (_, tab) => coordinator({ tab, hub, transport, lock }));
  const tokens = await initializeAll(tabs);
  assert.equal(calls, 1);
  assert.equal(new Set(tokens).size, 1);
  assert.ok(tokens.every(Boolean));
  assert.ok(tabs.every((tab) => tab.snapshot.state === "AUTHENTICATED"));
  tabs.forEach((tab) => tab.destroy());
});

await test("la caída de la pestaña líder libera el lock y otra pestaña converge", async () => {
  const hub = new TestHub();
  const lock = new TestLock();
  let calls = 0;
  const transport: SessionTransport = {
    refresh: async () => {
      calls += 1;
      if (calls === 1) throw { code: "MT01B_AUTH_DATABASE_UNAVAILABLE", recoverable: true };
      return success(Date.now());
    },
    logout: async () => undefined,
  };
  const tabs = Array.from({ length: 20 }, (_, tab) => coordinator({ tab: 30 + tab, hub, transport, lock }));
  await initializeAll(tabs);
  assert.ok(calls >= 2);
  assert.ok(tabs.slice(1).every((tab) => tab.getAccessToken()));
  tabs.forEach((tab) => tab.destroy());
});

await test("IN_PROGRESS, lock timeout y statement timeout reintentan con límite", async () => {
  for (const code of ["MT01B_REFRESH_IN_PROGRESS", "MT01B_AUTH_LOCK_TIMEOUT", "MT01B_AUTH_STATEMENT_TIMEOUT"]) {
    const hub = new TestHub();
    let calls = 0;
    const item = coordinator({
      tab: 60 + calls,
      hub,
      transport: {
        refresh: async () => {
          calls += 1;
          if (calls === 1) throw { code, recoverable: true, retryAfterMs: 1 };
          return success(Date.now());
        },
        logout: async () => undefined,
      },
    });
    await item.initialize();
    assert.equal(item.snapshot.state, "AUTHENTICATED");
    assert.equal(calls, 2);
    item.destroy();
  }
});

await test("ALREADY_ROTATED sin ganador confirmado exige reautenticación", async () => {
  const item = coordinator({
    tab: 70,
    hub: new TestHub(),
    transport: {
      refresh: async () => { throw { code: "MT01B_REFRESH_ALREADY_ROTATED", recoverable: true, retryAfterMs: 1 }; },
      logout: async () => undefined,
    },
  });
  await item.initialize();
  assert.equal(item.snapshot.state, "REAUTH_REQUIRED");
  assert.equal(item.getAccessToken(), null);
  item.destroy();
});

await test("base no disponible pasa a OFFLINE y reconecta sin ciclo infinito", async () => {
  let calls = 0;
  const item = coordinator({
    tab: 80,
    hub: new TestHub(),
    sessionActivity: activity(),
    transport: {
      refresh: async () => {
        calls += 1;
        if (calls === 1) throw { code: "MT01B_AUTH_DATABASE_UNAVAILABLE", recoverable: true };
        return success(Date.now());
      },
      logout: async () => undefined,
    },
  });
  await item.initialize();
  assert.equal(item.snapshot.state, "OFFLINE");
  await item.notifyOnline();
  assert.equal(item.snapshot.state, "AUTHENTICATED");
  assert.equal(calls, 2);
  item.destroy();
});

await test("logout durante refresh cancela la operación y limpia todas las pestañas", async () => {
  const hub = new TestHub();
  let logoutCalls = 0;
  const transport: SessionTransport = {
    refresh: (signal) => new Promise((resolveRefresh, reject) => {
      const timer = setTimeout(() => resolveRefresh(success(Date.now())), 25);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    }),
    logout: async () => { logoutCalls += 1; },
  };
  const first = coordinator({ tab: 90, hub, transport, lock: new TestLock() });
  const second = coordinator({ tab: 91, hub, transport, lock: new TestLock() });
  const pending = first.initialize();
  await clock.sleep(2);
  await second.logout();
  await pending;
  await clock.sleep(1);
  assert.equal(first.snapshot.state, "LOGGED_OUT");
  assert.equal(second.snapshot.state, "LOGGED_OUT");
  assert.equal(first.getAccessToken(), null);
  assert.equal(logoutCalls, 1);
  first.destroy();
  second.destroy();
});

await test("revocación y cambio de authorizationVersion limpian copias en memoria", async () => {
  const hub = new TestHub();
  let revoked = false;
  const transport: SessionTransport = {
    refresh: async () => {
      if (revoked) throw { code: "MT01B_AUTHORIZATION_CHANGED" };
      return success(Date.now());
    },
    logout: async () => undefined,
  };
  const first = coordinator({ tab: 100, hub, transport });
  const second = coordinator({ tab: 101, hub, transport });
  await first.initialize();
  revoked = true;
  await first.refresh();
  await clock.sleep(1);
  assert.equal(first.snapshot.state, "REAUTH_REQUIRED");
  assert.equal(second.snapshot.state, "REAUTH_REQUIRED");
  assert.equal(first.getAccessToken(), null);
  first.destroy();
  second.destroy();
});

await test("BroadcastChannel rechaza mensajes obsoletos, inválidos y sin operación conocida", async () => {
  const hub = new TestHub();
  const item = coordinator({
    tab: 110,
    hub,
    transport: { refresh: async () => success(Date.now()), logout: async () => undefined },
  });
  const before = item.snapshot;
  hub.inject({ version: 1, type: "AUTHENTICATED", senderId: "attacker", nonce: "bad", issuedAt: Date.now(), accessToken: "secret" });
  hub.inject({
    version: 2,
    type: "AUTHENTICATED",
    senderId: "attacker_id",
    nonce: "nonce_attacker_1",
    operationNonce: "nonce_unknown_1",
    issuedAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60_000,
    accessToken: token(Date.now()),
    ...fence(),
  });
  const operationNonce = "nonce_known_operation";
  const issuedAt = Date.now();
  hub.inject({ version: 2, type: "REFRESH_STARTED", senderId: "peer_sender", nonce: operationNonce, issuedAt, ...fence() });
  hub.inject({
    version: 2,
    type: "AUTHENTICATED",
    senderId: "peer_sender",
    nonce: "nonce_forged_result",
    operationNonce,
    issuedAt,
    expiresAt: issuedAt + 123_000,
    accessToken: token(issuedAt),
    ...fence({ authorizationVersion: 999 }),
  });
  await clock.sleep(1);
  assert.deepEqual(item.snapshot, before);
  assert.equal(item.getAccessToken(), null);
  item.destroy();
});

await test("clock skew y expiración inválida no autentican", async () => {
  const item = coordinator({
    tab: 120,
    hub: new TestHub(),
    transport: {
      refresh: async () => ({ ...success(Date.now()), token: token(Date.now(), fence(), -120_000) }),
      logout: async () => undefined,
    },
  });
  await item.initialize();
  assert.equal(item.snapshot.state, "REAUTH_REQUIRED");
  assert.equal(item.getAccessToken(), null);
  item.destroy();
});

await test("fallback sin Web Locks converge mediante códigos del servidor", async () => {
  const hub = new TestHub();
  let calls = 0;
  let busy = false;
  const transport: SessionTransport = {
    refresh: async () => {
      calls += 1;
      if (busy) throw { code: "MT01B_REFRESH_IN_PROGRESS", recoverable: true, retryAfterMs: 2 };
      busy = true;
      await clock.sleep(5);
      busy = false;
      return success(Date.now());
    },
    logout: async () => undefined,
  };
  const tabs = Array.from({ length: 20 }, (_, tab) => coordinator({ tab: 130 + tab, hub, transport, lock: null }));
  const tokens = await initializeAll(tabs);
  assert.ok(calls > 1);
  assert.ok(tokens.every(Boolean));
  assert.equal(new Set(tokens).size, 1);
  tabs.forEach((tab) => tab.destroy());
});

await test("cerrar y reabrir pestaña no restaura tokens persistidos", async () => {
  const hub = new TestHub();
  let calls = 0;
  const transport: SessionTransport = {
    refresh: async () => { calls += 1; return success(Date.now()); },
    logout: async () => undefined,
  };
  const first = coordinator({ tab: 160, hub, transport });
  await first.initialize();
  assert.ok(first.getAccessToken());
  first.destroy();
  assert.equal(first.getAccessToken(), null);
  const reopened = coordinator({ tab: 161, hub, transport });
  assert.equal(reopened.getAccessToken(), null);
  await reopened.initialize();
  assert.equal(calls, 2);
  reopened.destroy();
});

await test("usuario oculto o inactivo no refresca continuamente", async () => {
  let calls = 0;
  const hidden = coordinator({
    tab: 170,
    hub: new TestHub(),
    sessionActivity: activity({ visible: false, lastActivityAt: Date.now() - 60 * 60_000 }),
    transport: {
      refresh: async () => { calls += 1; return success(Date.now(), fence(), 30_000); },
      logout: async () => undefined,
    },
  });
  await hidden.initialize();
  assert.equal(hidden.shouldMaintainActiveSession(), false);
  await hidden.maintainActiveSession();
  assert.equal(calls, 1);
  hidden.destroy();
});

await test("errores recuperables agotan un máximo fijo sin reintento infinito", async () => {
  let calls = 0;
  const item = coordinator({
    tab: 180,
    hub: new TestHub(),
    transport: {
      refresh: async () => { calls += 1; throw { code: "MT01B_AUTH_LOCK_TIMEOUT", recoverable: true, retryAfterMs: 1 }; },
      logout: async () => undefined,
    },
  });
  await item.initialize();
  assert.equal(calls, 4);
  assert.equal(item.snapshot.state, "RECOVERABLE_WAIT");
  item.destroy();
});

await test("V2 desactivado conserva LEGACY y no llama endpoints cuando el cliente está apagado", async () => {
  let calls = 0;
  const disabled = coordinator({
    tab: 190,
    hub: new TestHub(),
    enabled: false,
    transport: { refresh: async () => { calls += 1; return success(Date.now()); }, logout: async () => { calls += 1; } },
  });
  await disabled.initialize();
  assert.equal(disabled.snapshot.state, "DISABLED");
  assert.equal(calls, 0);
  disabled.destroy();

  let serverDisabledCalls = 0;
  const serverDisabled = coordinator({
    tab: 191,
    hub: new TestHub(),
    transport: {
      refresh: async () => { serverDisabledCalls += 1; throw { code: "MT01B_AUTH_V2_DISABLED" }; },
      logout: async () => undefined,
    },
  });
  await serverDisabled.initialize();
  assert.equal(serverDisabled.snapshot.state, "LEGACY");
  await serverDisabled.refresh();
  assert.equal(serverDisabledCalls, 1);
  serverDisabled.destroy();
});

await test("una pestaña sin identidad esperada rechaza tokens difundidos", async () => {
  const hub = new TestHub();
  const session = fence();
  const item = coordinator({
    tab: 200,
    hub,
    expectedSession: null,
    transport: { refresh: async () => success(Date.now(), session), logout: async () => undefined },
  });
  const operation = "unknown_session_operation";
  const issuedAt = Date.now();
  hub.inject(refreshStartedMessage(session, operation, issuedAt));
  hub.inject(authenticatedMessage(session, operation, token(issuedAt, session), issuedAt + 1));
  await clock.sleep(1);
  assert.equal(item.getAccessToken(), null);
  assert.equal(item.snapshot.state, "INITIALIZING");
  item.destroy();
});

await test("logout y nuevo login no aceptan mensajes tardíos de la sesión anterior", async () => {
  const hub = new TestHub();
  const oldSession = fence();
  const newSession = fence({
    sessionId: "session-b",
    sessionEpoch: "session-b",
    subject: "user-b",
    membershipId: "member-b",
  });
  const oldCoordinator = coordinator({
    tab: 210,
    hub,
    expectedSession: oldSession,
    transport: { refresh: async () => success(Date.now(), oldSession), logout: async () => undefined },
  });
  await oldCoordinator.initialize();
  oldCoordinator.destroy();

  const current = coordinator({
    tab: 211,
    hub,
    expectedSession: newSession,
    transport: { refresh: async () => success(Date.now(), newSession), logout: async () => undefined },
  });
  await current.initialize();
  const currentToken = current.getAccessToken();
  const operation = "old_session_operation";
  const issuedAt = Date.now();
  hub.inject(refreshStartedMessage(oldSession, operation, issuedAt));
  hub.inject(authenticatedMessage(oldSession, operation, token(issuedAt, oldSession), issuedAt + 1));
  hub.inject({
    version: 2,
    type: "LOGOUT",
    senderId: "peer_sender_0002",
    nonce: "old_logout_nonce",
    issuedAt: issuedAt + 2,
    ...oldSession,
  });
  await clock.sleep(1);
  assert.equal(current.snapshot.state, "AUTHENTICATED");
  assert.equal(current.getAccessToken(), currentToken);
  current.destroy();
});

await test("un refresh resuelto después de destroy no instala ni difunde el token", async () => {
  const hub = new TestHub();
  let resolveRefresh: (value: RefreshResponse) => void = () => undefined;
  const refreshResponse = new Promise<RefreshResponse>((resolveResponse) => { resolveRefresh = resolveResponse; });
  let disposed = 0;
  const item = coordinator({
    tab: 220,
    hub,
    dispose: () => { disposed += 1; },
    transport: {
      refresh: async () => refreshResponse,
      logout: async () => undefined,
    },
  });
  const pending = item.initialize();
  await clock.sleep(1);
  item.destroy();
  resolveRefresh(success(Date.now()));
  await pending;
  assert.equal(item.getAccessToken(), null);
  assert.equal(hub.listenerCount, 0);
  assert.equal(disposed, 1);
});

await test("dos coordinadores con sesiones distintas no contaminan sus tokens", async () => {
  const hub = new TestHub();
  const lock = new TestLock();
  const firstSession = fence();
  const secondSession = fence({
    sessionId: "session-c",
    sessionEpoch: "session-c",
    subject: "user-c",
    tenantId: "tenant-c",
    membershipId: "member-c",
  });
  const first = coordinator({
    tab: 230,
    hub,
    lock,
    expectedSession: firstSession,
    transport: { refresh: async () => success(Date.now(), firstSession), logout: async () => undefined },
  });
  const second = coordinator({
    tab: 231,
    hub,
    lock,
    expectedSession: secondSession,
    transport: { refresh: async () => success(Date.now(), secondSession), logout: async () => undefined },
  });
  await Promise.all([first.initialize(), second.initialize()]);
  assert.equal(tokenPayload(first.getAccessToken()!).sid, firstSession.sessionId);
  assert.equal(tokenPayload(second.getAccessToken()!).sid, secondSession.sessionId);
  first.destroy();
  second.destroy();
});

await test("mensajes fuera de orden y nonces repetidos no reemplazan el token más nuevo", async () => {
  const hub = new TestHub();
  const session = fence();
  const item = coordinator({
    tab: 240,
    hub,
    expectedSession: session,
    transport: { refresh: async () => success(Date.now(), session), logout: async () => undefined },
  });
  await item.initialize();
  const base = Date.now();
  const newerOperation = "newer_operation_nonce";
  const olderOperation = "older_operation_nonce";
  hub.inject(refreshStartedMessage(session, newerOperation, base));
  hub.inject(refreshStartedMessage(session, olderOperation, base));
  const newer = authenticatedMessage(session, newerOperation, token(base, session, 10 * 60_000, "token-new"), base + 10);
  const older = authenticatedMessage(session, olderOperation, token(base, session, 10 * 60_000, "token-old"), base + 5);
  hub.inject(newer);
  hub.inject(newer);
  hub.inject(older);
  await clock.sleep(1);
  assert.equal(item.getAccessToken(), newer.accessToken);
  item.destroy();
});

await test("tormentas, esquemas desconocidos y mensajes excesivos quedan acotados", async () => {
  const hub = new TestHub();
  const session = fence();
  const item = coordinator({
    tab: 250,
    hub,
    expectedSession: session,
    transport: { refresh: async () => success(Date.now(), session), logout: async () => undefined },
  });
  const issuedAt = Date.now();
  for (let index = 0; index < 700; index += 1) {
    hub.inject(refreshStartedMessage(session, `storm_nonce_${String(index).padStart(8, "0")}`, issuedAt));
  }
  hub.inject({
    ...authenticatedMessage(session, "storm_nonce_00000000", token(issuedAt, session), issuedAt + 1),
    unknown: true,
  });
  hub.inject({
    ...authenticatedMessage(session, "storm_nonce_00000001", token(issuedAt, session), issuedAt + 2),
    accessToken: "x".repeat(30_000),
  });
  await clock.sleep(5);
  assert.equal(item.getAccessToken(), null);
  assert.equal(hub.listenerCount, 1);
  item.destroy();
  assert.equal(hub.listenerCount, 0);
});

await test("logout cancela timers de espera y ejecuta dispose una sola vez", async () => {
  const hub = new TestHub();
  const trackedClock = new TrackedClock();
  let disposed = 0;
  const neverAcquired: SessionLock = { tryRun: async () => ({ acquired: false as const }) };
  const item = coordinator({
    tab: 260,
    hub,
    lock: neverAcquired,
    sessionClock: trackedClock,
    dispose: () => { disposed += 1; },
    transport: { refresh: async () => success(Date.now()), logout: async () => undefined },
  });
  const pending = item.initialize();
  await new Promise((resolveWait) => setTimeout(resolveWait, 2));
  await item.logout();
  await pending;
  assert.equal(trackedClock.activeTimers, 0);
  item.destroy();
  item.destroy();
  assert.equal(disposed, 1);
});

await test("un token expirado durante la espera se rechaza y el servidor resuelve la carrera", async () => {
  const hub = new TestHub();
  const lock = new MissOnceLock();
  let calls = 0;
  const item = coordinator({
    tab: 270,
    hub,
    lock,
    transport: {
      refresh: async () => { calls += 1; return success(Date.now()); },
      logout: async () => undefined,
    },
  });
  const pending = item.initialize();
  const operation = "expired_wait_operation";
  const issuedAt = Date.now();
  hub.inject(refreshStartedMessage(fence(), operation, issuedAt));
  hub.inject(authenticatedMessage(fence(), operation, token(issuedAt, fence(), -120_000), issuedAt + 1));
  await pending;
  assert.equal(lock.attempts, 2);
  assert.equal(calls, 1);
  assert.equal(item.snapshot.state, "AUTHENTICATED");
  item.destroy();
});

await test("retryAfterMs negativo, enorme o inválido nunca crea reintentos infinitos", async () => {
  for (const retryAfterMs of [-1, 999_999_999, "invalid"]) {
    let calls = 0;
    const item = coordinator({
      tab: 280 + calls,
      hub: new TestHub(),
      transport: {
        refresh: async () => {
          calls += 1;
          if (calls === 1) throw { code: "MT01B_REFRESH_IN_PROGRESS", recoverable: true, retryAfterMs };
          return success(Date.now());
        },
        logout: async () => undefined,
      },
    });
    await item.initialize();
    assert.equal(calls, 2);
    assert.equal(item.snapshot.state, "AUTHENTICATED");
    item.destroy();
  }
});

await test("el módulo V2 no contiene APIs de persistencia de tokens", () => {
  const files = [
    "sessionCoordinator.ts",
    "sessionTypes.ts",
    "sessionStateMachine.ts",
    "sessionConfig.ts",
    "browserSessionAdapters.ts",
  ];
  const forbidden = ["local" + "Storage", "session" + "Storage", "indexed" + "DB"];
  for (const file of files) {
    const source = readFileSync(resolve("src/auth-v2", file), "utf8");
    for (const marker of forbidden) assert.equal(source.includes(marker), false, `${file} contiene ${marker}`);
  }
});

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
