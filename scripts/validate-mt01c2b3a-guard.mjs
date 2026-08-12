import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_MIGRATIONS = 16;
const PREPARED_CONSUMERS = Object.freeze(new Set([
  "api/clients/index.js",
  "api/projects/index.js",
]));
const PROTECTED_FIELDS = Object.freeze(["tenantId", "membershipId", "ownerMembershipId", "ownerUserId", "ownerId"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`MT-01C2B3A: ${message}`);
}

function normalized(path) {
  return path.replaceAll("\\", "/");
}

function walk(root, directory, result = []) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const rel = normalized(`${directory}/${entry.name}`);
    if (entry.isDirectory()) walk(root, rel, result);
    else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) result.push(rel);
  }
  return result;
}

function source(root, path, overrides) {
  return overrides?.[path] ?? readFileSync(resolve(root, path), "utf8");
}

function migrationNames(root) {
  return readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function rootWriteCalls(text) {
  const calls = [];
  const pattern = /\b(?:prisma|tx)\.(client|project|lead|pipelineCase)\.(create|createMany|update|updateMany|upsert)\s*\(/g;
  for (const match of text.matchAll(pattern)) {
    let depth = 1;
    let quote = null;
    let escaped = false;
    let index = match.index + match[0].length;
    for (; index < text.length && depth > 0; index += 1) {
      const character = text[index];
      if (escaped) { escaped = false; continue; }
      if (quote) {
        if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    calls.push({ model: match[1], method: match[2], body: text.slice(match.index + match[0].length, index - 1) });
  }
  return calls;
}

function objectPropertyBody(text, property) {
  const match = new RegExp(`\\b${property}\\s*:\\s*\\{`).exec(text);
  if (!match) return "";
  const start = match.index + match[0].length;
  let depth = 1;
  let quote = null;
  let escaped = false;
  let index = start;
  for (; index < text.length && depth > 0; index += 1) {
    const character = text[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
  }
  return text.slice(start, index - 1);
}

function validateUpdateBlocks(path, text) {
  const calls = rootWriteCalls(text).filter(({ method }) => ["update", "updateMany", "upsert"].includes(method));
  for (const call of calls) {
    const data = objectPropertyBody(call.body, "data");
    invariant(!PROTECTED_FIELDS.some((field) => new RegExp(`\\b${field}\\b`).test(data)), `${path} intenta modificar autoridad empresarial`);
  }
  if (path === "api/k/project-validate.js") {
    invariant(calls.length === 1 && calls[0].model === "project" && calls[0].method === "update", `${path} contiene escrituras no inventariadas`);
    invariant(/\bdata\s*:\s*\{\s*kState:\s*"VALIDATED"\s*,\s*kValidatedAt:\s*new Date\(\)\s*\}/.test(calls[0].body), `${path} cambió los campos permitidos`);
  } else if (path === "api/k/project-release.js") {
    invariant(calls.length === 1 && calls[0].model === "project" && calls[0].method === "update", `${path} contiene escrituras no inventariadas`);
    invariant(/\bdata\s*:\s*\{\s*kState:\s*"RELEASED"\s*,\s*kReleasedAt:\s*new Date\(\)\s*\}/.test(calls[0].body), `${path} cambió los campos permitidos`);
  } else if (path === "api/_lib/commercialTenancyRead.js") {
    invariant(calls.length === 1 && calls[0].model === "project" && calls[0].method === "updateMany", `${path} contiene updates comerciales no inventariados`);
    invariant(/tenantId:\s*String\(tenantId\)[\s\S]*updatedAt:\s*expectedUpdatedAt[\s\S]*kState:\s*expectedKState/.test(calls[0].body), `${path} no limita la transición K por tenant, versión y estado`);
    invariant(/\bdata\s*,/.test(calls[0].body), `${path} cambió el payload cerrado de la transición K`);
  } else if (!path.startsWith("api/_disabled/")) {
    invariant(calls.length === 0, `${path} contiene updates comerciales no inventariados`);
  }
}

export function validateMt01c2b3a({
  root = process.cwd(),
  env = process.env,
  overrides = {},
  migrations = migrationNames(root),
  extraRuntimeSources = {},
} = {}) {
  invariant(migrations.length === EXPECTED_MIGRATIONS, `se esperaban exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(migrations.includes("20260801015000_crm01b_pipeline_mutation_authority"), "falta migración 16 CRM-01B1");
  invariant(!migrations.some((name) => /^20260801016000_/.test(name)), "migración 17 no autorizada");

  const envExample = source(root, ".env.example", overrides);
  invariant(/^COMMERCIAL_TENANCY_WRITE_MODE=(?:"LEGACY_ONLY"|'LEGACY_ONLY'|LEGACY_ONLY)$/m.test(envExample), "LEGACY_ONLY debe ser el modo comercial predeterminado exacto");
  invariant(env.COMMERCIAL_TENANCY_WRITE_MODE === undefined || env.COMMERCIAL_TENANCY_WRITE_MODE === "LEGACY_ONLY", "configuración comercial distinta de LEGACY_ONLY permanece bloqueada en CI");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").trim().toUpperCase() === "LEGACY", "HYBRID permanece bloqueado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").trim().toLowerCase() !== "true", "tenant switch permanece bloqueado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").trim().toLowerCase() !== "true", "cliente V2 permanece bloqueado");

  for (const path of [".env.example", "vercel.json", "package.json", ".github/workflows/ci.yml"]) {
    const text = source(root, path, overrides);
    invariant(!/COMMERCIAL_TENANCY_WRITE_MODE\s*[:=]\s*["']?TENANT_WRITE\b/i.test(text), `${path} configura TENANT_WRITE`);
  }

  const bridge = source(root, "api/_lib/commercialTenancyWrite.js", overrides);
  invariant(/COMMERCIAL_TENANCY_CONFIGURATION_INVALID/.test(bridge) && /VERCEL_ENV/.test(bridge) && /\bVERCEL\b/.test(bridge), "TENANT_WRITE debe rechazarse dentro de Vercel");

  const runtimeFiles = [...walk(root, "api"), ...walk(root, "src")];
  const consumers = [];
  const runtimeSources = new Map(runtimeFiles.map((path) => [path, source(root, path, overrides)]));
  for (const [path, text] of Object.entries(extraRuntimeSources)) runtimeSources.set(normalized(path), text);
  for (const [path, text] of runtimeSources) {
    if (/await\s+createTenant(?:Client|Project)\s*\(/.test(text)) consumers.push(path);
    validateUpdateBlocks(path, text);
    invariant(!/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+["']?(?:osi["']?\.)?["']?osi_(?:clients|projects|leads|pipeline_cases)\b/i.test(text), `${path} contiene escritura SQL cruda sobre una raíz comercial`);
  }
  invariant(consumers.length === PREPARED_CONSUMERS.size && consumers.every((path) => PREPARED_CONSUMERS.has(path)), `consumidores preparados inesperados: ${consumers.join(", ")}`);

  const clients = source(root, "api/clients/index.js", overrides);
  const projects = source(root, "api/projects/index.js", overrides);
  for (const [name, text, permission] of [["Client", clients, "CLIENTS_CREATE"], ["Project", projects, "PROJECTS_CREATE"]]) {
    invariant(/requireCommercial(?:Write)?Permission/.test(text), `${name} no exige contexto comercial del servidor`);
    invariant(new RegExp(`PERMS\\.${permission}`).test(text), `${name} no conserva el permiso existente`);
    invariant(/assertNoBrowserCommercialAuthority\(body\)/.test(text), `${name} no rechaza autoridad empresarial del navegador`);
    invariant(/tenantId:\s*auth\.tenantId/.test(text), `${name} no deriva tenantId del contexto servidor`);
    invariant(!/body\.(?:tenantId|membershipId|ownerMembershipId|ownerUserId)|req\.query\.(?:tenantId|membershipId)|x-osi-(?:role|userid)/i.test(text), `${name} confía en autoridad del navegador`);
  }
  invariant(/createTenantClient/.test(clients), "Client no usa el escritor tenantizado central");
  invariant(/createTenantProject/.test(projects), "Project no valida y crea dentro del escritor tenantizado central");

  const creatorLocations = [];
  for (const [path, text] of runtimeSources) {
    for (const call of rootWriteCalls(text).filter(({ method }) => ["create", "createMany", "upsert"].includes(method))) {
      creatorLocations.push(`${path}:${call.model}.${call.method}`);
    }
  }
  invariant(JSON.stringify(creatorLocations.sort()) === JSON.stringify([
    "api/_lib/commercialTenancyWrite.js:client.create",
    "api/_lib/commercialTenancyWrite.js:project.create",
    "api/clients/index.js:client.create",
    "api/projects/index.js:project.create",
  ]), `creadores runtime no preparados: ${creatorLocations.join(", ")}`);

  const packageJson = JSON.parse(source(root, "package.json", overrides));
  invariant(!Object.values(packageJson.scripts || {}).some((command) => /mt-01c2b3a|commercial.*(?:backfill|tenant.*write)/i.test(String(command))), "el puente no puede ejecutarse desde scripts automáticos");

  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    mode: "LEGACY_ONLY",
    preparedConsumers: Object.freeze([...consumers].sort()),
    runtimeCreators: Object.freeze([...creatorLocations].sort()),
    pipelineCaseCreateBlocked: !creatorLocations.some((item) => item.includes(":pipelineCase.")),
    leadCreateBlocked: !creatorLocations.some((item) => item.includes(":lead.")),
  });
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(validateMt01c2b3a(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { name: error.name, message: error.message } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
