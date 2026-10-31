import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { B3B1_ACTIVATION_BLOCKERS, validateMt01b3aRepository, validateMt01b3aSources } from "./validate-mt01b3a-auth-guard.mjs";

const root = process.cwd();
const current = validateMt01b3aRepository(root);
const routeSources = new Map(); const adapterSources = new Map();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (entry.name.endsWith(".js")) {
      const route = path.relative(root, absolute).replaceAll("\\", "/");
      if (route.startsWith("api/_lib/")) adapterSources.set(route, fs.readFileSync(absolute, "utf8"));
      else if (!route.startsWith("api/_disabled/") && !["api/k/_lib.js", "api/osis/_helpers.js", "api/templates/_pst.js"].includes(route)) routeSources.set(route, fs.readFileSync(absolute, "utf8"));
    }
  }
}
collect(path.join(root, "api"));
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const authContextSource = fs.readFileSync(path.join(root, "api/_lib/authContext.js"), "utf8");
const canonicalInventory = JSON.parse(fs.readFileSync(path.join(root, "scripts/v17-auth-legacy-route-inventory.json"), "utf8"));
const baseline = { routeSources, adapterSources, envExample, authContextSource, canonicalInventory };
const results = [];
function positive(name, operation) { operation(); results.push({ name, passed: true, kind: "positive" }); }
function rejected(name, overrides, message) {
  assert.throws(() => validateMt01b3aSources({ ...baseline, ...overrides }), message, name);
  results.push({ name, passed: true, kind: "negative" });
}
function changed(sources, file, transform) {
  const before = sources.get(file); assert.equal(typeof before, "string", file);
  const after = transform(before); assert.notEqual(after, before, "mutación sin efecto: " + file);
  return new Map([...sources, [file, after]]);
}
function rejectRoute(name, file, transform, message = /MT-01B3A: .*adaptador autorizado/) {
  rejected(name, { routeSources: changed(routeSources, file, transform) }, message);
}
function rejectAdapter(name, file, transform, message) {
  rejected(name, { adapterSources: changed(adapterSources, file, transform) }, message);
}

// The original negative scenarios remain. /api/users is now a retired 410,
// so removal of the pilot adapter is tested on its active /api/clients consumer.
positive("repositorio actual aprobado", () => validateMt01b3aRepository(root));
positive("bloqueos MT-01C explícitos y congelados", () => {
  assert.equal(current.activationBlockers, 4); assert.equal(B3B1_ACTIVATION_BLOCKERS.length, 4);
  assert.equal(Object.isFrozen(B3B1_ACTIVATION_BLOCKERS), true);
});
rejected("ruta nueva sin inventario rechazada", { routeSources: new Map([...routeSources, ["api/new-route.js", "export default () => null"]]) }, /MT-01B3A: ruta nueva sin clasificación/);
rejectRoute("header manipulable nuevo rechazado", "api/health.js", (s) => s + "\nconst role = req.headers['x-osi-role'];", /MT-01B3A: .*headers manipulables/);
rejectRoute("ruta migrada no puede volver a headers", "api/k/signal.js", (s) => s + "\nconst forged = req.headers['x-osi-role'];", /MT-01B3A: .*headers manipulables/);
rejectRoute("adaptador dual no puede eliminarse", "api/clients/index.js", (s) => s.replaceAll("requirePilotAuth", "pilotAuthRemoved").replaceAll("requirePilotPermission", "pilotPermissionRemoved"));
rejectRoute("ruta V2 sin contexto rechazada", "api/auth/me.js", (s) => s.replaceAll("requireAuthContext", "legacyOnly"));
rejectRoute("ruta ICP v2 sin contrato HTTP rechazada", "api/crm/icp-v2/clients/search.js", (s) => s.replaceAll("crmIcpV2ApiHttp.js", "legacyOnly.js"));
rejectRoute("ruta piloto no puede volver a requireAuth directo", "api/clients/index.js", (s) => s.replaceAll("requirePilotAuth", "requireAuth").replaceAll("requirePilotPermission", "requireAuth"));
rejectRoute("ruta piloto no puede aceptar headers heredados", "api/projects/index.js", (s) => s + "\nconst forged = req.headers['x-osi-role'];", /MT-01B3A: .*headers manipulables/);
rejected("HYBRID predeterminado rechazado", { envExample: envExample.replace('MT01B_AUTH_MODE="LEGACY"', 'MT01B_AUTH_MODE="HYBRID"') }, /MT-01B3A: LEGACY debe continuar/);
rejected("tenant switch predeterminado rechazado", { envExample: envExample.replace('MT01B_TENANT_SWITCH_ENABLED="false"', 'MT01B_TENANT_SWITCH_ENABLED="true"') }, /MT-01B3A: tenant switch debe continuar/);
rejected("cliente V2 predeterminado rechazado", { envExample: envExample.replace('VITE_MT01B2_CLIENT_ENABLED="false"', 'VITE_MT01B2_CLIENT_ENABLED="true"') }, /MT-01B3A: cliente V2 debe continuar/);

