import { resolveOsiHubMode } from "../../src/hub/hubMode";

const params = new URLSearchParams(window.location.search);
const gate = params.get("gate");
const vercelKey = params.get("vercelKey");
const environment = gate === "__ABSENT__"
  ? {}
  : {
      VITE_OSI_HUB_MODE: gate,
      ...(params.get("client") ? { VITE_CRM_PIPELINE_CLIENT_MODE: params.get("client") } : {}),
      ...(params.get("read") ? { VITE_CRM_PIPELINE_READ_MODE: params.get("read") } : {}),
      ...(params.get("batch") ? { VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH: params.get("batch") } : {}),
      ...(vercelKey ? { [vercelKey]: "synthetic" } : {}),
    };
const resolution = resolveOsiHubMode(environment, {
  hostname: params.get("host") || "127.0.0.1",
  vercelEnvironment: params.get("vercelEnv"),
  gitBranch: params.get("gitRef"),
});
document.body.dataset.mode = resolution.mode;
document.body.dataset.enabled = String(resolution.enabled);
document.body.dataset.valid = String(resolution.valid);
document.body.dataset.reason = resolution.reason;
document.getElementById("result")!.textContent = "Hub mode evaluated";
