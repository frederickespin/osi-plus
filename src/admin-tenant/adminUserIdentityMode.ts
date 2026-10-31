import { isAdminTenantMembershipEnabled } from "./adminMode";

export function isAdminUserIdentityEnabled(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname, runtime = {
  vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
  gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
}) {
  if (!isAdminTenantMembershipEnabled(environment, hostname, { ...runtime, hostname })) return false;
  const mode = environment.VITE_ADMIN_USER_IDENTITY_MODE;
  if (mode === "LOCAL_ONLY") return !runtime.vercelEnvironment && !runtime.gitBranch && !Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_")) && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  return mode === "PREVIEW_REHEARSAL" && environment.VITE_ADMIN_USER_IDENTITY_BATCH === "V17-ADMINISTRATION-IDENTITY-19C"
    && runtime.vercelEnvironment === "preview" && ["feature/v17-administration-identity-19c", "feature/v17-consolidated-preview"].includes(runtime.gitBranch || "")
    && /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/u.test(hostname);
}