const asset = "api/assets/assignments/handout/index.js";
positive("alias de import y formato equivalentes aprobados", () => validateMt01b3aSources({ ...baseline,
  routeSources: changed(routeSources, asset, (s) => s.replace('import { createToolsEquipmentHandler }', 'import { createToolsEquipmentHandler as assetsHandler }').replace('export default createToolsEquipmentHandler(', 'export default assetsHandler(')),
}));
rejected("una ruta nueva bajo un prefijo aprobado también se rechaza", { routeSources: new Map([...routeSources, ["api/assets/new-action/index.js", routeSources.get(asset)]]) }, /MT-01B3A: ruta nueva sin clasificación/);
const missing = new Map(routeSources); missing.delete(asset);
rejected("ruta clasificada ausente rechazada", { routeSources: missing }, /MT-01B3A: ruta inventariada ausente/);
rejectRoute("clasificación de activos no admite otro adaptador HTTP", asset, (s) => s.replaceAll("createToolsEquipmentHandler", "createMaterialsHandler").replaceAll("toolsEquipmentHttp.js", "materialsInventoryHttp.js"));
rejectRoute("un import correcto sin handler conectado no autoriza", asset, (s) => s.replace("export default createToolsEquipmentHandler", "const unused = createToolsEquipmentHandler") + "\nexport default () => null;\n");
rejectRoute("un comentario no sustituye la importación autorizada", asset, (s) => s.replace("toolsEquipmentHttp.js", "wrongHttp.js") + '\n// import { createToolsEquipmentHandler } from "../../../_lib/toolsEquipmentHttp.js";');
rejectRoute("factory no acepta un resolvedor de contexto inyectado", asset, (s) => s.replace("prismaClient: prisma", "resolveContext: async () => ({ role: 'A' }), prismaClient: prisma"), /MT-01B3A: .*autoridad alternativa/);
rejectRoute("factory no acepta spread de autoridad", asset, (s) => s.replace("prismaClient: prisma", "...options, prismaClient: prisma"), /MT-01B3A: .*opciones dinámicas/);
rejectRoute("factory no acepta sobrescritura por clave duplicada", asset, (s) => s.replace("prismaClient: prisma", "prismaClient: prisma, prismaClient: unsafe"), /MT-01B3A: .*sobrescribe la autoridad/);
rejectRoute("wrapper ICP no acepta un contexto sintético predeterminado", "api/crm/icp-v2/clients/search.js", (s) => s.replace("  resolveContext,", "  resolveContext = async () => ({ role: 'A' }),"), /MT-01B3A: .*sustituye el contexto predeterminado/);
rejectRoute("wrapper CRM no permite inyectar permisos al exportar", "api/crm/pipeline-summary.js", (s) => s.replace("export default createPipelineSummaryHandler();", "export default createPipelineSummaryHandler({ resolveContext: () => ({}) });"), /MT-01B3A: .*autoridad alternativa|MT-01B3A: .*inyecta autoridad en el wrapper/);
rejectRoute("lectura CRM no admite permiso sintético predeterminado", "api/crm/pipeline-summary.js", (s) => s.replace("requirePermission = requireCrmPipelinePermissionResponse", "requirePermission = async () => ({ role: 'A' })"), /MT-01B3A: .*sustituye el permiso canónico/);
rejectRoute("Portal interno no se reclasifica como acceso por token", "api/client-access/internal/index.js", (s) => s.replaceAll("createInternalClientTemporaryHandler", "createExternalClientTemporaryHandler"));
rejectRoute("Portal externo conserva su validación del dominio", "api/client-access/[accessRef]/index.js", (s) => s.replace("=> openClientTemporaryAccess(accessRef, token, database)", "=> ({ accessRef })"));
rejectRoute("Portal externo no sustituye el token por un valor fijo", "api/client-access/[accessRef]/mini.js", (s) => s.replace("saveClientMiniSurvey(accessRef, token, input, database)", 'saveClientMiniSurvey(accessRef, "forged", input, database)'), /MT-01B3A: .*no entrega el token/);
rejectRoute("upload temporal requiere extracción de ClientAccess", "api/client-access/[accessRef]/upload.js", (s) => s.replace("clientTemporaryTokenFromRequest(req)", '"forged"'));
rejectRoute("código temporal requiere su validador de dominio", "api/client-access/[accessRef]/code.js", (s) => s.replaceAll("openClientTemporaryAccessByCode", "skipCodeValidation"));
rejectRoute("activación por invitación no usa el handler administrativo", "api/auth/admin-invitations/activate.js", (s) => s.replaceAll("createAdminIdentityActivationHandler", "createAdminIdentityInvitationCollectionHandler"));
rejectRoute("foto19C no puede usar una ruta de identidad sin su adaptador privado", "api/admin/user-identities/[membershipRef]/photo/index.js", (s) => s.replaceAll("createAdminUserIdentityPhotoHandler", "createAdminUserIdentityDetailHandler"));
rejectRoute("activación19C no usa un handler administrativo", "api/admin/user-enrollments/activate/index.js", (s) => s.replaceAll("createAdminUserEnrollmentActivationHandler", "createAdminUserEnrollmentCollectionHandler"));
rejectRoute("alta19C no puede inyectar permisos ni contexto", "api/admin/user-enrollments/index.js", (s) => s.replace("createAdminUserEnrollmentCollectionHandler()", "createAdminUserEnrollmentCollectionHandler({ resolveContext: async () => ({ role: 'A' }) })"), /autoridad alternativa/);
const fleetDriverRoutes = [
  ["api/admin/fleet/drivers/options.js", "createFleetDriverOptionsHandler"],
  ["api/admin/fleet/vehicles/[vehicleRef]/drivers/index.js", "createFleetDriversHandler"],
  ["api/admin/fleet/vehicles/[vehicleRef]/drivers/primary.js", "createFleetPrimaryDriverHandler"],
  ["api/admin/fleet/vehicles/[vehicleRef]/drivers/authorizations/index.js", "createFleetDriverAuthorizationHandler"],
  ["api/admin/fleet/vehicles/[vehicleRef]/drivers/authorizations/[authorizationRef].js", "createFleetDriverDecisionHandler"],
];
for (const [route, factory] of fleetDriverRoutes) {
  rejectRoute("Choferes conserva su adaptador exacto: " + route, route, (s) => s.replace("fleetDriversHttp.js", "otherHttp.js"));
  rejectRoute("Choferes no inyecta autoridad: " + route, route,
    (s) => s.replace(`${factory}()`, `${factory}({ resolveContext: async () => ({ role: 'A' }) })`), /autoridad alternativa/);
}
rejectRoute("decidir Choferes no se convierte en una ruta de lectura", fleetDriverRoutes[4][0],
  (s) => s.replaceAll("createFleetDriverDecisionHandler", "createFleetDriversHandler"));
