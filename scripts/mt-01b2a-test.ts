import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SessionCoordinator } from "../src/auth-v2/sessionCoordinator.ts";
import type {
  RefreshResponse,
  SessionActivity,
  SessionChannel,
  SessionClock,
  SessionLock,
  SessionTransport,
} from "../src/auth-v2/sessionTypes.ts";

const results: Array<{ name: string; passed: true }> = [];

async function test(name: string, action: () => void | Promise<void>): Promise<void> {
  await action();
  results.push({ name, passed: true });
}

function token(now: number, authorizationVersion = 1, ttlMs = 10 * 60_000): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ exp: Math.floor((now + ttlMs) / 1_000), authorizationVersion })}.signature`;
}

function success(now: number, authorizationVersion = 1): RefreshResponse {
  return {
    ok: true,
    token: token(now, authorizationVersion),
    session: { tenantId: "tenant-a", membershipId: "member-a", role: "A", authorizationVersion },
  };
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

function coordinator(options: {
  tab: number;
  hub: TestHub;
  transport: SessionTransport;
  lock?: SessionLock | null;
  enabled?: boolean;
  sessionActivity?: SessionActivity;
}): SessionCoordinator {
  return new SessionCoordinator({
    enabled: options.enabled ?? true,
    tabId: `tab_${options.tab}`,
    transport: options.transport,
    channel: options.hub.connect(),
    lock: options.lock === undefined ? new TestLock() : options.lock,
    clock,
    activity: options.sessionActivity ?? activity(),
    randomNonce: nextNonce,
    randomUnit: () => 0,
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
  let version = 1;
  let revoked = false;
  const transport: SessionTransport = {
    refresh: async () => {
      if (revoked) throw { code: "MT01B_AUTHORIZATION_CHANGED" };
      return success(Date.now(), version);
    },
    logout: async () => undefined,
  };
  const first = coordinator({ tab: 100, hub, transport });
  const second = coordinator({ tab: 101, hub, transport });
  await first.initialize();
  version = 2;
  await first.refresh();
  assert.equal(first.snapshot.authorizationVersion, 2);
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
    version: 1,
    type: "AUTHENTICATED",
    senderId: "attacker",
    nonce: "nonce_attacker_1",
    operationNonce: "nonce_unknown_1",
    issuedAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60_000,
    authorizationVersion: 1,
    accessToken: token(Date.now()),
  });
  const operationNonce = "nonce_known_operation";
  const issuedAt = Date.now();
  hub.inject({ version: 1, type: "REFRESH_STARTED", senderId: "peer", nonce: operationNonce, issuedAt });
  hub.inject({
    version: 1,
    type: "AUTHENTICATED",
    senderId: "peer",
    nonce: "nonce_forged_result",
    operationNonce,
    issuedAt,
    expiresAt: issuedAt + 123_000,
    authorizationVersion: 999,
    accessToken: token(issuedAt, 1),
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
      refresh: async () => ({ ...success(Date.now()), token: token(Date.now(), 1, -120_000) }),
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
      refresh: async () => { calls += 1; return success(Date.now(), 1, 30_000); },
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
