import { resolveOsiHubMode } from "../../src/hub/hubMode";

const params = new URLSearchParams(window.location.search);
const gate = params.get("gate");
const environment = gate === "__ABSENT__"
  ? {}
  : { VITE_OSI_HUB_MODE: gate, ...(params.get("vercel") === "1" ? { VERCEL: "1" } : {}) };
const resolution = resolveOsiHubMode(environment, { hostname: params.get("host") || "127.0.0.1" });
document.body.dataset.mode = resolution.mode;
document.body.dataset.enabled = String(resolution.enabled);
document.body.dataset.valid = String(resolution.valid);
document.body.dataset.reason = resolution.reason;
document.getElementById("result")!.textContent = "Hub mode evaluated";
