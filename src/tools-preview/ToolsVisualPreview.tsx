import { useState } from "react";
import HubWorkspace from "@/hub/HubWorkspace";

const PREVIEW_APPLICATION_IDS = ["commercial-crm", "warehouses", "administration", "osi-survey", "archaeological-packing", "packing-calculator"] as const;
const CONSOLIDATED_HUB_ORIGIN = "https://osi-plus-erp-v17-git-feature-bb4db4-frederick-espinals-projects.vercel.app";
const APPROVED_COMMERCIAL_PIPELINE_URL = "https://osi-plus-v17-experience-preview-02a-hub.vercel.app/sales/pipeline";
const PREVIEW_LAUNCH_URLS = Object.freeze({
  "/commercial": APPROVED_COMMERCIAL_PIPELINE_URL,
  "/warehouses": `${CONSOLIDATED_HUB_ORIGIN}/warehouses`,
  "/administration": `${CONSOLIDATED_HUB_ORIGIN}/administration`,
  "/mobile/survey": "https://osi-plus-erp-v17-git-feature-642495-frederick-espinals-projects.vercel.app/mobile/survey",
});

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
      catalogPreviewLaunchUrls={PREVIEW_LAUNCH_URLS}
      onNavigate={setPathname}
      onLogout={() => setPathname("/hub")}
    />
  );
}
