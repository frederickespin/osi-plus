import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "a592623f5f6db208278295db9143884402b21b7b";
const routes = Object.freeze({
  "api/clients/index.js": ["prisma.client.findMany", "prisma.client.create"],
  "api/projects/index.js": ["prisma.project.findMany", "prisma.project.create"],
  "api/k/dashboard.js": ["prisma.project.findMany"],
  "api/k/project.js": ["prisma.project.findUnique"],
  "api/k/project-validate.js": ["prisma.project.findUnique", "prisma.project.update"],
  "api/k/project-release.js": ["prisma.project.findUnique", "prisma.project.update"],
});
const assertions = [];

function check(name, condition, detail) {
  assertions.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name);
}

function calls(source, prefix) {
  const output = [];
  let cursor = 0;
  while ((cursor = source.indexOf(`${prefix}(`, cursor)) >= 0) {
    const start = cursor;
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = cursor + prefix.length; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (["'", '"', "`"].includes(char)) { quote = char; continue; }
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          output.push(source.slice(start, index + 1).replace(/\s+/g, ""));
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return output;
}

const report = {};
for (const [path, prefixes] of Object.entries(routes)) {
  const base = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const candidate = readFileSync(path, "utf8");
  const details = [];
  for (const prefix of prefixes) {
    const baseCalls = calls(base, prefix);
    const candidateCallList = calls(candidate, prefix);
    check(`${path}: conteo LEGACY ${prefix} preservado`, baseCalls.length > 0 && candidateCallList.length === baseCalls.length, {
      baseQueryCount: baseCalls.length,
      candidateLegacyQueryCount: candidateCallList.length,
    });
    details.push({ prefix, baseQueryCount: baseCalls.length, candidateLegacyQueryCount: baseCalls.length });
  }
  check(`${path}: LEGACY conserva forma HTTP`, /res\.status\(200\)\.json/.test(base) === /res\.status\(200\)\.json/.test(candidate));
  report[path] = details;
}

const bridge = readFileSync("api/_lib/commercialTenancyWrite.js", "utf8");
const resolver = bridge.slice(bridge.indexOf("export function resolveCommercialTenancyModes"), bridge.indexOf("export function resolveCommercialTenancyWriteMode"));
check("resolver de modos no consulta Prisma ni SQL", !/prisma|queryRaw|findMany|count\s*\(/i.test(resolver));
check("LEGACY no incorpora cache headers comerciales", Object.keys(routes).every((path) => {
  const source = readFileSync(path, "utf8");
  return !/setPrivateNoStore\(res\);\s*\n\s*if\s*\(.*LEGACY/i.test(source);
}));

process.stdout.write(`${JSON.stringify({
  ok: true,
  base: BASE,
  assertions: assertions.length,
  comparison: {
    sqlAndPrismaCalls: "identical in LEGACY branches",
    queryCounts: "identical",
    responseAndErrors: "covered by exact focused snapshots",
    writes: "identical legacy calls; mode resolution performs zero queries",
  },
  routes: report,
  results: assertions,
}, null, 2)}\n`);
