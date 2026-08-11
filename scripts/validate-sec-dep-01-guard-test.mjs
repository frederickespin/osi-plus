import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSecDep01 } from "./validate-sec-dep-01-guard.mjs";

const root = process.cwd();
const results = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");

function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}

function rejected(name, options, pattern) {
  let error;
  try { validateSecDep01({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateSecDep01({ root });
  check("repositorio actual aprobado", baseline.ok && baseline.dompurify === "3.4.13" && baseline.browserTests === 15);

  const packageJson = JSON.parse(read("package.json"));
  rejected("versión declarada vulnerable rechazada", {
    overrides: { "package.json": JSON.stringify({ ...packageJson, dependencies: { ...packageJson.dependencies, dompurify: "^3.3.1" } }) },
  }, /3\.4\.13/);

  const lock = read("package-lock.json");
  rejected("DOMPurify 3.3.1 en lockfile rechazado", {
    overrides: { "package-lock.json": lock.replaceAll("3.4.13", "3.3.1") },
  }, /3\.4\.13|3\.3\.1/);

  const editor = read("src/components/modules/TemplateEditorModule.tsx");
  rejected("ADD_TAGS rechazado", {
    overrides: { "src/components/modules/TemplateEditorModule.tsx": editor.replace("DOMPurify.sanitize(picBodyHtml", "DOMPurify.sanitize(picBodyHtml, { ADD_TAGS: ['script'] }) || DOMPurify.sanitize(picBodyHtml") },
  }, /amplía|debilita/);
  rejected("ADD_ATTR rechazado", {
    overrides: { "src/components/modules/TemplateEditorModule.tsx": `${editor}\nconst unsafeAttributes = { ADD_ATTR: ['onerror'] };` },
  }, /amplía|debilita/);
  rejected("custom elements rechazados", {
    overrides: { "src/components/modules/TemplateEditorModule.tsx": `${editor}\nconst unsafeCustomElements = { CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /.*/ } };` },
  }, /amplía|debilita/);
  rejected("RETURN_DOM rechazado", {
    overrides: { "src/components/modules/TemplateEditorModule.tsx": `${editor}\nconst unsafe = { RETURN_DOM: true };` },
  }, /amplía|debilita/);
  rejected("hook permisivo rechazado", {
    overrides: { "src/components/modules/TemplateEditorModule.tsx": `${editor}\nDOMPurify.addHook('uponSanitizeElement', () => {});` },
  }, /amplía|debilita/);

  rejected("dangerouslySetInnerHTML nuevo rechazado", {
    extraSources: { "src/components/UnsafeFixture.tsx": "export const Unsafe = () => <div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />;" },
  }, /inventario cerrado/);

  const harness = read("tests/sec-dep-01/dompurifyHarness.tsx");
  rejected("consumidor ausente del harness rechazado", {
    overrides: { "tests/sec-dep-01/dompurifyHarness.tsx": harness.replace("import { TemplatesCenterModule }", "import { MissingCenterModule }") },
  }, /TemplatesCenterModule/);

  const workflow = read(".github/workflows/ci.yml");
  rejected("suite ausente de CI rechazada", {
    overrides: { ".github/workflows/ci.yml": workflow.replace("run: npm run test:sec-dep-01:browser", "run: npm run test:auth-null:browser") },
  }, /no ejecuta/);

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
