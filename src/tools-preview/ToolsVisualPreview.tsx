import { useState } from "react";
import HubWorkspace from "@/hub/HubWorkspace";

const PREVIEW_APPLICATION_IDS = ["commercial-crm", "warehouses", "administration", "osi-survey", "archaeological-packing", "packing-calculator"] as const;

export default function ToolsVisualPreview() {
  const [pathname, setPathname] = useState("/hub");

  return (
    <HubWorkspace
      userName="FREDERICK ESPINAL"
      accessContext={{
        role: "A",
        effectivePermissions: [
          "pipeline:view",
          "inventory:stock:view",
          "assets:instance:view",
          "membership:view",
          "fleet:view",
          "services:catalog:view",
          "services:packages:view",
          "services:materials:view",
          "costing:rules:view",
          "logistics:rules:view",
          "communications:templates:view",
          "personnel:profiles:view",
          "personnel:capabilities:view",
          "scheduling:policies:view",
          "survey:assignment:view",
        ],
        deniedPermissions: [],
        source: "SERVER_EFFECTIVE_PERMISSIONS",
      }}
      crmReadEnabled={false}
      mode="PREVIEW_REHEARSAL"
      pathname={pathname}
      catalogPreviewApplicationIds={PREVIEW_APPLICATION_IDS}
      onNavigate={setPathname}
      onLogout={() => setPathname("/hub")}
    />
  );
}