rejectRoute("Choferes no sustituye el dominio desde la ruta", fleetDriverRoutes[2][0],
  (s) => s.replace("createFleetPrimaryDriverHandler()", "createFleetPrimaryDriverHandler({ setPrimary: async () => ({ ok: true }) })"), /sobrescribe la autoridad/);
rejected("una sexta ruta Choferes no hereda la clasificación", {
  routeSources: new Map([...routeSources, ["api/admin/fleet/drivers/extra.js", routeSources.get(fleetDriverRoutes[0][0])]]),
}, /ruta nueva sin clasificación/);
rejectAdapter("Choferes conserva resolución de contexto canónico", "api/_lib/fleetDriversHttp.js",
  (s) => s.replace("resolveContext = resolveCrmPipelineContext", "resolveContext = fakeContext"), /omite el contexto empresarial canónico/);
rejectAdapter("Choferes no omite resolución autenticada", "api/_lib/fleetDriversHttp.js",
  (s) => s.replace("await resolveContext(req, { prisma, env })", "({ role: 'A' })"), /omite el contexto empresarial canónico/);
rejectAdapter("activación19C no cambia a GET", "api/_lib/adminUserIdentityHttp.js", (s) => s.replace('req.method !== "POST"', 'req.method !== "GET"'), /activación19C requiere POST/);
rejectAdapter("activación19C no acepta identidad sin firma", "api/_lib/adminUserIdentityHttp.js", (s) => s.replace("options.verifyIdentity ?? verifyStrictLegacyAccessToken", "options.verifyIdentity ?? decodeUnsignedToken"), /activación19C requiere POST/);
rejectAdapter("activación19C no omite resolución de token", "api/_lib/adminUserIdentityHttp.js", (s) => s.replace("await resolve(prisma, body.token, configuration)", "({ mode: 'NEW_IDENTITY' })"), /activación19C requiere POST/);
rejectRoute("usuarios retirados no regresan como respuesta exitosa", "api/users/index.js", (s) => s.replace("status(410)", "status(200)"), /MT-01B3A: \/api\/users debe permanecer retirado/);
rejectRoute("usuarios retirados no admiten lectura de identidades", "api/users/index.js", (s) => s + "\nconst users = prisma.user.findMany();", /MT-01B3A: \/api\/users debe permanecer retirado/);
rejectRoute("ruta canónica requiere llamada y no solo importación", "api/k/signal.js", (s) => s.replace("await requireRole(", "await bypassRole("));
rejectRoute("datos del cliente no pueden ser autoridad del actor", asset, (s) => s + "\nconst actor = body.actorUserId;", /MT-01B3A: .*autoridad del actor desde cliente/);
rejectAdapter("adaptador empresarial no cambia el contexto predeterminado", "api/_lib/toolsEquipmentHttp.js", (s) => s.replace("resolveContext = resolveCrmPipelineContext", "resolveContext = fakeContext"), /MT-01B3A: .*omite el contexto empresarial canónico/);
rejectAdapter("adaptador empresarial no omite la resolución autenticada", "api/_lib/toolsEquipmentHttp.js", (s) => s.replace("await resolveContext(req, { env, prisma: prismaClient })", "({ role: 'A' })"), /MT-01B3A: .*omite el contexto empresarial canónico/);
rejectAdapter("lectura CRM detiene contexto nulo", "api/_lib/crmPipelineReadHttp.js", (s) => s.replace("if (!context) return;", "void context;"), /MT-01B3A: lectura CRM omite/);
rejectAdapter("adaptador piloto no conserva autoridad paralela", "api/_lib/authContextPilot.js", (s) => s + "\nrequireAuth(req, res);", /MT-01B3A: el adaptador piloto debe converger/);
rejectAdapter("Portal HTTP no omite la extracción de credencial", "api/_lib/clientTemporaryAccessHttp.js", (s) => s.replace("const token = clientTemporaryTokenFromRequest(req)", 'const token = "forged"'), /MT-01B3A: el Portal externo omite/);
rejectAdapter("transporte externo no puede activarse por reclasificación", "api/_lib/communicationsHttp.js", (s) => s.replace("COMMUNICATION_TRANSPORT_DISABLED", "TRANSPORT_ENABLED"), /MT-01B3A: el transporte externo debe permanecer/);
rejected("inventario canónico no puede omitir una ruta migrada", { canonicalInventory: { ...canonicalInventory, migratedActiveFiles: canonicalInventory.migratedActiveFiles.slice(1) } }, /MT-01B3A: la clasificación no coincide/);
rejected("excepción legacy debe permanecer físicamente desactivada", { canonicalInventory: { ...canonicalInventory, remainingDisabledFiles: ["api/active-header-authority.js"] } }, /MT-01B3A: una excepción legacy dejó/);
rejected("AuthContext no puede perder inmutabilidad", { authContextSource: authContextSource.replaceAll("Object.freeze", "Object.assign") }, /MT-01B3A: AuthContext debe ser inmutable/);

process.stdout.write(JSON.stringify({ ok: true, passed: results.length, positive: results.filter((item) => item.kind === "positive").length,
  negative: results.filter((item) => item.kind === "negative").length, current, results }, null, 2) + "\n");
