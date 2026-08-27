import { createHash } from "node:crypto";

export const V17_PRODUCTION_PILOT_MODE = "PRODUCTION_PILOT";
export const V17_PRODUCTION_PILOT_BATCH = "V17-PRODUCTION-GATES-04E1B-V1";

export const V17_PRODUCTION_PILOT_GATES = Object.freeze({
  ADMIN_IDENTITY_INVITATIONS: "ADMIN_IDENTITY_INVITATIONS",
  ADMIN_MEMBERSHIPS: "ADMIN_MEMBERSHIPS",
  CRM_CASE_MUTATIONS: "CRM_CASE_MUTATIONS",
});

const GATES = Object.freeze(Object.values(V17_PRODUCTION_PILOT_GATES).sort());
const TENANT_CODE = /^[A-Z0-9][A-Z0-9-]{2,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class V17ProductionPilotGateError extends Error {
  constructor(code = "V17_PRODUCTION_PILOT_CONFIGURATION_INVALID", status = 503) {
    super(code);
    this.name = "V17ProductionPilotGateError";
    this.code = code;
    this.status = status;
  }
}

function invalidConfiguration() {
  throw new V17ProductionPilotGateError();
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function exactProductionEnvironment(env) {
  return env?.VERCEL === "1"
    && env?.VERCEL_ENV === "production"
    && env?.VERCEL_GIT_COMMIT_REF === "main"
    && env?.MT01B_AUTH_MODE === "LEGACY"
    && env?.MT01B_TENANT_SWITCH_ENABLED === "false"
    && env?.VITE_MT01B2_CLIENT_ENABLED === "false"
    && env?.COMMERCIAL_TENANCY_WRITE_MODE === "TENANT_WRITE"
    && env?.COMMERCIAL_TENANCY_READ_MODE === "TENANT_READ"
    && env?.COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED"
    && env?.COMMERCIAL_TENANCY_ACTIVATION_BATCH === "MT-01C2B2-IPACKERS-DO-V1";
}

export function resolveV17ProductionPilotActivation(env = process.env) {
  if (!exactProductionEnvironment(env)
    || env.V17_PRODUCTION_PILOT_ACTIVATION_BATCH !== V17_PRODUCTION_PILOT_BATCH) {
    invalidConfiguration();
  }
  const raw = env.V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST;
  const expectedHash = env.V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST_SHA256;
  if (typeof raw !== "string" || !raw || typeof expectedHash !== "string" || !SHA256.test(expectedHash)
    || createHash("sha256").update(raw, "utf8").digest("hex") !== expectedHash) {
    invalidConfiguration();
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch { invalidConfiguration(); }
  if (!exactKeys(manifest, ["batch", "tenants", "version"])
    || manifest.batch !== V17_PRODUCTION_PILOT_BATCH || manifest.version !== 1
    || !Array.isArray(manifest.tenants) || manifest.tenants.length < 1 || manifest.tenants.length > 20
    || canonical(manifest) !== raw) {
    invalidConfiguration();
  }
  const seen = new Set();
  const tenants = new Map();
  for (const entry of manifest.tenants) {
    if (!exactKeys(entry, ["code", "gates"]) || !TENANT_CODE.test(entry.code)
      || seen.has(entry.code) || !Array.isArray(entry.gates) || entry.gates.length < 1
      || entry.gates.some((gate) => !GATES.includes(gate))
      || new Set(entry.gates).size !== entry.gates.length
      || JSON.stringify([...entry.gates].sort()) !== JSON.stringify(entry.gates)) {
      invalidConfiguration();
    }
    seen.add(entry.code);
    tenants.set(entry.code, new Set(entry.gates));
  }
  if (JSON.stringify([...tenants.keys()].sort()) !== JSON.stringify([...tenants.keys()])) invalidConfiguration();
  return Object.freeze({ batch: manifest.batch, version: manifest.version, tenants });
}

export function requireV17ProductionPilotTenant(activation, tenantCode, gate) {
  const code = String(tenantCode || "");
  if (!GATES.includes(gate) || !activation?.tenants?.get(code)?.has(gate)) {
    throw new V17ProductionPilotGateError("V17_PRODUCTION_PILOT_ACCESS_FORBIDDEN", 403);
  }
  return code;
}

export function requireV17ProductionPilotContext(activation, context, gate, permissionsByRole) {
  const role = String(context?.role || "");
  const required = permissionsByRole?.[role];
  const denied = new Set(context?.deniedPermissions || []);
  const effective = new Set(context?.effectivePermissions || context?.permissions || []);
  const active = String(context?.userStatus || "") === "ACTIVE"
    && String(context?.membershipStatus || "") === "ACTIVE"
    && String(context?.tenantStatus || "") === "ACTIVE";
  if (!active || !Array.isArray(required) || required.length < 1
    || required.some((permission) => denied.has(permission) || !effective.has(permission))) {
    throw new V17ProductionPilotGateError("V17_PRODUCTION_PILOT_ACCESS_FORBIDDEN", 403);
  }
  requireV17ProductionPilotTenant(activation, context?.tenantCode, gate);
  return context;
}
