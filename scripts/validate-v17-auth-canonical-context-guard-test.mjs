import fs from "node:fs";
import path from "node:path";
import { validateV17AuthCanonicalContextRepository, validateV17AuthCanonicalContextSources } from "./validate-v17-auth-canonical-context-guard.mjs";

const root = process.cwd();
const inventory = JSON.parse(fs.readFileSync(path.join(root, "scripts/v17-auth-legacy-route-inventory.json"), "utf8"));
const sources = new Map();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if ([".js", ".ts", ".tsx"].includes(path.extname(entry.name))) {
      sources.set(path.relative(root, absolute).replaceAll("\\", "/"), fs.readFileSync(absolute, "utf8"));
    }
  }
}
collect(path.join(root, "api"));
collect(path.join(root, "src"));

const results = [];
function accepted(name, operation) {
  operation();
  results.push({ name, passed: true });
}
function rejected(name, mutate) {
  const changed = new Map(sources);
  mutate(changed);
  try {
    validateV17AuthCanonicalContextSources({ sources: changed, inventory });
    throw new Error(`guardia aceptó caso inseguro: ${name}`);
  } catch (error) {
    if (!String(error.message).includes("V17-AUTH-CANONICAL-CONTEXT")) throw error;
    results.push({ name, passed: true });
  }
}

accepted("repositorio actual", () => validateV17AuthCanonicalContextRepository(root));
rejected("header de rol nuevo", (changed) => changed.set("api/info.js", `${changed.get("api/info.js")}\nconst forged = req.headers['x-osi-role'];`));
rejected("header de usuario nuevo", (changed) => changed.set("api/health.js", `${changed.get("api/health.js")}\nconst forged = req.headers['x-osi-userid'];`));
rejected("helper legacy reintroducido", (changed) => changed.set("api/templates/list.js", changed.get("api/templates/list.js").replace("requirePermission", "requirePermFromHeaders")));
rejected("ruta migrada sin contexto", (changed) => changed.set("api/pst/active.js", changed.get("api/pst/active.js").replaceAll("requirePermission", "permissionRemoved")));
rejected("adapter paralelo requireAuth", (changed) => changed.set("api/_lib/authContextPilot.js", `${changed.get("api/_lib/authContextPilot.js")}\nrequireAuth(req, res);`));
rejected("denies omitidos", (changed) => changed.set("api/_lib/rbac.js", changed.get("api/_lib/rbac.js").replace(".filter((permission) => !denied.has(permission)).sort()", ".sort()")));
rejected("credencial demo", (changed) => changed.set("src/components/auth/LoginScreen.tsx", `${changed.get("src/components/auth/LoginScreen.tsx")}\nconst TEST_USERS = [];`));
rejected("password administrativo reintroducido", (changed) => changed.set("api/users/index.js", `${changed.get("api/users/index.js")}\nconst password = body.password; await hashPassword(password);`));
rejected("listado User global", (changed) => changed.set("api/users/index.js", `${changed.get("api/users/index.js")}\nawait prisma.user.findMany({});`));
rejected("actor desde body", (changed) => changed.set("api/k/signal.js", `${changed.get("api/k/signal.js")}\nconst actor = body.actorUserId;`));
rejected("inventario reducido falsamente", (changed) => changed.delete("api/_disabled/signal.js"));
rejected("Draft futuro no puede habilitar API productiva", (changed) => changed.set("api/_lib/crmIcpV2Domain.js", "export const contract = { productionApiEnabled: true };"));

process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
