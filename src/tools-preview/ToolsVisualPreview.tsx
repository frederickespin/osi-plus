import { useState } from "react";
import HubWorkspace from "@/hub/HubWorkspace";
import type { HubAccessContext } from "@/hub/hubAccess";

const PREVIEW_ACCESS: HubAccessContext = Object.freeze({
  role: "A",
  effectivePermissions: ["pipeline:view"],
  deniedPermissions: [],
  source: "SERVER_EFFECTIVE_PERMISSIONS",
});

export default function ToolsVisualPreview() {
  const [pathname, setPathname] = useState("/tools");

  return (
    <HubWorkspace
      userName="FREDERICK ESPINAL"
      authorization=""
      accessContext={PREVIEW_ACCESS}
      crmReadEnabled={false}
      mode="PREVIEW_REHEARSAL"
      pathname={pathname}
      onNavigate={setPathname}
      onLogout={() => setPathname("/tools")}
    />
  );
}
