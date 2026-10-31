import assert from "node:assert/strict";
import { draftFromPolicy, newPolicyDraft, newPolicyLine, percentageHundredths, policySavePayload, validatePolicyDraft } from "../src/crm-services/materialPolicyDraft.ts";

let checks = 0;
const check = (name, run) => { run(); checks += 1; console.log(`PASS ${name}`); };
const materialRef = "91000000-0000-4000-8000-000000000001";
const assetRef = "91000000-0000-4000-8000-000000000002";
const modeRef = "91000000-0000-4000-8000-000000000003";
const resources = [
  { kind: "MATERIAL", resourceRef: materialRef, code: "MAT-1", name: "Material sintético", family: "PACKING" },
  { kind: "ASSET", resourceRef: assetRef, code: "AST-1", name: "Recurso sintético", family: "REUSABLE" },
];
const validDraft = () => ({ ...newPolicyDraft(), name: "Política sintética", modeRef, lines: [
  { ...newPolicyLine(), authorityRef: materialRef, materialClass: "NEW_CARDBOARD", percentage: "70" },
  { ...newPolicyLine(), authorityKind: "ASSET", authorityRef: assetRef, materialClass: "REUSABLE_CONTAINER", percentage: "30", disposition: "RETURNABLE", chargeType: "USAGE" },
] });

check("un alta genera sólo borrador local y envía código automático", () => {
  const draft = validDraft();
  assert.equal(draft.code, null);
  assert.equal(policySavePayload(draft).code, null);
  assert.equal(validatePolicyDraft(draft, resources).valid, true);
});
check("porcentajes visibles se convierten a razones sin confundir70 con0.70", () => {
  const payload = policySavePayload(validDraft());
  assert.deepEqual(payload.lines.map((line) => line.proportion), [0.7, 0.3]);
  assert.equal(percentageHundredths("12,34"), 1234);
  assert.equal(percentageHundredths("12.34"), 1234);
});
check("cero explícito y ausencia de proporción permanecen distintos", () => {
  const draft = validDraft();
  draft.lines[0].percentage = "";
  draft.lines[1].percentage = "0";
  const payload = policySavePayload(draft);
  assert.equal(payload.lines[0].proportion, null);
  assert.equal(payload.lines[1].proportion, 0);
  assert.equal(validatePolicyDraft(draft, resources).valid, false);
  draft.lines[1].percentage = "";
  assert.equal(validatePolicyDraft(draft, resources).valid, true);
});
check("precisión y rango inválidos bloquean antes del envío", () => {
  for (const value of ["101", "-1", "0.001", "NaN", "Infinity", "1e2", "1,2,3"]) {
    const draft = validDraft(); draft.lines[0].percentage = value;
    assert.equal(validatePolicyDraft(draft, resources).valid, false, value);
    assert.throws(() => policySavePayload(draft), /PERCENTAGE_INVALID/);
  }
});
check("total y tolerancia coinciden con el contrato persistido", () => {
  const draft = validDraft(); draft.lines[0].percentage = "69.98";
  assert.equal(validatePolicyDraft(draft, resources).valid, false);
  draft.lines[0].percentage = "69.99";
  assert.equal(validatePolicyDraft(draft, resources).valid, true);
  draft.lines[0].percentage = "70";
  assert.equal(validatePolicyDraft(draft, resources).totalPercentage, 100);
});
check("la fila conserva su identidad al cambiar de recurso", () => {
  const draft = validDraft(); const rowId = draft.lines[0].rowId;
  const updated = { ...draft.lines[0], authorityKind: "ASSET", authorityRef: assetRef };
  assert.equal(updated.rowId, rowId);
  assert.notEqual(newPolicyLine().rowId, rowId);
});
check("recurso inactivo o ajeno al lookup no se elimina ni se publica", () => {
  const draft = validDraft();
  const result = validatePolicyDraft(draft, resources.slice(0, 1));
  assert.equal(result.valid, false);
  assert.match(result.rows[draft.lines[1].rowId].resource, /ya no está disponible/);
  assert.equal(draft.lines[1].authorityRef, assetRef);
});
check("clase y ámbito se declaran explícitamente", () => {
  const draft = validDraft(); draft.modeRef = ""; draft.lines[0].materialClass = " ";
  const result = validatePolicyDraft(draft, resources);
  assert.equal(result.valid, false);
  assert.ok(result.general.scope);
  assert.ok(result.rows[draft.lines[0].rowId].materialClass);
  assert.equal(draft.lines[0].materialClass, " ");
});
check("versionar conserva reglas, condiciones, vigencia y código previos", () => {
  const line = { lineRef: "91000000-0000-4000-8000-000000000004", materialRef, assetModelRef: null, materialClass: "NEW", disposition: "CONSUMED", proportion: 1, chargeType: "SALE", preparationRule: { applicable: true }, maintenanceRule: { schedule: "AFTER_USE" }, deteriorationRule: { chargeable: true }, replacementRule: { approved: false }, conditions: { nested: { special: ["keep"] } } };
  const source = { policyRef: "91000000-0000-4000-8000-000000000005", versionRef: "91000000-0000-4000-8000-000000000006", code: "LEGACY_POLICY", name: "Existente", version: 3, state: "PUBLISHED", packageVersionRef: null, serviceRef: null, modeRef, preferenceCode: "REUSABLE_ALLOWED", standardCode: "CUSTOM", validFrom: "2026-10-01T00:00:00.000Z", validTo: "2027-01-01T00:00:00.000Z", lines: [line] };
  const draft = draftFromPolicy(source); draft.name = "Nombre actualizado";
  const payload = policySavePayload(draft);
  assert.equal(payload.code, source.code);
  assert.equal(payload.expectedVersion, 3);
  assert.equal(payload.state, "DRAFT");
  assert.equal(payload.validFrom, source.validFrom);
  assert.equal(payload.validTo, source.validTo);
  assert.equal(payload.preferenceCode, source.preferenceCode);
  for (const key of ["preparationRule", "maintenanceRule", "deteriorationRule", "replacementRule", "conditions"]) assert.deepEqual(payload.lines[0][key], line[key]);
  assert.equal(source.name, "Existente");
  assert.equal(payload.lines[0].rowId, undefined);
  assert.equal(payload.lines[0].percentage, undefined);
});
check("no se permite una política sin filas o superior al límite", () => {
  const draft = validDraft(); draft.lines = [];
  assert.equal(validatePolicyDraft(draft, resources).valid, false);
  draft.lines = Array.from({ length: 101 }, () => ({ ...newPolicyLine(), authorityRef: materialRef, materialClass: "NEW" }));
  assert.equal(validatePolicyDraft(draft, resources).valid, false);
});
console.log(JSON.stringify({ ok: true, checks, writes: false }));
