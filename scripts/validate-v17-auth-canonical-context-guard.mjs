import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEGACY_MARKER = /x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders|ensureActorUserId/i;

function invariant(condition, message) {
  if (!condition) throw new Error(`V17-AUTH-CANONICAL-CONTEXT: ${message}`);
}

function normalized(value) {
  return value.replaceAll("\\", "/");
}

function collect(directory, extensions = new Set([".js", ".ts", ".tsx"])) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collect(absolute, extensions)
      : extensions.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function sorted(values) {
  return [...values].sort();
}

export function validateV17AuthCanonicalContextSources({ sources, inventory }) {
  const filesWithLegacyMarkers = sorted([...sources]
    .filter(([, source]) => LEGACY_MARKER.test(source))
    .map(([file]) => file));
  const expectedDisabled = sorted(inventory.remainingDisabledFiles);
  invariant(JSON.stringify(filesWithLegacyMarkers) === JSON.stringify(expectedDisabled),
    `inventario legacy cambió: ${JSON.stringify(filesWithLegacyMarkers)}`);
  invariant(expectedDisabled.every((file) => file.startsWith("api/_disabled/")),
    "una excepción legacy dejó de estar físicamente desactivada");
  invariant(new Set(expectedDisabled).size === expectedDisabled.length, "inventario legacy contiene duplicados");
  invariant(new Set(inventory.migratedActiveFiles).size === inventory.migratedActiveFiles.length,
    "inventario de rutas migradas contiene duplicados");

  for (const file of inventory.migratedActiveFiles) {
    const source = sources.get(file);
    invariant(typeof source === "string", `ruta migrada ausente: ${file}`);
    invariant(!LEGACY_MARKER.test(source), `ruta migrada volvió a confiar en headers: ${file}`);
    invariant(/require(?:Permission|Role)|requirePilotPermission|requireCommercialPermission/.test(source),
      `ruta migrada omite AuthorizationContext: ${file}`);
  }

  const context = sources.get("api/_lib/authContext.js") || "";
  const contract = sources.get("api/_lib/authorizationContext.js") || "";
  const pilot = sources.get("api/_lib/authContextPilot.js") || "";
  const rbac = sources.get("api/_lib/rbac.js") || "";
  const browserApi = sources.get("src/lib/api.ts") || "";
  const login = sources.get("src/components/auth/LoginScreen.tsx") || "";
  const users = sources.get("api/users/index.js") || "";
  const invitation = sources.get("api/_lib/adminIdentityInvitationDomain.js") || "";
  const policy = sources.get("api/_lib/passwordPolicy.js") || "";

  for (const field of ["user", "membership", "tenant", "role", "grantedPermissions", "deniedPermissions", "effectivePermissions", "authorizationVersion", "sessionKind"]) {
    invariant(new RegExp(`\\b${field}\\b`).test(contract), `AuthorizationContext omite ${field}`);
  }
  invariant(/createAuthorizationContext/.test(context) && /resolveLegacyAuthorizationContext/.test(context),
    "LEGACY no converge en el constructor canónico");
  invariant(/osi_users[\s\S]*tenant_memberships[\s\S]*tenants/.test(context),
    "LEGACY no revalida User, Membership y Tenant");
  invariant(/verifyAccessToken\(token\)[\s\S]*resolveLegacyAuthorizationContext/.test(context),
    "claims LEGACY siguen siendo autoridad final");
  invariant(!/requireAuth\(|requirePerm\(/.test(pilot), "adaptador piloto conserva una autoridad paralela");
  invariant(/effectivePermissionsFor/.test(contract) && /denied[\s\S]*filter/.test(rbac),
    "deniedPermissions no prevalece en la fuente server-side");
  invariant(!LEGACY_MARKER.test(rbac), "rbac server-side todavía exporta autorización por headers");
  invariant(!LEGACY_MARKER.test(browserApi), "frontend todavía envía identidad o rol por headers");
  invariant(!/TEST_USERS|Credenciales para probar roles|setPassword\(u\.password\)/.test(login),
    "Login conserva credenciales demostrativas");
  invariant(/status\(410\)/.test(users)
    && /USERS_ADMINISTRATION_MOVED_TO_MEMBERSHIPS/.test(users)
    && /ADMIN_IDENTITY_INVITATION/.test(users)
    && !/password|hashPassword|prisma\.(?:user|tenantMembership)\.(?:findMany|create)/i.test(users),
  "/api/users no quedó retirado a favor de Memberships e Invitation");
  invariant(/isCanonicalLegacyPassword/.test(invitation) && /length\s*>=\s*14/.test(policy),
    "alta legacy e invitación no comparten política de password");

  const activeRoutes = [...sources].filter(([file]) => file.startsWith("api/")
    && !file.startsWith("api/_lib/") && !file.startsWith("api/_disabled/"));
  for (const [file, source] of activeRoutes) {
    invariant(!/body\.(?:actorUserId|actorRole)|query\.(?:actorUserId|actorRole)/.test(source),
      `${file} acepta autoridad del actor desde cliente`);
  }

  for (const optionalDraftDomain of ["api/_lib/crmIcpV2Domain.js", "api/_lib/crmQuoteProposalDomain.js"]) {
    if (sources.has(optionalDraftDomain)) {
      invariant(/productionApiEnabled:\s*false/.test(sources.get(optionalDraftDomain)),
        `${optionalDraftDomain} habilitó API productiva`);
    }
  }

  return Object.freeze({
    activeLegacyRoutes: 0,
    remainingDisabledFiles: expectedDisabled.length,
    migratedActiveFiles: inventory.migratedActiveFiles.length,
  });
}

export function validateV17AuthCanonicalContextRepository(root = process.cwd()) {
  const sources = new Map();
  for (const top of ["api", "src"]) {
    for (const absolute of collect(path.join(root, top))) {
      sources.set(normalized(path.relative(root, absolute)), fs.readFileSync(absolute, "utf8"));
    }
  }
  const inventory = JSON.parse(fs.readFileSync(path.join(root, "scripts/v17-auth-legacy-route-inventory.json"), "utf8"));
  return validateV17AuthCanonicalContextSources({ sources, inventory });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...validateV17AuthCanonicalContextRepository() })}\n`);
}
