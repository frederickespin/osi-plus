import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function collect(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(target) : /\.(?:js|mjs|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

export function validateMt01c1b1Guard(root = process.cwd()) {
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "MT-01C1B1: LEGACY debe seguir predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1B1: tenant switch debe seguir desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1B1: cliente V2 debe seguir desactivado");

  const runtimeFiles = [...collect(path.join(root, "api")), ...collect(path.join(root, "src"))];
  const pattern = /prisma\.(?:employeeProvisioningRequest|employeeProvisioningInvitation|employeeAdminRoleProposal)\b|from\s+["'][^"']*mt-01c1b1|import\s*\([^)]*mt-01c1b1/i;
  const consumers = runtimeFiles.filter((file) => pattern.test(fs.readFileSync(file, "utf8")));
  invariant(consumers.length === 0, `MT-01C1B1: persistencia de provisión no puede tener consumidores runtime: ${consumers.map((file) => path.relative(root, file).replaceAll("\\", "/")).join(", ")}`);

  return {
    runtimeFiles: runtimeFiles.length,
    provisioningRuntimeConsumers: 0,
    legacy: true,
    hybrid: false,
    tenantSwitch: false,
    clientV2: false,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateMt01c1b1Guard() })}\n`);
