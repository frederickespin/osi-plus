import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH, ADMIN_MEMBERSHIP_PREVIEW_BRANCH } from "../shared/adminMembershipPreview.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({
  absWorkingDir: root, entryPoints: ["src/admin-tenant/adminMode.ts"], bundle: true,
  platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent",
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const environment = {
  VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL",
  VITE_ADMIN_MEMBERSHIP_PREVIEW_BATCH: ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  VITE_MT01B2_CLIENT_ENABLED: "false",
};
const runtime = { hostname: "osi-test-preview.vercel.app", vercelEnvironment: "preview", gitBranch: ADMIN_MEMBERSHIP_PREVIEW_BRANCH };
const mode = (env = environment, run = runtime) => api.resolveAdminTenantMembershipMode(env, run.hostname, run);

test("Preview de membresías requiere ambiente, rama, batch y cliente de sesión compatibles", () => {
  assert.equal(mode(), "PREVIEW_REHEARSAL");
  assert.equal(mode(environment, { ...runtime, gitBranch: "feature/v17-consolidated-preview" }), "PREVIEW_REHEARSAL");
  assert.equal(api.isAdminTenantMembershipEnabled(environment, runtime.hostname, runtime), true);
  for (const patch of [{ vercelEnvironment: "production" }, { vercelEnvironment: null }, { gitBranch: "main" },
    { gitBranch: `${ADMIN_MEMBERSHIP_PREVIEW_BRANCH}-suffix` }, { hostname: "localhost" },
    { hostname: "osi-test-preview.vercel.app.attacker.test" }]) {
    assert.equal(mode(environment, { ...runtime, ...patch }), "DISABLED", JSON.stringify(patch));
  }
  for (const patch of [{ VITE_ADMIN_MEMBERSHIP_PREVIEW_BATCH: "other" }, { VITE_MT01B2_CLIENT_ENABLED: "true" },
    { VITE_MT01B2_CLIENT_ENABLED: undefined }, { VITE_ADMIN_TENANT_MEMBERSHIP_MODE: undefined }]) {
    assert.equal(mode({ ...environment, ...patch }), "DISABLED", JSON.stringify(patch));
  }
});

test("habilitar membresías no habilita invitaciones en Preview", () => {
  for (const invitationMode of [undefined, "DISABLED", "PREVIEW_REHEARSAL", "LOCAL_ONLY", "PRODUCTION_PILOT"]) {
    const env = { ...environment, VITE_ADMIN_IDENTITY_INVITATION_MODE: invitationMode };
    assert.equal(api.resolveAdminIdentityInvitationMode(env, runtime.hostname, runtime), "DISABLED");
    assert.equal(api.isAdminIdentityInvitationEnabled(env, runtime.hostname, runtime), false);
  }
  assert.equal(Object.hasOwn(api.ADMIN_IDENTITY_INVITATION_MODES, "PREVIEW_REHEARSAL"), false);
});

test("la configuración local conserva su alcance de loopback", () => {
  const env = { VITE_ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY", VITE_ADMIN_IDENTITY_INVITATION_MODE: "LOCAL_ONLY" };
  const local = { hostname: "localhost", vercelEnvironment: null, gitBranch: null };
  assert.equal(mode(env, local), "LOCAL_ONLY");
  assert.equal(mode({ ...env, VERCEL: "1" }, local), "DISABLED");
  assert.equal(mode(env, runtime), "DISABLED");
  assert.equal(api.resolveAdminIdentityInvitationMode(env, local.hostname, local), "LOCAL_ONLY");
});
