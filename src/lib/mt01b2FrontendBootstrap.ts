type FrontendAuthView = import("../auth-v2/frontendSessionRuntime.ts").FrontendAuthView;
type FrontendSessionRuntime = import("../auth-v2/frontendSessionRuntime.ts").FrontendSessionRuntime;

const DISABLED_VIEW: FrontendAuthView = Object.freeze({
  mode: "LEGACY",
  state: "DISABLED",
  reason: "BOOTSTRAP",
  authenticated: false,
  tenantId: null,
  membershipId: null,
  role: null,
  authorizationVersion: null,
  expiresAt: null,
});

const listeners = new Set<(view: FrontendAuthView) => void>();
const CLIENT_ENABLED = import.meta.env.VITE_MT01B2_CLIENT_ENABLED === "true";
let runtime: FrontendSessionRuntime | null = null;
let runtimePromise: Promise<FrontendSessionRuntime | null> | null = null;
let currentView = DISABLED_VIEW;

function enabled(): boolean {
  return CLIENT_ENABLED;
}

function publish(view: FrontendAuthView): void {
  currentView = { ...view };
  for (const listener of listeners) listener({ ...currentView });
}

async function loadRuntime(): Promise<FrontendSessionRuntime | null> {
  if (!enabled()) return null;
  if (runtime) return runtime;
  if (!runtimePromise) {
    runtimePromise = import("../auth-v2/frontendSessionRuntime.ts").then(({ createFrontendSessionRuntime }) => {
      const loaded = createFrontendSessionRuntime();
      loaded.subscribe(publish);
      runtime = loaded;
      return loaded;
    });
  }
  return runtimePromise;
}

export async function bootstrapMt01b2Frontend(): Promise<FrontendAuthView> {
  const loaded = await loadRuntime();
  if (!loaded) return { ...currentView };
  return loaded.start();
}

export async function notifyMt01b2LegacyLogin(): Promise<FrontendAuthView> {
  const loaded = await loadRuntime();
  if (!loaded) return { ...currentView };
  return loaded.legacyLoginCompleted();
}

export async function logoutMt01b2Frontend(): Promise<boolean> {
  const loaded = await loadRuntime();
  if (!loaded) return false;
  await loaded.logout();
  return true;
}

export async function mt01b2AuthenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const loaded = await loadRuntime();
  if (!loaded) throw Object.assign(new Error("MT-01B2 está desactivado."), { code: "MT01B2_CLIENT_DISABLED" });
  return loaded.authenticatedFetch(input, init);
}

export function getMt01b2FrontendAuthState(): FrontendAuthView {
  return { ...currentView };
}

export function subscribeMt01b2FrontendAuth(listener: (view: FrontendAuthView) => void): () => void {
  listeners.add(listener);
  listener({ ...currentView });
  return () => listeners.delete(listener);
}
