import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminTenantMembershipModule from "../../src/admin-tenant/AdminTenantMembershipModule";
import { saveSession } from "../../src/lib/sessionStore";
import { ADMIN_BROWSER_CATALOG, ADMIN_MEMBERSHIP_PERMISSIONS } from "../v17-hub/admin-membership-fixture";

declare global {
  interface Window {
    v17IdentityContextHarness?: Readonly<{
      switchContext(): void;
      resolveOriginalPatch(): void;
      snapshot(): Readonly<{ patches: number; originalAborted: boolean }>;
    }>;
  }
}

export function mountIdentityContextHarness() {
  const actorRefs = { A: "11111111-1111-4111-8111-111111111111", B: "44444444-4444-4444-8444-444444444444" };
  const memberRefs = { A: "22222222-2222-4222-8222-222222222222", B: "33333333-3333-4333-8333-333333333333" };
  const permissions = [...ADMIN_MEMBERSHIP_PERMISSIONS, "users:view", "users:edit"];
  let active: "A" | "B" = "A"; let patches = 0;
  let originalSignal: AbortSignal | null | undefined;
  let resolveOriginal: (response: Response) => void = () => undefined;
  let switchContext: () => void = () => undefined;
  const identity = (context: "A" | "B") => ({ membershipRef: memberRefs[context], version: 1, name: `Persona Empresa ${context}`, email: `${context.toLowerCase()}@example.invalid`, phone: "", contactEmail: null, documentType: "CEDULA", documentNumber: null, hasPhoto: false, photoVersion: 0, updatedAt: null, canEdit: true });
  const membership = (context: "A" | "B") => ({ membershipRef: memberRefs[context], name: `Persona Empresa ${context}`, email: `${context.toLowerCase()}@example.invalid`, role: "K", status: "ACTIVE", grantedPermissions: [], deniedPermissions: [], authorizationVersion: 1, updatedAt: "2026-10-30T12:00:00.000Z" });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith("/api/admin/user-identities?")) return json({ ok: true, data: [membership(active)], total: 1, page: 1, pageSize: 20, catalog: ADMIN_BROWSER_CATALOG,
      identities: [{ membershipRef: memberRefs[active], name: `Persona Empresa ${active}`, email: `${active.toLowerCase()}@example.invalid`, identityVersion: 1, hasPhoto: false, photoVersion: 0 }] });
    if (path === `/api/admin/user-identities/${memberRefs.A}` && init?.method === "PATCH") {
      patches += 1; originalSignal = init.signal;
      // Resolve despite abort: verifies the response fence beyond fetch cancellation.
      return new Promise<Response>((resolve) => { resolveOriginal = resolve; });
    }
    if (path === `/api/admin/user-identities/${memberRefs[active]}`) return json({ ok: true, identity: identity(active) });
    return originalFetch(input, init);
  };
  const storeContext = (context: "A" | "B") => saveSession({ role: "A", membershipRef: actorRefs[context], memberships: [{ membershipRef: actorRefs[context], tenantName: `Empresa ${context}`, role: "A", preferred: true }], token: `synthetic-context-${context}` });
  storeContext(active);
  const onUnauthorized = () => undefined;
  function Harness() {
    const [context, setContext] = useState<"A" | "B">("A");
    useEffect(() => { switchContext = () => { active = "B"; storeContext(active); setContext(active); }; return () => { switchContext = () => undefined; }; }, []);
    return createElement(AdminTenantMembershipModule, { authorization: `synthetic-context-${context}`, effectivePermissions: permissions, deniedPermissions: [], includeConfiguration: false, invitationEnabled: false, onUnauthorized });
  }
  Object.defineProperty(window, "v17IdentityContextHarness", { configurable: true, value: {
    switchContext: () => switchContext(),
    resolveOriginalPatch: () => resolveOriginal(json({ ok: true, identity: { ...identity("A"), version: 2, name: "Borrador Empresa A" } })),
    snapshot: () => ({ patches, originalAborted: originalSignal?.aborted === true }),
  } });
  const root = document.getElementById("root") || document.body.appendChild(document.createElement("div")); root.id = "root";
  createRoot(root).render(createElement(Harness));
}
