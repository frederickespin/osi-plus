import { createElement } from "react";
import { createRoot } from "react-dom/client";
import AdminTenantMembershipModule from "../../src/admin-tenant/AdminTenantMembershipModule";
import { ADMIN_IDENTITY_INVITATION_MODES } from "../../src/admin-tenant/adminMode";
import type { AdminTenantApi } from "../../src/admin-tenant/adminApi";

const ADMIN_PERMISSIONS = [
  "membership:view",
  "membership:update:role",
  "membership:update:permissions",
  "membership:update:status",
];

declare global {
  interface Window {
    v17CorporateInvitationHarness?: Readonly<{ corporateCalls: number; localCalls: number }>;
  }
}

export function mountCorporateInvitationHarness() {
  let corporateCalls = 0;
  let localCalls = 0;
  const api = {
    list: async () => ({ data: [], total: 0, page: 1, pageSize: 20 }),
    update: async () => { throw new Error("unexpected update"); },
    listInvitations: async () => [],
    issueInvitation: async () => { localCalls += 1; throw new Error("local contract used"); },
    issueCorporateInvitation: async () => {
      corporateCalls += 1;
      return {
        invitation: {
          invitationRef: "33333333-3333-4333-8333-333333333333",
          role: "A" as const,
          grantedPermissions: ADMIN_PERMISSIONS,
          status: "PENDING" as const,
          expiresAt: "2026-08-31T12:00:00.000Z",
          createdAt: "2026-08-30T12:00:00.000Z",
        },
        activationPath: "/activate-admin#token=synthetic-one-time-token",
        shownOnce: true,
      };
    },
    revokeInvitation: async () => { throw new Error("unexpected revoke"); },
  } as unknown as AdminTenantApi;
  const root = document.getElementById("root") || document.body.appendChild(document.createElement("div"));
  root.id = "root";
  createRoot(root).render(createElement(AdminTenantMembershipModule, {
    authorization: "synthetic-admin-token",
    effectivePermissions: ADMIN_PERMISSIONS,
    deniedPermissions: [],
    invitationEnabled: true,
    invitationMode: ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT,
    onUnauthorized: () => undefined,
    api,
  }));
  Object.defineProperty(window, "v17CorporateInvitationHarness", {
    configurable: true,
    get: () => Object.freeze({ corporateCalls, localCalls }),
  });
}
