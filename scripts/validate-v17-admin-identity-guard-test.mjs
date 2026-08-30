import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17AdminIdentityGuard } from "./validate-v17-admin-identity-guard.mjs";

const results = [];
const read = (path) => readFileSync(resolve(path), "utf8");
function check(name, value) { results.push({ name, passed: Boolean(value) }); if (!value) throw new Error(name); }
function rejected(name, path, mutate, expected) {
  let error; try { validateV17AdminIdentityGuard({ overrides: { [path]: mutate(read(path)) } }); } catch (caught) { error = caught; }
  check(name, expected.test(String(error?.message || "")));
}

check("baseline aprobada", validateV17AdminIdentityGuard().ok);
const migration = "prisma/migrations/20260827020000_v17_admin_identity_invitation/migration.sql";
rejected("token plaintext bloqueado", migration, (s) => s.replace('"token_hash" CHAR(64) NOT NULL', '"token" TEXT NOT NULL'), /token|SQL/);
rejected("expiración mayor de 24h bloqueada", migration, (s) => s.replace("INTERVAL '24 hours'", "INTERVAL '48 hours'"), /SQL/);
rejected("pending único eliminado bloqueado", migration, (s) => s.replace("admin_identity_invitations_one_pending_email_key", "removed_pending_key"), /SQL/);
rejected("identidad mutable bloqueada", migration, (s) => s.replace('BEFORE UPDATE ON "osi"."admin_identity_invitations"', 'AFTER INSERT ON "osi"."admin_identity_invitations"'), /SQL/);
const domain = "api/_lib/adminIdentityInvitationDomain.js";
rejected("aleatoriedad débil bloqueada", domain, (s) => s.replace("randomBytes(32)", "Buffer.alloc(32)"), /aleatorio/);
rejected("consumo sin estado bloqueado", domain, (s) => s.replace('WHERE "id"=CAST(${invitation.id} AS uuid) AND "tenant_id"=${invitation.tenant_id} AND "status"=\'PENDING\'', 'WHERE "id"=CAST(${invitation.id} AS uuid) AND "tenant_id"=${invitation.tenant_id}'), /atómico/);
rejected("aceptación existente eliminada bloqueada", domain, (s) => s.replace("acceptExistingAdminIdentity", "removedExistingAcceptance"), /existente/);
rejected("resolver autoritativo eliminado bloqueado", domain, (s) => s.replace("resolveAdminIdentityActivation", "removedActivationResolution"), /servidor/);
rejected("revalidación de destinatario eliminada bloqueada", domain, (s) => s.replaceAll("requireExpectedRecipient(invitation, expectedRecipientEmail);", "void 0;"), /destinatario/);
const http = "api/_lib/adminIdentityInvitationHttp.js";
rejected("gate posterior a body bloqueado", http, (s) => s.replace("requireAdminIdentityInvitationAccess(req, env);", "void 0;"), /gate/);
rejected("CORS permisivo bloqueado", http, (s) => `${s}\nres.setHeader("Access-Control-Allow-Origin", "*");`, /CORS/);
rejected("modo elegido sin resolver bloqueado", http, (s) => s.replace("resolution.mode === ADMIN_IDENTITY_ACTIVATION_MODES.NEW_IDENTITY", "getBearerToken(req)"), /autoritativa/);
rejected("destinatario productivo sin congelar bloqueado", http, (s) => s.replace("V17_PRODUCTION_PILOT_ADMIN_EMAIL", "REMOVED_FROZEN_RECIPIENT"), /congelado/);
rejected("email productivo desde navegador bloqueado", http, (s) => s.replace('ISSUE_PRODUCTION_PILOT_FIELDS = new Set(["requestId"])', 'ISSUE_PRODUCTION_PILOT_FIELDS = new Set(["requestId", "email"])'), /Production Pilot/);
rejected("validación de email después de Prisma bloqueada", http, (s) => s.replace("exact(body, ISSUE_PRODUCTION_PILOT_FIELDS);", "void 0;")
  .replace("const context = await resolveContext(req, { prisma, env });", "const context = await resolveContext(req, { prisma, env });\n      exact(body, ISSUE_PRODUCTION_PILOT_FIELDS);"), /después de auth|Production Pilot/);
rejected("destinatario en respuesta productiva bloqueado", http, (s) => s.replace("invitationRef: invitation.invitationRef,", "email: invitation.email,\n    invitationRef: invitation.invitationRef,"), /respuestas productivas/);
const activation = "src/admin-tenant/AdminIdentityActivation.tsx";
rejected("sesión ambiental vuelve a seleccionar flujo bloqueada", activation, (s) => s.replace('mode === "EXISTING_IDENTITY" ? loadSession() : null', "loadSession()"), /frontend/);
const activationRoute = "src/admin-tenant/adminIdentityActivationRoute.ts";
rejected("fragmento persistente bloqueado", activationRoute, (s) => s.replace('window.history.replaceState({}, "", "/activate-admin");', "void 0;"), /fragmento/);
const app = "src/App.tsx";
rejected("pantalla fuera de compuerta bloqueada", app, (s) => s.replace("!isAdminIdentityInvitationEnabled()", "false"), /pantalla/);
const adminApi = "src/admin-tenant/adminApi.ts";
rejected("cliente corporativo enviando email bloqueado", adminApi, (s) => s.replace("JSON.stringify({ requestId: crypto.randomUUID() })", "JSON.stringify({ requestId: crypto.randomUUID(), email: 'forbidden' })"), /cliente productivo/);
const adminUi = "src/admin-tenant/AdminTenantMembershipModule.tsx";
rejected("selector corporativo eliminado bloqueado", adminUi, (s) => s.replace("corporateRecipient ? <p", "false ? <p"), /UI Production Pilot/);
const hub = "src/hub/HubWorkspace.tsx";
rejected("modo corporativo no transmitido bloqueado", hub, (s) => s.replace("invitationMode={adminInvitationMode}", "invitationMode={undefined}"), /modo de invitación/);
const bootstrap = "scripts/v17-admin-initial-permissions-bootstrap.mjs";
rejected("dry-run escribible bloqueado", bootstrap, (s) => s.replace('await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");', "void 0;"), /dry-run/);
rejected("bootstrap de contraseña bloqueado", bootstrap, (s) => `${s}\nconst passwordHash = 'forbidden';\n`, /credenciales/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
