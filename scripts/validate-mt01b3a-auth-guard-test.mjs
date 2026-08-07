import fs from "node:fs";
import path from "node:path";
import { validateMt01b3aRepository, validateMt01b3aSources } from "./validate-mt01b3a-auth-guard.mjs";

const root = process.cwd();
const current = validateMt01b3aRepository(root);
const routeSources = new Map();

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (entry.name.endsWith(".js")) {
      const route = path.relative(root, absolute).replaceAll("\\", "/");
      if (!route.startsWith("api/_lib/") && !route.startsWith("api/_disabled/") && !["api/k/_lib.js", "api/osis/_helpers.js", "api/templates/_pst.js"].includes(route)) {
        routeSources.set(route, fs.readFileSync(absolute, "utf8"));
      }
    }
  }
}
collect(path.join(root, "api"));

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const authContextSource = fs.readFileSync(path.join(root, "api/_lib/authContext.js"), "utf8");
const results = [];
function check(name, operation, expectedFailure = false) {
  try {
    operation();
    if (expectedFailure) throw new Error("La guardia aceptó un caso inseguro");
    results.push({ name, passed: true });
  } catch (error) {
    if (!expectedFailure) throw error;
    results.push({ name, passed: /MT-01B3A/.test(String(error.message)) });
    if (!results.at(-1).passed) throw error;
  }
}

check("repositorio actual aprobado", () => validateMt01b3aRepository(root));
check("ruta nueva sin inventario rechazada", () => validateMt01b3aSources({ routeSources: new Map([...routeSources, ["api/new-route.js", "export default () => null"]]), envExample, authContextSource }), true);
check("header manipulable nuevo rechazado", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/health.js" ? `${value}\nconst role = req.headers['x-osi-role'];` : value])), envExample, authContextSource }), true);
check("excepción heredada no puede cambiar sin inventario", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/k/signal.js" ? value.replaceAll("requireRoleFromHeaders", "legacyRoleRemoved") : value])), envExample, authContextSource }), true);
check("adaptador dual no puede eliminarse", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/users/index.js" ? value.replaceAll("requirePilotAuth", "pilotAuthRemoved").replaceAll("requirePilotPermission", "pilotPermissionRemoved") : value])), envExample, authContextSource }), true);
check("ruta V2 sin contexto rechazada", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/auth/me.js" ? value.replaceAll("requireAuthContext", "legacyOnly") : value])), envExample, authContextSource }), true);
check("ruta piloto no puede volver a requireAuth directo", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/clients/index.js" ? value.replaceAll("requirePilotAuth", "requireAuth").replaceAll("requirePilotPermission", "requireAuth") : value])), envExample, authContextSource }), true);
check("ruta piloto no puede aceptar headers heredados", () => validateMt01b3aSources({ routeSources: new Map([...routeSources].map(([key, value]) => [key, key === "api/projects/index.js" ? `${value}\nconst forged = req.headers['x-osi-role'];` : value])), envExample, authContextSource }), true);
check("HYBRID predeterminado rechazado", () => validateMt01b3aSources({ routeSources, envExample: envExample.replace('MT01B_AUTH_MODE="LEGACY"', 'MT01B_AUTH_MODE="HYBRID"'), authContextSource }), true);
check("tenant switch predeterminado rechazado", () => validateMt01b3aSources({ routeSources, envExample: envExample.replace('MT01B_TENANT_SWITCH_ENABLED="false"', 'MT01B_TENANT_SWITCH_ENABLED="true"'), authContextSource }), true);
check("cliente V2 predeterminado rechazado", () => validateMt01b3aSources({ routeSources, envExample: envExample.replace('VITE_MT01B2_CLIENT_ENABLED="false"', 'VITE_MT01B2_CLIENT_ENABLED="true"'), authContextSource }), true);

process.stdout.write(`${JSON.stringify({ ok: results.every((item) => item.passed), passed: results.length, current, results }, null, 2)}\n`);
