import { useState } from "react";
import HubWorkspace from "@/hub/HubWorkspace";

export default function ToolsVisualPreview() {
  const [pathname, setPathname] = useState("/tools");

  return (
    <HubWorkspace
      userName="FREDERICK ESPINAL"
      accessContext={{
        role: "A",
        effectivePermissions: ["pipeline:view"],
        deniedPermissions: [],
        source: "SERVER_EFFECTIVE_PERMISSIONS",
      }}
      crmReadEnabled={false}
      mode="PREVIEW_REHEARSAL"
      pathname={pathname}
      onNavigate={setPathname}
      onLogout={() => setPathname("/hub")}
    />
  );
}
