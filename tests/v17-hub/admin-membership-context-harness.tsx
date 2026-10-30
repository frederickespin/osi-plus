import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminTenantMembershipModule from "../../src/admin-tenant/AdminTenantMembershipModule";
import type { AdminMembership, AdminTenantApi } from "../../src/admin-tenant/adminApi";
import { ADMIN_BROWSER_CATALOG, ADMIN_MEMBERSHIP_PERMISSIONS } from "./admin-membership-fixture";

declare global {
  interface Window {
    v17MembershipContextHarness?: Readonly<{
      switchContext(): void;
      resolveOriginalPatch(): void;
      snapshot(): Readonly<{ patches: number; originalAborted: boolean }>;
    }>;
  }
}

export function mountMembershipContextHarness() {
  const first: AdminMembership = {
    membershipRef: "22222222-2222-4222-8222-222222222222", name: "Persona Empresa A", email: "a@example.invalid",
    role: "K", status: "ACTIVE", grantedPermissions: [], deniedPermissions: [], authorizationVersion: 1,
    updatedAt: "2026-10-30T12:00:00.000Z",
  };
  const second: AdminMembership = {
    ...first, membershipRef: "33333333-3333-4333-8333-333333333333", name: "Persona Empresa B", email: "b@example.invalid",
  };
  let patches = 0;
  let originalSignal: AbortSignal | undefined;
  let resolveOriginal: (row: AdminMembership) => void = () => undefined;
  let switchContext: () => void = () => undefined;
  const firstApi = {
    list: async () => ({ data: [first], total: 1, page: 1, pageSize: 20, catalog: ADMIN_BROWSER_CATALOG }),
    update: async (_ref: string, _input: unknown, signal?: AbortSignal) => {
      patches += 1;
      originalSignal = signal;
      // Deliberately resolve after abort to verify the UI's response fence.
      return new Promise<AdminMembership>((resolve) => { resolveOriginal = resolve; });
    },
  } as unknown as AdminTenantApi;
  const secondApi = {
    list: async () => ({ data: [second], total: 1, page: 1, pageSize: 20, catalog: ADMIN_BROWSER_CATALOG }),
    update: async () => { patches += 1; throw new Error("Unexpected update in second context"); },
  } as unknown as AdminTenantApi;
  const onUnauthorized = () => undefined;
  function Harness() {
    const [context, setContext] = useState("A");
    useEffect(() => {
      switchContext = () => setContext("B");
      return () => { switchContext = () => undefined; };
    }, []);
    return createElement(AdminTenantMembershipModule, {
      authorization: `synthetic-context-${context}`,
      effectivePermissions: ADMIN_MEMBERSHIP_PERMISSIONS,
      deniedPermissions: [],
      includeConfiguration: false,
      invitationEnabled: false,
      onUnauthorized,
      api: context === "A" ? firstApi : secondApi,
    });
  }
  const root = document.getElementById("root") || document.body.appendChild(document.createElement("div"));
  root.id = "root";
  Object.defineProperty(window, "v17MembershipContextHarness", {
    configurable: true,
    value: {
      switchContext: () => switchContext(),
      resolveOriginalPatch: () => resolveOriginal({ ...first, status: "SUSPENDED", authorizationVersion: 2 }),
      snapshot: () => ({ patches, originalAborted: originalSignal?.aborted === true }),
    },
  });
  createRoot(root).render(createElement(Harness));
}
