import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { RelationalPipelineModule } from "../../src/crm-relational/RelationalPipelineModule";
import { isRelationalCrmClientEnabled, resolveCrmPipelineClientMode } from "../../src/crm-relational/clientMode";
import type { UserRole } from "../../src/types/osi.types";

const params = new URLSearchParams(window.location.search);
const role = (params.get("role") === "V" ? "V" : "A") as UserRole;
localStorage.setItem("osi-plus.token", "[REDACTED]");
localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Actor", role, membershipRef: "11111111-1111-4111-8111-111111111111", memberships: [{ membershipRef: "11111111-1111-4111-8111-111111111111", tenantName: "Tenant sintético", role, preferred: true }] }));
const forcedDisabled = params.get("disabled") === "1";
const gateValue = params.get("gate");
const gateEnvironment = gateValue === null
  ? null
  : gateValue === "__ABSENT__"
    ? {}
    : { VITE_CRM_PIPELINE_CLIENT_MODE: gateValue, ...(params.get("vercel") === "1" ? { VERCEL: "1" } : {}) };
const mode = forcedDisabled
  ? resolveCrmPipelineClientMode({ VITE_CRM_PIPELINE_CLIENT_MODE: "DISABLED" }, { hostname: "127.0.0.1" })
  : gateEnvironment
    ? resolveCrmPipelineClientMode(gateEnvironment, { hostname: params.get("host") || "127.0.0.1" })
    : resolveCrmPipelineClientMode({ VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY" }, { hostname: "127.0.0.1" });
const root = createRoot(document.getElementById("root")!);
document.body.dataset.crmMode = mode.mode;
document.body.dataset.crmModeValid = String(mode.valid);
root.render(isRelationalCrmClientEnabled(mode)
  ? <RelationalPipelineModule userRole={role} onUnauthorized={() => document.body.setAttribute("data-unauthorized", "true")} />
  : <div data-testid="crm-disabled">CRM relacional desactivado</div>);
