import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("OSi Plus Mobile stays inside the canonical Hub", () => {
  const workspace = read("src/hub/HubWorkspace.tsx");
  const mobileHub = read("src/hub/OsiPlusMobileHub.tsx");
  const catalog = read("src/hub/appCatalog.ts");

  assert.match(workspace, /SurveyVisualPreview/);
  assert.match(workspace, /@\/survey\/SurveyApp/);
  assert.match(workspace, /const surveyEnabled = isSurveyUiEnabled\(\)/);
  assert.match(workspace, /visualSurveyEnabled/);
  assert.match(workspace, /navigate\("\/mobile"\)/);
  assert.match(mobileHub, /onNavigate\("\/hub"\)/);
  assert.match(catalog, /route: "\/mobile\/survey"/);
  assert.match(catalog, /route: "\/mobile\/visual-inventory"/);
  assert.match(catalog, /route: "\/mobile\/custody"/);
  assert.match(workspace, /CustomerCustodyMobileApp/);
});

test("OSi Custodia reuses the authorized reception and scan workflow", () => {
  const mobile = read("src/customer-custody/CustomerCustodyMobileApp.tsx");
  const workflow = read("src/customer-custody/CustodyReceptionWorkflow.tsx");

  for (const authority of [
    "authorizations({ movementType: \"ENTRY\", available: true })",
    "Iniciar recepción por escaneo",
    "CustodyReceptionWorkflow",
    "QRCodeSVG",
    "El QR contiene solamente el identificador interno",
  ]) assert.match(mobile, new RegExp(authority.replace(/[{}()[\]]/g, "\\$&")));
  assert.match(workflow, /QRScanner/);
  assert.match(workflow, /Ubicación por doble lectura/);
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
