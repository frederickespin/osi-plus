import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

type Fence = {
  sessionId: string;
  sessionEpoch: string;
  subject: string;
  tenantId: string;
  membershipId: string;
  authorizationVersion: number;
};

const baseFence = (suffix = "a"): Fence => ({
  sessionId: `session-${suffix}`,
  sessionEpoch: `epoch-${suffix}`,
  subject: `user-${suffix}`,
  tenantId: `tenant-${suffix}`,
  membershipId: `membership-${suffix}`,
  authorizationVersion: 1,
});

function json(payload: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(payload) };
}

function token(fence: Fence, ttlMs = 10 * 60_000, nonce = "server-token") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Date.now();
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    ver: 2,
    typ: "access",
    sid: fence.sessionId,
    sub: fence.subject,
    tenantId: fence.tenantId,
    membershipId: fence.membershipId,
    role: "V",
    authorizationVersion: fence.authorizationVersion,
    iat: Math.floor(now / 1_000),
    exp: Math.floor((now + ttlMs) / 1_000),
    jti: nonce,
  })}.signature`;
}

function success(fence: Fence, accessToken = token(fence)) {
  return {
    ok: true,
    token: accessToken,
    user: { id: fence.subject, name: "Browser Test", role: "V" },
    session: {
      tenantId: fence.tenantId,
      membershipId: fence.membershipId,
      role: "V",
      authorizationVersion: fence.authorizationVersion,
    },
  };
}

async function harnessPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/tests/mt01b2b/harness.html");
  await expect(page.locator("#status")).toHaveText("ready");
  return page;
}

async function create(page: Page, channelName: string, session: Fence, options: Record<string, unknown> = {}) {
  return page.evaluate(({ channelName: channel, session: selected, options: rest }) =>
    window.mt01b2bHarness.create({ channelName: channel, session: selected, ...rest }),
  { channelName, session, options });
}

async function snapshots(pages: Page[]) {
  return Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.snapshot())));
}

async function tokens(pages: Page[]) {
  return Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.accessToken())));
}

test("LEGACY no carga coordinador, canales ni endpoints V2", async ({ context }) => {
  let v2Calls = 0;
  await context.route(/\/api\/auth\/(?:refresh|logout|session\/upgrade)/, async (route) => {
    v2Calls += 1;
    await route.fulfill(json({ ok: false, error: "unexpected" }, 500));
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const Native = window.BroadcastChannel;
    Object.defineProperty(window, "__mt01b2Channels", { value: 0, writable: true });
    class TrackedChannel extends Native {
      constructor(name: string) {
        super(name);
        (window as unknown as { __mt01b2Channels: number }).__mt01b2Channels += 1;
      }
    }
    window.BroadcastChannel = TrackedChannel;
  });
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(v2Calls).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __mt01b2Channels: number }).__mt01b2Channels)).toBe(0);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("frontendSessionRuntime")))).toBe(false);
});

test("20 pestañas coordinan exactamente un refresh con Web Locks", async ({ context, browserName }) => {
  const session = baseFence(`single-${browserName}`);
  const accessToken = token(session, 10 * 60_000, "single-flight");
  let calls = 0;
  await context.route("**/__mt01b2b/refresh", async (route) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill(json(success(session, accessToken)));
  });
  const pages = await Promise.all(Array.from({ length: 20 }, () => harnessPage(context)));
  const supported = await pages[0]!.evaluate(() => window.mt01b2bHarness.webLocks());
  test.skip(!supported, `${browserName} no ofrece Web Locks`);
  const channel = `mt01b2b-single-${browserName}-${Date.now()}`;
  await Promise.all(pages.map((page) => create(page, channel, session)));
  await Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.initialize())));
  expect(calls).toBe(1);
  expect(new Set(await tokens(pages))).toEqual(new Set([accessToken]));
  for (const page of pages) {
    const storage = await page.evaluate(() => window.mt01b2bHarness.storage());
    expect(JSON.stringify(storage)).not.toContain(accessToken);
    await page.evaluate(() => window.mt01b2bHarness.destroy());
  }
});

test("caída de pestaña líder libera el lock y converge", async ({ context, browserName }) => {
  const session = baseFence(`leader-${browserName}`);
  const finalToken = token(session, 10 * 60_000, "replacement-leader");
  let calls = 0;
  let leaderPage: Page | null = null;
  let releaseFirst: (() => void) | null = null;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await context.route("**/__mt01b2b/refresh", async (route) => {
    calls += 1;
    if (calls === 1) {
      leaderPage = route.request().frame().page();
      await firstBlocked;
      if (!leaderPage.isClosed()) await route.fulfill(json(success(session, token(session, 10 * 60_000, "old-leader"))));
      return;
    }
    await route.fulfill(json(success(session, finalToken)));
  });
  const pages = await Promise.all(Array.from({ length: 5 }, () => harnessPage(context)));
  const supported = await pages[0]!.evaluate(() => window.mt01b2bHarness.webLocks());
  test.skip(!supported, `${browserName} no ofrece Web Locks`);
  const channel = `mt01b2b-leader-${browserName}-${Date.now()}`;
  await Promise.all(pages.map((page) => create(page, channel, session)));
  const pending = pages.map((page) => page.evaluate(() => window.mt01b2bHarness.initialize()).catch(() => null));
  await expect.poll(() => calls).toBe(1);
  await leaderPage!.close();
  releaseFirst!();
  const remaining = pages.filter((page) => !page.isClosed());
  await Promise.all(pending);
  await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await tokens(remaining)).filter(Boolean).length).toBe(remaining.length);
  expect(new Set(await tokens(remaining))).toEqual(new Set([finalToken]));
});

test("fallback sin Web Locks converge mediante el servidor", async ({ context, browserName }) => {
  const session = baseFence(`fallback-${browserName}`);
  const winningToken = token(session, 10 * 60_000, "fallback-winner");
  let calls = 0;
  let busy = false;
  await context.route("**/__mt01b2b/refresh", async (route) => {
    calls += 1;
    if (busy) {
      await route.fulfill(json({ ok: false, error: "MT01B_REFRESH_IN_PROGRESS", recoverable: true, retryAfterMs: 50 }, 409));
      return;
    }
    busy = true;
    await new Promise((resolve) => setTimeout(resolve, 80));
    busy = false;
    await route.fulfill(json(success(session, winningToken)));
  });
  const pages = await Promise.all(Array.from({ length: 8 }, () => harnessPage(context)));
  const channel = `mt01b2b-fallback-${browserName}-${Date.now()}`;
  await Promise.all(pages.map((page) => create(page, channel, session, { noLocks: true })));
  await Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.initialize())));
  expect(calls).toBeGreaterThan(1);
  expect(calls).toBeLessThanOrEqual(32);
  expect(new Set(await tokens(pages))).toEqual(new Set([winningToken]));
});

test("logout se propaga y limpia todas las pestañas", async ({ context, browserName }) => {
  const session = baseFence(`logout-${browserName}`);
  let logoutCalls = 0;
  await context.route("**/__mt01b2b/refresh", (route) => route.fulfill(json(success(session))));
  await context.route("**/__mt01b2b/logout", async (route) => { logoutCalls += 1; await route.fulfill(json({ ok: true })); });
  const pages = await Promise.all(Array.from({ length: 3 }, () => harnessPage(context)));
  const channel = `mt01b2b-logout-${browserName}-${Date.now()}`;
  await Promise.all(pages.map((page) => create(page, channel, session)));
  await Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.initialize())));
  await pages[0]!.evaluate(() => window.mt01b2bHarness.logout());
  await expect.poll(async () => (await snapshots(pages)).every((item) => item?.state === "LOGGED_OUT")).toBe(true);
  expect((await tokens(pages)).every((value) => value == null)).toBe(true);
  expect(logoutCalls).toBe(1);
});

test("nuevo usuario rechaza respuesta y mensajes tardíos de la sesión anterior", async ({ context, browserName }) => {
  const oldSession = baseFence(`old-${browserName}`);
  const newSession = baseFence(`new-${browserName}`);
  let resolveOld: (() => void) | null = null;
  const oldBlocked = new Promise<void>((resolve) => { resolveOld = resolve; });
  let calls = 0;
  await context.route("**/__mt01b2b/refresh", async (route) => {
    calls += 1;
    if (calls === 1) {
      await oldBlocked;
      await route.fulfill(json(success(oldSession, token(oldSession, 10 * 60_000, "late-old"))));
    } else {
      await route.fulfill(json(success(newSession, token(newSession, 10 * 60_000, "current-new"))));
    }
  });
  const page = await harnessPage(context);
  const channel = `mt01b2b-relogin-${browserName}-${Date.now()}`;
  await create(page, channel, oldSession);
  const pendingOld = page.evaluate(() => window.mt01b2bHarness.initialize());
  await expect.poll(() => calls).toBe(1);
  await create(page, channel, newSession);
  const pendingNew = page.evaluate(() => window.mt01b2bHarness.initialize());
  resolveOld!();
  await Promise.all([pendingOld.catch(() => null), pendingNew]);
  const installed = await page.evaluate(() => window.mt01b2bHarness.accessToken());
  expect(installed).toContain(".");
  expect(installed).not.toBe(token(oldSession, 10 * 60_000, "late-old"));
  const snapshot = await page.evaluate(() => window.mt01b2bHarness.snapshot());
  expect(snapshot?.state).toBe("AUTHENTICATED");
});

test("offline, reconexión, visibilidad y expiración usan un ciclo acotado", async ({ context, browserName }) => {
  const session = baseFence(`network-${browserName}`);
  let calls = 0;
  await context.route("**/__mt01b2b/refresh", async (route) => { calls += 1; await route.fulfill(json(success(session))); });
  const page = await harnessPage(context);
  await create(page, `mt01b2b-network-${browserName}-${Date.now()}`, session);
  await context.setOffline(true);
  await page.evaluate(() => window.mt01b2bHarness.initialize());
  expect((await page.evaluate(() => window.mt01b2bHarness.snapshot()))?.state).toBe("OFFLINE");
  expect(calls).toBe(0);
  await context.setOffline(false);
  await page.evaluate(() => window.mt01b2bHarness.notifyOnline());
  expect((await page.evaluate(() => window.mt01b2bHarness.snapshot()))?.state).toBe("AUTHENTICATED");
  expect(calls).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => window.mt01b2bHarness.maintain());
  expect(calls).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
});

test("cierre, reapertura y destroy no persisten tokens ni dejan recursos", async ({ context, browserName }) => {
  const session = baseFence(`reopen-${browserName}`);
  const accessToken = token(session, 10 * 60_000, "not-persistent");
  await context.route("**/__mt01b2b/refresh", (route) => route.fulfill(json(success(session, accessToken))));
  let page = await harnessPage(context);
  const channel = `mt01b2b-reopen-${browserName}-${Date.now()}`;
  await create(page, channel, session);
  await page.evaluate(() => window.mt01b2bHarness.initialize());
  expect(await page.evaluate(() => window.mt01b2bHarness.accessToken())).toBe(accessToken);
  expect(JSON.stringify(await page.evaluate(() => window.mt01b2bHarness.storage()))).not.toContain(accessToken);
  await page.evaluate(() => window.mt01b2bHarness.destroy());
  expect(await page.evaluate(() => window.mt01b2bHarness.resources())).toEqual({ activities: 0, channels: 0, coordinators: 0 });
  await page.close();
  page = await harnessPage(context);
  expect(await page.evaluate(() => window.mt01b2bHarness.accessToken())).toBeNull();
  expect(JSON.stringify(await page.evaluate(() => window.mt01b2bHarness.storage()))).not.toContain(accessToken);
});

test("revocación administrativa cruza pestañas sin conservar token", async ({ context, browserName }) => {
  const session = baseFence(`revoke-${browserName}`);
  await context.route("**/__mt01b2b/refresh", (route) => route.fulfill(json(success(session))));
  const pages = await Promise.all([harnessPage(context), harnessPage(context)]);
  const channel = `mt01b2b-revoke-${browserName}-${Date.now()}`;
  await Promise.all(pages.map((page) => create(page, channel, session)));
  await Promise.all(pages.map((page) => page.evaluate(() => window.mt01b2bHarness.initialize())));
  await pages[0]!.evaluate(() => window.mt01b2bHarness.reauthenticate());
  await expect.poll(async () => (await snapshots(pages)).every((item) => item?.state === "REAUTH_REQUIRED")).toBe(true);
  expect((await tokens(pages)).every((value) => value == null)).toBe(true);
});

test("mensajes fuera de orden no reemplazan el token más nuevo", async ({ context, browserName }) => {
  const session = baseFence(`order-${browserName}`);
  const firstToken = token(session, 10 * 60_000, "initial");
  await context.route("**/__mt01b2b/refresh", (route) => route.fulfill(json(success(session, firstToken))));
  const page = await harnessPage(context);
  const channel = `mt01b2b-order-${browserName}-${Date.now()}`;
  await create(page, channel, session);
  await page.evaluate(() => window.mt01b2bHarness.initialize());
  const now = Date.now();
  const newerToken = token(session, 10 * 60_000, "newer");
  const olderToken = token(session, 10 * 60_000, "older");
  await page.evaluate(({ channelName, selected, issuedAt, newer, older }) => {
    const common = { version: 2, senderId: "peer-browser", ...selected };
    window.mt01b2bHarness.broadcast(channelName, { ...common, type: "REFRESH_STARTED", nonce: "operation-new", issuedAt });
    window.mt01b2bHarness.broadcast(channelName, { ...common, type: "REFRESH_STARTED", nonce: "operation-old", issuedAt });
    window.mt01b2bHarness.broadcast(channelName, { ...common, type: "AUTHENTICATED", nonce: "message-new", operationNonce: "operation-new", issuedAt: issuedAt + 10, expiresAt: Math.floor((issuedAt + 600_000) / 1_000) * 1_000, accessToken: newer });
    window.mt01b2bHarness.broadcast(channelName, { ...common, type: "AUTHENTICATED", nonce: "message-old", operationNonce: "operation-old", issuedAt: issuedAt + 5, expiresAt: Math.floor((issuedAt + 600_000) / 1_000) * 1_000, accessToken: older });
  }, { channelName: channel, selected: session, issuedAt: now, newer: newerToken, older: olderToken });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.mt01b2bHarness.accessToken())).toBe(newerToken);
});

test("runtime integrado acepta upgrade y vuelve limpiamente a LEGACY si servidor lo desactiva", async ({ context, browserName }) => {
  let upgrades = 0;
  await context.route("**/__mt01b2b/upgrade", async (route: Route) => {
    upgrades += 1;
    await route.fulfill(json({ ok: false, error: "MT01B_AUTH_V2_DISABLED" }, 409));
  });
  const page = await harnessPage(context);
  const result = await page.evaluate((channel) => window.mt01b2bHarness.createRuntime(channel), `mt01b2b-runtime-${browserName}-${Date.now()}`);
  expect(upgrades).toBe(1);
  expect(result).toMatchObject({ mode: "LEGACY", state: "LEGACY", reason: "SERVER_DISABLED", authenticated: false });
  expect(await page.evaluate(() => window.mt01b2bHarness.resources())).toEqual({ activities: 0, channels: 0, coordinators: 0 });
});

test("logout cancela el refresh programado del runtime integrado", async ({ context, browserName }) => {
  const session = baseFence(`timer-${browserName}`);
  let upgradeCalls = 0;
  let refreshCalls = 0;
  let logoutCalls = 0;
  await context.route("**/__mt01b2b/upgrade", async (route) => {
    upgradeCalls += 1;
    expect(route.request().headers().authorization).toBe("Bearer legacy-test-token");
    await route.fulfill(json(success(session, token(session, 61_000, "scheduled"))));
  });
  await context.route("**/__mt01b2b/refresh", async (route) => {
    refreshCalls += 1;
    await route.fulfill(json(success(session)));
  });
  await context.route("**/__mt01b2b/logout", async (route) => {
    logoutCalls += 1;
    await route.fulfill(json({ ok: true }));
  });
  const page = await harnessPage(context);
  const result = await page.evaluate((channel) => window.mt01b2bHarness.createRuntime(channel), `mt01b2b-timer-${browserName}-${Date.now()}`);
  expect(result).toMatchObject({ mode: "V2", state: "AUTHENTICATED", authenticated: true });
  await page.evaluate(() => window.mt01b2bHarness.logout());
  await page.waitForTimeout(1_500);
  expect(upgradeCalls).toBe(1);
  expect(refreshCalls).toBe(0);
  expect(logoutCalls).toBe(1);
  expect(await page.evaluate(() => window.mt01b2bHarness.resources())).toEqual({ activities: 0, channels: 0, coordinators: 0 });
  expect(JSON.stringify(await page.evaluate(() => window.mt01b2bHarness.storage()))).not.toContain("scheduled");
});
