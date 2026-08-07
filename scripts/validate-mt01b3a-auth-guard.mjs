import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INVENTORIED_ROUTES = new Set([
  "api/auth/login.js", "api/auth/logout.js", "api/auth/me.js", "api/auth/refresh.js", "api/auth/session/upgrade.js",
  "api/clients/index.js", "api/health.js", "api/info.js",
  "api/k/dashboard.js", "api/k/pgd/apply.js", "api/k/pgd/item.js", "api/k/project-release.js", "api/k/project-validate.js", "api/k/project.js", "api/k/signal.js",
  "api/osis/[id].js", "api/osis/[id]/handshake.js", "api/osis/[id]/return.js", "api/osis/index.js",
  "api/projects/index.js", "api/pst/[serviceCode].js", "api/pst/active.js",
  "api/ptf/suggestions/action.js", "api/ptf/suggestions/index.js", "api/ptf/suggestions/recompute.js",
  "api/templates/approve-batch.js", "api/templates/approve.js", "api/templates/draft.js", "api/templates/list.js", "api/templates/pending.js", "api/templates/publish.js", "api/templates/reject.js", "api/templates/submit.js", "api/templates/version.js",
  "api/users/index.js",
]);

const LEGACY_HEADER_ROUTES = new Set([
  "api/k/dashboard.js", "api/k/pgd/apply.js", "api/k/pgd/item.js", "api/k/project-release.js", "api/k/project-validate.js", "api/k/project.js", "api/k/signal.js",
  "api/osis/[id].js", "api/osis/[id]/handshake.js", "api/osis/[id]/return.js", "api/osis/index.js",
  "api/pst/[serviceCode].js", "api/pst/active.js",
  "api/ptf/suggestions/action.js", "api/ptf/suggestions/index.js", "api/ptf/suggestions/recompute.js",
  "api/templates/approve-batch.js", "api/templates/approve.js", "api/templates/draft.js", "api/templates/list.js", "api/templates/pending.js", "api/templates/publish.js", "api/templates/reject.js", "api/templates/submit.js", "api/templates/version.js",
]);

const V2_PREPARED_ROUTES = new Set(["api/auth/me.js", "api/users/index.js", "api/clients/index.js", "api/projects/index.js"]);
const LEGACY_JWT_ROUTES = new Set(["api/users/index.js", "api/clients/index.js", "api/projects/index.js"]);
const ROUTE_HELPERS = new Set(["api/k/_lib.js", "api/osis/_helpers.js", "api/templates/_pst.js"]);
export const B3B1_ACTIVATION_BLOCKERS = Object.freeze([
  "Client no posee tenantId",
  "Project no posee tenantId",
  "La creación de User no crea EmployeeProfile/TenantMembership formal",
  "No puede garantizarse 404 empresarial para esos recursos",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalized(file) {
  return file.replaceAll("\\", "/");
}

function collectJs(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectJs(target) : entry.name.endsWith(".js") ? [target] : [];
  });
}

export function validateMt01b3aSources({ routeSources, envExample, authContextSource }) {
  invariant(LEGACY_HEADER_ROUTES.size === 25, `MT-01B3A: la allowlist heredada debe contener exactamente 25 rutas; contiene ${LEGACY_HEADER_ROUTES.size}`);
  for (const route of routeSources.keys()) {
    invariant(INVENTORIED_ROUTES.has(route), `MT-01B3A: ruta nueva sin clasificación: ${route}`);
  }
  for (const route of INVENTORIED_ROUTES) {
    invariant(routeSources.has(route), `MT-01B3A: ruta inventariada ausente: ${route}`);
  }

  for (const [route, source] of routeSources) {
    const trustsHeaders = /x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders/.test(source);
    invariant(!trustsHeaders || LEGACY_HEADER_ROUTES.has(route), `MT-01B3A: ${route} introduce confianza nueva en x-osi-role/x-osi-userid`);
    if (LEGACY_HEADER_ROUTES.has(route)) {
      invariant(trustsHeaders, `MT-01B3A: ${route} cambió su autenticación heredada sin actualizar inventario/allowlist`);
    }
    if (LEGACY_JWT_ROUTES.has(route)) {
      invariant(/requirePilot(?:Auth|Permission)/.test(source), `MT-01B3A: ${route} debe usar el adaptador dual explícito B3B1`);
    }
    if (V2_PREPARED_ROUTES.has(route)) {
      const hasContext = route === "api/auth/me.js" ? /requireAuthContext/.test(source) : /requirePilot(?:Auth|Permission)/.test(source);
      invariant(hasContext, `MT-01B3A: ${route} está marcada V2 pero omite el contexto empresarial explícito`);
      invariant(!trustsHeaders, `MT-01B3A: ${route} V2 no puede aceptar x-osi-role/x-osi-userid`);
    }
  }

  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "MT-01B3A: LEGACY debe continuar como valor predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "MT-01B3A: tenant switch debe continuar desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "MT-01B3A: cliente V2 debe continuar desactivado");
  invariant(B3B1_ACTIVATION_BLOCKERS.length === 4, "MT-01B3B1: los bloqueos de activación no pueden retirarse antes de MT-01C");
  invariant(/export async function resolveAuthContext\(request,/.test(authContextSource), "MT-01B3A: firma canónica resolveAuthContext(request, options) ausente");
  invariant(/Object\.freeze/.test(authContextSource), "MT-01B3A: AuthContext debe ser inmutable");
  return { routes: routeSources.size, legacyHeaderExceptions: LEGACY_HEADER_ROUTES.size, v2Prepared: V2_PREPARED_ROUTES.size, activationBlockers: B3B1_ACTIVATION_BLOCKERS.length };
}

export function validateMt01b3aRepository(root = process.cwd()) {
  const apiRoot = path.join(root, "api");
  const routeSources = new Map();
  for (const absolute of collectJs(apiRoot)) {
    const route = normalized(path.relative(root, absolute));
    if (route.startsWith("api/_lib/") || route.startsWith("api/_disabled/") || ROUTE_HELPERS.has(route)) continue;
    routeSources.set(route, fs.readFileSync(absolute, "utf8"));
  }
  return validateMt01b3aSources({
    routeSources,
    envExample: fs.readFileSync(path.join(root, ".env.example"), "utf8"),
    authContextSource: fs.readFileSync(path.join(root, "api/_lib/authContext.js"), "utf8"),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateMt01b3aRepository();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}
