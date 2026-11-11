import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("OSi Plus Mobile stays inside the canonical Hub", () => {
  const workspace = read("src/hub/HubWorkspace.tsx");
  const mobileHub = read("src/hub/OsiPlusMobileHub.tsx");
  const catalog = read("src/hub/appCatalog.ts");

  assert.match(workspace, /SurveyVisualPreview/);
  assert.match(workspace, /const surveyEnabled = isSurveyUiEnabled\(\)/);
  assert.match(workspace, /navigate\("\/mobile"\)/);
  assert.doesNotMatch(workspace, /@\/survey\/SurveyApp/);
  assert.match(mobileHub, /onNavigate\("\/hub"\)/);
  assert.match(catalog, /route: "\/mobile\/survey"/);
  assert.match(catalog, /route: "\/mobile\/visual-inventory"/);
});

test("the approved OSi Survey experience is the one mounted by Mobile", () => {
  const survey = read("src/crm-survey-preview/SurveyVisualPreview.tsx");

  for (const label of [
    "Ana Evaluadora",
    "15 visitas asignadas",
    "Visitas programadas",
    "Inventario",
    "Accesos",
    "Revisión",
    "Detalle técnico",
    "Firma",
    "Ruta del día",
  ]) assert.match(survey, new RegExp(label));
});
