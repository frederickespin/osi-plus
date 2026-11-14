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
  assert.match(workspace, /selected\?\.appId === "osi-survey" && surveyEnabled && surveyAuthorized && surveyRuntimeMode === "LOCAL_ONLY"/);
  assert.match(workspace, /selected\?\.appId === "osi-survey" && surveyAuthorized/);
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
    "Cada hoja se imprime completa",
  ]) assert.match(mobile, new RegExp(authority.replace(/[{}()[\]]/g, "\\$&")));
  assert.match(workflow, /QRScanner/);
  assert.match(workflow, /Escanee primero la ubicación y después cada artículo/);
  assert.match(workflow, /Pegue una etiqueta, escanéela/);
  assert.match(workflow, /Catálogo QR/);
  assert.match(workflow, /Usar scanner/);
  assert.match(workflow, /\$\{prefix\}:\$\{code\}/);
  assert.match(workflow, /DLOC/);
  assert.match(workflow, /Cantidad de etiquetas/);
  assert.match(workflow, /QR únicos/);
  assert.match(workflow, /tipo físico se registra al describir/);
  assert.match(workflow, /Imprimir lote/);
  assert.match(workflow, /deje impresas las etiquetas antes de abrir el vehículo/);
  assert.match(workflow, /Más etiquetas/);
  assert.match(workflow, /Todo conciliado/);
  assert.match(mobile, /Maco ML-1000/);
  assert.match(mobile, /Hoja nueva · Posición 1/);
  assert.match(mobile, /sequenceText/);
  assert.match(mobile, /body > \*:not\(\.custody-label-dialog\) \{ display: none !important/);
  assert.match(mobile, /break-inside: avoid-page !important/);
  assert.match(mobile, /custody-label-print-area \{ position: static !important/);
  assert.match(workflow, /DISCARD_UNUSED_LABELS/);
  assert.match(workflow, /Anular sobrantes/);
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
