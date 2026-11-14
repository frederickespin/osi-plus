import { useMemo, useState } from "react";
import HubWorkspace from "@/hub/HubWorkspace";
import { withPreviewHubReturn } from "@/hub/previewHubReturn";
import { V17_TOOLS_VISUAL_PREVIEW_ROUTE } from "./clientMode";

const PREVIEW_APPLICATION_IDS = ["commercial-crm", "warehouses", "administration", "osi-survey", "visual-inventory", "archaeological-packing", "packing-calculator"] as const;
const CONSOLIDATED_HUB_ORIGIN = "https://osi-plus-erp-v17-git-feature-bb4db4-frederick-espinals-projects.vercel.app";
const SURVEY_PREVIEW_URL = "https://osi-plus-erp-v17-git-feature-642495-frederick-espinals-projects.vercel.app/mobile/survey";

export default function ToolsVisualPreview() {
  const [pathname, setPathname] = useState("/hub");
  const previewLaunchUrls = useMemo(() => {
    const hubUrl = new URL(V17_TOOLS_VISUAL_PREVIEW_ROUTE, globalThis.location.origin).toString();
    return Object.freeze({
      "/warehouses": withPreviewHubReturn(`${CONSOLIDATED_HUB_ORIGIN}/warehouses`, hubUrl),
      "/administration": withPreviewHubReturn(`${CONSOLIDATED_HUB_ORIGIN}/administration`, hubUrl),
      "/mobile/survey": withPreviewHubReturn(SURVEY_PREVIEW_URL, hubUrl),
    });
  }, []);

  return (
    <HubWorkspace
      userName="FREDERICK ESPINAL"
      accessContext={{
        role: "A",
        effectivePermissions: [
          "pipeline:view",
          "inventory:stock:view",
          "assets:instance:view",
          "customer-custody:view",
          "customer-custody:receive",
          "customer-custody:operate",
          "warehouse-access:manage",
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
      catalogPreviewLaunchUrls={previewLaunchUrls}
      onNavigate={setPathname}
      onLogout={() => setPathname("/hub")}
    />
  );
}
