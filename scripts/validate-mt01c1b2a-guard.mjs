import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function source(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

export function validateMt01c1b2aGuard(root = process.cwd()) {
  const envExample = source(root, ".env.example");
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "MT-01C1B2A: LEGACY debe seguir predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1B2A: tenant switch debe seguir desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1B2A: cliente V2 debe seguir desactivado");

  const migrations = fs.readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
  invariant(migrations.length === 14, `MT-01C1B2A: se esperaban 14 migraciones, se encontraron ${migrations.length}`);

  const requireAuthSource = source(root, "api/_lib/requireAuth.js");
  invariant(/select:\s*\{\s*status:\s*true\s*\}/s.test(requireAuthSource), "MT-01C1B2A: requireAuth debe consultar el estado vigente");
  invariant(/AUTH_DATABASE_UNAVAILABLE/.test(requireAuthSource) && /status\(503\)/.test(requireAuthSource), "MT-01C1B2A: la falla de base debe ser 503 controlado");
  invariant(!/payload\.status/.test(requireAuthSource), "MT-01C1B2A: requireAuth no puede confiar en status del JWT");

  const pilotSource = source(root, "api/_lib/authContextPilot.js");
  invariant((pilotSource.match(/requireAuth\(/g) || []).length === 2, "MT-01C1B2A: cambió el adaptador consumidor de requireAuth");
  const routeConsumers = ["api/users/index.js", "api/clients/index.js", "api/projects/index.js"];
  for (const route of routeConsumers) {
    const routeSource = source(root, route);
    invariant(/requirePilot(?:Auth|Permission)/.test(routeSource), `MT-01C1B2A: ${route} dejó de usar el piloto autenticado`);
    invariant(/readJsonObject/.test(routeSource), `MT-01C1B2A: ${route} perdió el parser estricto`);
    invariant(/requireNonEmptyObject:\s*true/.test(routeSource), `AUTH-JSON-02-Q2: ${route} debe distinguir body HTTP vacío`);
  }

  const loginSource = source(root, "api/auth/login.js");
  invariant(/UNKNOWN_IDENTITY_PASSWORD_HASH/.test(loginSource), "MT-01C1B2A: login debe ejecutar bcrypt para identidad inexistente");
  invariant(/AUTH_DATABASE_UNAVAILABLE/.test(loginSource), "MT-01C1B2A: login debe sanitizar fallas de base");
  invariant(/requireNonEmptyObject:\s*true/.test(loginSource), "AUTH-JSON-02-Q2: login debe distinguir body HTTP vacío");
  const meSource = source(root, "api/auth/me.js");
  invariant(/isGloballyActiveUser/.test(meSource) && /AUTH_DATABASE_UNAVAILABLE/.test(meSource), "MT-01C1B2A: /auth/me debe revalidar estado y fallas de base");

  const parserSource = source(root, "api/_lib/http.js");
  for (const marker of ["REQUEST_CONTENT_LENGTH_INVALID", "REQUEST_BODY_TOO_LARGE", "REQUEST_JSON_INVALID", "REQUEST_JSON_TOO_DEEP", "REQUEST_JSON_UNSAFE_KEYS"]) {
    invariant(parserSource.includes(marker), `MT-01C1B2A: falta contrato ${marker}`);
  }
  invariant(/TextDecoder\("utf-8",\s*\{\s*fatal:\s*true\s*\}\)/.test(parserSource), "MT-01C1B2A: UTF-8 debe validarse en modo fatal");
  invariant(/error\.name === "Error" && error\.message === "Invalid JSON"/.test(parserSource), "AUTH-JSON-02: falta reconocer el error exacto del getter Vercel");
  invariant(/code:\s*err\.code/.test(parserSource) && /JSON_BODY_ERROR_MESSAGES/.test(parserSource), "AUTH-JSON-02: el parser debe separar código estable y mensaje genérico");
  invariant(/requireNonEmptyObject\s*=\s*false/.test(parserSource), "AUTH-JSON-02-Q2: el cambio no puede alterar globalmente los objetos vacíos");

  return {
    migrations: migrations.length,
    requireAuthDirectConsumer: "api/_lib/authContextPilot.js",
    indirectlyAffectedRoutes: routeConsumers,
    legacy: true,
    hybrid: false,
    tenantSwitch: false,
    clientV2: false,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateMt01c1b2aGuard() })}\n`);
