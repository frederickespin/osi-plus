import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.V17_COMMERCIAL_RELOAD_GUARD_ROOT || process.cwd());
const read = (path) => readFileSync(resolve(root, path), "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`V17_COMMERCIAL_RELOAD_GUARD:${message}`); };

const spec = read("tests/v17-commercial-crm/commercial-inbox.spec.ts");
const helper = read("tests/v17-commercial-crm/commercialTestHarness.mjs");
const harnessTest = read("scripts/validate-v17-commercial-test-harness.mjs");
const workflow = read(".github/workflows/ci.yml");
const packageJson = JSON.parse(read("package.json"));

const testStart = spec.indexOf('test("Ficha soporta deep link, reload, error accesible y regreso preservando filtros"');
const testEnd = spec.indexOf('\ntest("APPROVED permanece', testStart);
invariant(testStart >= 0 && testEnd > testStart, "prueba afectada ausente");
const affected = spec.slice(testStart, testEnd);
const barrierStart = affected.indexOf('const preReloadDetail = detailBarrier.prepare("pre-reload-valid-detail", detailPath)');
const reloadIndex = affected.indexOf("await page.reload()", barrierStart);
invariant(barrierStart >= 0 && reloadIndex > barrierStart, "barrera previa al reload ausente");
const preReload = affected.slice(barrierStart, reloadIndex);

const ordered = [
  'detailBarrier.prepare("pre-reload-valid-detail", detailPath)',
  'getByRole("button", { name: /Ficha del caso/ }).first().click()',
  "toHaveURL",
  "Cargando la autoridad relacional del caso",
  "controlledGate.release()",
  "await preReloadDetail.completion",
  "Receptor verificado: Receptor Sintético",
  "detailBarrier.markUiStable(preReloadDetail",
  "detailBarrier.assertReadyForReload(preReloadDetail)",
  "expect(detailBarrier.pendingCount).toBe(0)",
  'detailBarrier.prepare("post-reload-valid-detail", detailPath)',
];
let cursor = 0;
for (const marker of ordered) {
  const index = preReload.indexOf(marker, cursor);
  invariant(index >= cursor, `orden de barrera incompleto: ${marker}`);
  cursor = index + marker.length;
}
invariant(/createControlledGate\(\)/.test(affected), "respuesta retrasada no usa compuerta determinística");
invariant(!/waitForTimeout|setTimeout|sleep\s*\(|retries|access control checks|webkit/i.test(preReload), "barrera usa espera, retry o filtro por motor/texto");
invariant(/expect\(pageErrors\)\.toEqual\(\[\]\)/.test(affected), "aserción pageerror fue eliminada");
invariant(!/pageErrors\.(?:length\s*=\s*0|splice|pop|shift)|pageErrors\s*=\s*\[\]/.test(affected), "pageErrors se limpia antes de afirmar");
invariant(/unexpected-abort-probe/.test(affected) && /interceptor-removed-probe/.test(affected), "casos abort/interceptor retirado ausentes");
invariant(/INVALID/.test(affected) && /VALID/.test(affected) && /HTTP_500/.test(harnessTest), "matriz válida/inválida/500 incompleta");

for (const marker of [
  "detail:expected", "detail:intercepted", "detail:fulfill:start", "detail:fulfill:done",
  "detail:fulfill:failed", "detail:ui:stable", "detail:reload:allowed", "detail:interceptor:removed",
  "requestfailed", "pageerror", "console", "contentType", "status", "method", "viewport", "testName",
]) invariant(helper.includes(marker), `diagnóstico incompleto: ${marker}`);
invariant(/UUID_PATTERN[\s\S]*EMAIL_PATTERN[\s\S]*BEARER_PATTERN[\s\S]*JWT_PATTERN[\s\S]*CONNECTION_PATTERN/.test(helper), "sanitización obligatoria incompleta");
invariant(!/request\.headers\(|response\.body\(|request\.postData\(|trace:\s*["']on|video:\s*["']on/.test(helper), "diagnóstico captura headers, bodies, trace o video");
invariant(/testInfo\.status !== testInfo\.expectedStatus[\s\S]*writeFailureArtifact/.test(helper), "artefacto no está limitado a fallo");

invariant(packageJson.scripts?.["guard:v17-commercial-inbox-reload-race"] === "node scripts/validate-v17-commercial-inbox-reload-race-guard.mjs && node scripts/validate-v17-commercial-inbox-reload-race-guard-test.mjs && node scripts/validate-v17-commercial-test-harness.mjs", "script de guardia focalizada ausente");
invariant(workflow.includes("npm run guard:v17-commercial-inbox-reload-race"), "guardia no es obligatoria en CI");
invariant(/Validate inactive V17 Commercial Inbox[\s\S]{0,250}COMMERCIAL_CRM_ARTIFACT_DIR:[\s\S]{0,180}npm run test:v17-commercial-crm:browser/.test(workflow), "suite no recibe directorio de artefactos");
invariant(/Upload Commercial Inbox failure diagnostics[\s\S]{0,120}if: failure\(\)[\s\S]{0,220}v17-commercial-crm-playwright-artifacts/.test(workflow), "upload sanitizado ante fallo ausente");

console.log(JSON.stringify({ ok: true, barrierSteps: ordered.length, sanitizedEvents: 16, runtimeTouched: false }));
