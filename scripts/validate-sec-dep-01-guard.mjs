import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MINIMUM_VERSION = Object.freeze([3, 4, 13]);
const EDITABLE_CONSUMERS = Object.freeze([
  "src/components/modules/TemplateEditorModule.tsx",
  "src/components/modules/TemplatesCenterModule.tsx",
]);
const EXPECTED_DANGEROUS_HTML = Object.freeze([
  ...EDITABLE_CONSUMERS,
  "src/components/ui/chart.tsx",
]);
const FORBIDDEN_CONFIGURATION = /\b(?:ADD_TAGS|ADD_ATTR|CUSTOM_ELEMENT_HANDLING|RETURN_DOM|RETURN_DOM_FRAGMENT|RETURN_TRUSTED_TYPE)\b|DOMPurify\s*\.\s*(?:addHook|setConfig)/;

function invariant(condition, message) {
  if (!condition) throw new Error(`SEC-DEP-01: ${message}`);
}

function filesBelow(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesBelow(path));
    else found.push(path);
  }
  return found;
}

function versionAtLeast(version, minimum = MINIMUM_VERSION) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

export function validateSecDep01({ root = process.cwd(), overrides = {}, extraSources = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const packageJson = JSON.parse(read("package.json"));
  const packageLockText = read("package-lock.json");
  const packageLock = JSON.parse(packageLockText);
  const declared = packageJson.dependencies?.dompurify;
  const lockedRoot = packageLock.packages?.[""]?.dependencies?.dompurify;
  const lockedVersion = packageLock.packages?.["node_modules/dompurify"]?.version;

  invariant(typeof declared === "string" && versionAtLeast(declared.replace(/^[~^]/, "")), "package.json debe exigir DOMPurify >= 3.4.13");
  invariant(typeof lockedRoot === "string" && versionAtLeast(lockedRoot.replace(/^[~^]/, "")), "la dependencia raíz del lockfile quedó por debajo de 3.4.13");
  invariant(versionAtLeast(lockedVersion), "package-lock.json debe resolver DOMPurify >= 3.4.13");
  invariant(lockedVersion !== "3.3.1" && !packageLockText.includes("dompurify-3.3.1.tgz"), "DOMPurify 3.3.1 continúa en el lockfile");

  const sources = { ...extraSources };
  for (const absolute of filesBelow(resolve(root, "src"))) {
    if (!/\.[cm]?[jt]sx?$/.test(absolute)) continue;
    const path = relative(root, absolute).replaceAll("\\", "/");
    sources[path] ??= read(path);
  }
  const dangerousHtmlFiles = Object.entries(sources)
    .filter(([, source]) => /dangerouslySetInnerHTML\s*=/.test(source))
    .map(([path]) => path)
    .sort();
  invariant(JSON.stringify(dangerousHtmlFiles) === JSON.stringify([...EXPECTED_DANGEROUS_HTML].sort()), "cambió el inventario cerrado de dangerouslySetInnerHTML");

  for (const path of EDITABLE_CONSUMERS) {
    const source = sources[path];
    invariant(/import DOMPurify from ["']dompurify["']/.test(source), `${path} no importa el sanitizador oficial`);
    invariant(/dangerouslySetInnerHTML\s*=\s*\{\{[\s\S]{0,180}DOMPurify\.sanitize\(/.test(source), `${path} renderiza HTML editable sin sanitización inmediata`);
    invariant(!FORBIDDEN_CONFIGURATION.test(source), `${path} amplía o debilita la configuración segura`);
  }
  const chart = sources["src/components/ui/chart.tsx"];
  invariant(/Object\.entries\(THEMES\)/.test(chart) && /Object\.entries\(config\)/.test(chart), "chart.tsx dejó de limitarse a CSS estructurado interno");

  const harness = read("tests/sec-dep-01/dompurifyHarness.tsx");
  const spec = read("tests/sec-dep-01/dompurify-components.spec.ts");
  for (const component of ["TemplateEditorModule", "TemplatesCenterModule"]) {
    invariant(harness.includes(`import { ${component} }`), `${component} no se renderiza desde el harness real`);
    invariant(spec.includes(component.replace("Module", "")) || spec.includes(component), `${component} no está representado en las pruebas`);
  }
  invariant(/const modules: ModuleName\[\] = \["center", "editor"\]/.test(spec), "las pruebas no cubren ambos flujos activos");
  invariant(/unexpectedRequests[\s\S]*toEqual\(\[\]\)/.test(spec), "las pruebas no bloquean solicitudes externas");
  invariant(/__secDepExecuted[\s\S]*executed:\s*0/.test(spec), "las pruebas no verifican ejecución posterior al render");

  const config = read("playwright.sec-dep.config.ts");
  for (const browser of ["chromium", "firefox", "webkit"]) invariant(config.includes(`name: "${browser}"`), `falta ${browser}`);
  invariant(config.includes("sec-dep-01-browser-ci-reporter.mjs"), "falta reporter estricto de 15/15");
  const reporter = read("scripts/sec-dep-01-browser-ci-reporter.mjs");
  invariant(/chromium:\s*5, firefox:\s*5, webkit:\s*5/.test(reporter), "el reporter no exige 5 pruebas por navegador");
  invariant(/skipped\s*!==\s*0/.test(reporter), "el reporter permite pruebas omitidas");

  const workflow = read(".github/workflows/ci.yml");
  const scripts = packageJson.scripts || {};
  invariant(scripts["test:sec-dep-01:browser"] === "playwright test -c playwright.sec-dep.config.ts", "comando npm SEC-DEP-01 divergente");
  invariant(workflow.includes("run: npm run test:sec-dep-01:browser"), "browser-session-validation no ejecuta SEC-DEP-01");
  invariant(workflow.includes("node scripts/validate-sec-dep-01-guard.mjs"), "CI no ejecuta la guardia SEC-DEP-01");

  return Object.freeze({
    ok: true,
    dompurify: lockedVersion,
    editableConsumers: EDITABLE_CONSUMERS.length,
    dangerousHtmlFiles: dangerousHtmlFiles.length,
    browserTests: 15,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateSecDep01(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
