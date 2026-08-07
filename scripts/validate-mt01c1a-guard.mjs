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
    if (entry.isDirectory()) return collect(target);
    return /\.(?:js|mjs|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

export function validateMt01c1aGuard(root = process.cwd()) {
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "MT-01C1A: LEGACY debe seguir predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1A: tenant switch debe seguir desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "MT-01C1A: cliente V2 debe seguir desactivado");

  const runtimeFiles = [...collect(path.join(root, "api")), ...collect(path.join(root, "src"))];
  const forbidden = [];
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (/prisma\.employeeProfile\b|from\s+["'][^"']*employeeProfile|import\s*\([^)]*employeeProfile/i.test(source)) {
      forbidden.push(path.relative(root, file).replaceAll("\\", "/"));
    }
  }
  invariant(forbidden.length === 0, `MT-01C1A: EmployeeProfile no puede tener consumidores runtime: ${forbidden.join(", ")}`);
  return { runtimeFiles: runtimeFiles.length, employeeProfileRuntimeConsumers: 0, legacy: true, hybrid: false, tenantSwitch: false, clientV2: false };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateMt01c1aGuard() })}\n`);
