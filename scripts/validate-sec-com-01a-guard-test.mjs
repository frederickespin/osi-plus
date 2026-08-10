import { validateSecCom01aRepository, validateSecCom01aSources } from "./validate-sec-com-01a-guard.mjs";
import fs from "node:fs";

const root = process.cwd();
const baseline = {
  osiIndex: fs.readFileSync(`${root}/api/osis/index.js`, "utf8"),
  osiDetail: fs.readFileSync(`${root}/api/osis/[id].js`, "utf8"),
  dashboard: fs.readFileSync(`${root}/api/k/dashboard.js`, "utf8"),
  kLib: fs.readFileSync(`${root}/api/k/_lib.js`, "utf8"),
  http: fs.readFileSync(`${root}/api/_lib/http.js`, "utf8"),
  apiClient: fs.readFileSync(`${root}/src/lib/api.ts`, "utf8"),
  envExample: fs.readFileSync(`${root}/.env.example`, "utf8"),
};
const results = [];

function check(name, operation, expectedFailure = false) {
  try {
    operation();
    if (expectedFailure) throw new Error("La guardia aceptó el cambio inseguro");
    results.push({ name, passed: true });
  } catch (error) {
    if (!expectedFailure || !String(error?.message).includes("SEC-COM-01A")) throw error;
    results.push({ name, passed: true });
  }
}

check("repositorio actual aprobado", () => validateSecCom01aRepository(root));
check("GET /api/osis público rechazado", () => validateSecCom01aSources({
  ...baseline,
  osiIndex: baseline.osiIndex.replace(/\s*const context = await requirePilotPermission[\s\S]*?if \(!context\) return;\s*/, "\n"),
}), true);
check("GET /api/osis/:id público rechazado", () => validateSecCom01aSources({
  ...baseline,
  osiDetail: baseline.osiDetail.replace(/\s*const context = await requirePilotPermission[\s\S]*?if \(!context\) return;\s*/, "\n"),
}), true);
check("header falsificado en GET OSI rechazado", () => validateSecCom01aSources({
  ...baseline,
  osiIndex: baseline.osiIndex.replace('if (req.method === "GET") {', 'if (req.method === "GET") {\nconst forged = req.headers["x-osi-role"];'),
}), true);
check("cache compartida en GET OSI rechazada", () => validateSecCom01aSources({
  ...baseline,
  osiIndex: baseline.osiIndex.replace("setPrivateNoStore(res);", ""),
}), true);
check("dashboard por headers heredados rechazado", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace(/\s*const context = await requirePilotPermission[\s\S]*?if \(!context\) return;\s*/, '\n  const context = requireRoleFromHeaders(req, res, ["K", "A"]);\n'),
}), true);
check("dashboard sin roles A/K rechazado", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace('["A", "K"].includes(context.role)', '["A", "K", "V"].includes(context.role)'),
}), true);
check("cache compartida en dashboard rechazada", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace("setPrivateNoStore(res);", ""),
}), true);
check("Vary Authorization ausente rechazado", () => validateSecCom01aSources({
  ...baseline,
  http: baseline.http.replace('appendVary(res, "Authorization");', ""),
}), true);
check("fallback dependiente del reloj rechazado", () => validateSecCom01aSources({
  ...baseline,
  kLib: baseline.kLib.replace('new Date("2099-12-31T00:00:00.000Z")', "new Date()"),
}), true);
check("escritura Prisma desde dashboard GET rechazada", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace("const now = new Date();", 'await prisma.projectSignal.createMany({ data: [] });\n  const now = new Date();'),
}), true);
check("reinicialización de señales desde GET rechazada", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace("const now = new Date();", "await ensureDefaultSignals(prisma, 'x', '2026-01-01');\n  const now = new Date();"),
}), true);
check("segunda lectura de proyectos desde GET rechazada", () => validateSecCom01aSources({
  ...baseline,
  dashboard: baseline.dashboard.replace("const now = new Date();", "await prisma.project.findMany();\n  const now = new Date();"),
}), true);
check("cliente OSI sin Bearer rechazado", () => validateSecCom01aSources({
  ...baseline,
  apiClient: baseline.apiClient.replace('(`/osis${suffix}`, { token: getToken() || undefined })', '(`/osis${suffix}`)'),
}), true);
check("cliente dashboard sin Bearer rechazado", () => validateSecCom01aSources({
  ...baseline,
  apiClient: baseline.apiClient.replace(/\(\s*"\/k\/dashboard",\s*\{\s*token:\s*getToken\(\)\s*\|\|\s*undefined\s*\},\s*\)/, '("/k/dashboard")'),
}), true);
check("HYBRID predeterminado rechazado", () => validateSecCom01aSources({
  ...baseline,
  envExample: baseline.envExample.replace('MT01B_AUTH_MODE="LEGACY"', 'MT01B_AUTH_MODE="HYBRID"'),
}), true);
check("tenant switch predeterminado rechazado", () => validateSecCom01aSources({
  ...baseline,
  envExample: baseline.envExample.replace('MT01B_TENANT_SWITCH_ENABLED="false"', 'MT01B_TENANT_SWITCH_ENABLED="true"'),
}), true);
check("cliente V2 predeterminado rechazado", () => validateSecCom01aSources({
  ...baseline,
  envExample: baseline.envExample.replace('VITE_MT01B2_CLIENT_ENABLED="false"', 'VITE_MT01B2_CLIENT_ENABLED="true"'),
}), true);

process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
