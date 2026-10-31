import type { ServiceMaterialPolicy, ServiceMaterialResource } from "./api";

type Rule = Readonly<Record<string, unknown>>;
export type PolicyLineDraft = Readonly<{
  rowId: string;
  authorityKind: "MATERIAL" | "ASSET";
  authorityRef: string;
  materialClass: string;
  disposition: "CONSUMED" | "RENTED" | "RETURNABLE" | "USAGE_CHARGE";
  percentage: string;
  chargeType: "INCLUDED" | "SALE" | "RENTAL" | "USAGE" | "PREPARATION" | "MAINTENANCE" | "DETERIORATION" | "REPLACEMENT";
  preparationRule: Rule;
  maintenanceRule: Rule;
  deteriorationRule: Rule;
  replacementRule: Rule;
  conditions: Rule;
}>;

export type PolicyDraft = Readonly<{
  policyRef: string | null;
  expectedVersion: number | null;
  code: string | null;
  name: string;
  packageVersionRef: string;
  serviceRef: string;
  modeRef: string;
  preferenceCode: string;
  standardCode: string;
  validFrom: string | null;
  validTo: string | null;
  lines: readonly PolicyLineDraft[];
  state: "DRAFT" | "PUBLISHED";
}>;

export function newPolicyLine(): PolicyLineDraft {
  return {
    rowId: crypto.randomUUID(), authorityKind: "MATERIAL", authorityRef: "", materialClass: "",
    disposition: "CONSUMED", percentage: "", chargeType: "SALE",
    preparationRule: {}, maintenanceRule: {}, deteriorationRule: {}, replacementRule: {}, conditions: {},
  };
}

export function newPolicyDraft(): PolicyDraft {
  return {
    policyRef: null, expectedVersion: null, code: null, name: "", packageVersionRef: "", serviceRef: "",
    modeRef: "", preferenceCode: "", standardCode: "STANDARD", validFrom: null, validTo: null,
    lines: [newPolicyLine()], state: "DRAFT",
  };
}

export function draftFromPolicy(row: ServiceMaterialPolicy): PolicyDraft {
  return {
    policyRef: row.policyRef, expectedVersion: row.version, code: row.code, name: row.name,
    packageVersionRef: row.packageVersionRef || "", serviceRef: row.serviceRef || "", modeRef: row.modeRef || "",
    preferenceCode: row.preferenceCode || "", standardCode: row.standardCode,
    validFrom: row.validFrom, validTo: row.validTo, state: "DRAFT",
    lines: row.lines.map((line) => ({
      rowId: crypto.randomUUID(), authorityKind: line.materialRef ? "MATERIAL" : "ASSET",
      authorityRef: line.materialRef || line.assetModelRef || "", materialClass: line.materialClass,
      disposition: line.disposition as PolicyLineDraft["disposition"],
      percentage: line.proportion === null ? "" : String(Number((line.proportion * 100).toFixed(2))),
      chargeType: line.chargeType as PolicyLineDraft["chargeType"],
      preparationRule: line.preparationRule, maintenanceRule: line.maintenanceRule,
      deteriorationRule: line.deteriorationRule, replacementRule: line.replacementRule, conditions: line.conditions,
    })),
  };
}

// Percentage cells allow the same precision as the persisted ratio (four decimal places).
export function percentageHundredths(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return result <= 10_000 ? result : Number.NaN;
}

type RowErrors = Partial<Record<"resource" | "materialClass" | "percentage", string>>;
export function validatePolicyDraft(draft: PolicyDraft, resources?: readonly ServiceMaterialResource[]) {
  const general: Record<string, string> = {};
  const rows: Record<string, RowErrors> = {};
  if (!draft.name.trim()) general.name = "Escriba el nombre de la política.";
  if (!draft.packageVersionRef && !draft.serviceRef && !draft.modeRef) general.scope = "Seleccione una combinación, un servicio o una modalidad.";
  if (!draft.standardCode.trim()) general.standard = "Escriba el estándar de la política.";
  if (!draft.lines.length) general.lines = "Agregue al menos una fila.";
  if (draft.lines.length > 100) general.lines = "La política admite hasta 100 filas.";
  const available = resources ? new Set(resources.map((item) => `${item.kind}:${item.resourceRef}`)) : null;
  let total = 0;
  let declared = 0;
  let invalidPercentage = false;
  for (const line of draft.lines) {
    const errors: RowErrors = {};
    if (!line.authorityRef) errors.resource = "Seleccione el material o recurso.";
    else if (available && !available.has(`${line.authorityKind}:${line.authorityRef}`)) errors.resource = "Este recurso ya no está disponible. Seleccione otro del catálogo.";
    if (!line.materialClass.trim()) errors.materialClass = "Indique la clase del material o recurso.";
    const percentage = percentageHundredths(line.percentage);
    if (percentage !== null) {
      declared += 1;
      if (!Number.isFinite(percentage)) {
        errors.percentage = "Use un porcentaje entre 0 y 100, con hasta 2 decimales.";
        invalidPercentage = true;
      } else total += percentage;
    }
    if (Object.keys(errors).length) rows[line.rowId] = errors;
  }
  // Match the domain's tolerance of 0.0001 in ratio units without floating point drift.
  const proportionError = declared && !invalidPercentage && Math.abs(total - 10_000) > 1
    ? "Las proporciones declaradas deben sumar 100 %." : null;
  return {
    general, rows, proportionError, totalPercentage: total / 100, declared,
    valid: !Object.keys(general).length && !Object.keys(rows).length && !proportionError,
  };
}

export function policySavePayload(draft: PolicyDraft) {
  return {
    policyRef: draft.policyRef, expectedVersion: draft.expectedVersion, code: draft.policyRef ? draft.code : null,
    name: draft.name.trim(), packageVersionRef: draft.packageVersionRef || null, serviceRef: draft.serviceRef || null,
    modeRef: draft.modeRef || null, preferenceCode: draft.preferenceCode.trim() || null,
    standardCode: draft.standardCode.trim(), state: draft.state, validFrom: draft.validFrom, validTo: draft.validTo,
    lines: draft.lines.map((line) => {
      const percentage = percentageHundredths(line.percentage);
      if (percentage !== null && !Number.isFinite(percentage)) throw new Error("SERVICE_POLICY_PERCENTAGE_INVALID");
      return {
        materialRef: line.authorityKind === "MATERIAL" ? line.authorityRef : null,
        assetModelRef: line.authorityKind === "ASSET" ? line.authorityRef : null,
        materialClass: line.materialClass.trim(), disposition: line.disposition,
        proportion: percentage === null ? null : percentage / 10_000, chargeType: line.chargeType,
        preparationRule: line.preparationRule, maintenanceRule: line.maintenanceRule,
        deteriorationRule: line.deteriorationRule, replacementRule: line.replacementRule, conditions: line.conditions,
      };
    }),
  };
}
