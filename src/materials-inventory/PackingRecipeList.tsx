import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import { materialsApi, type RecipeRow, type RecipeLine } from "./api";

const bases = { FIXED: "Fija", PER_ITEM: "Por unidad", PER_LENGTH: "Por longitud (m)", PER_AREA: "Por superficie (m²)", VOLUME: "Por volumen (m³)" } as const;
type Basis = keyof typeof bases;
const basisOf = (line: RecipeLine): Basis => line.formulaType === "PER_ITEM" && line.formulaConfig?.measurement === "UNIT_VOLUME_M3" ? "VOLUME" : line.formulaType;
type Props = { recipes: readonly RecipeRow[]; authorization?: string; canManage: boolean; onSaved(): void; onUnauthorized(): void };

function RecipeDetails({ recipe, canManage, authorization, onSaved, onUnauthorized }: Omit<Props, "recipes"> & { recipe: RecipeRow }) {
  const version = recipe.versions.find((item) => item.status === "ACTIVE") ?? recipe.versions[0];
  const editable = canManage && recipe.status === "ACTIVE" && version?.status === "ACTIVE";
  const lines = version?.lines ?? [];
  const [draft, setDraft] = useState(() => lines.map((line) => ({
    basis: basisOf(line), rate: String((line.formulaType === "FIXED" ? line.fixedQuantity : line.multiplier) ?? ""),
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = draft.some((item, index) => item.basis !== basisOf(lines[index]) ||
    Number(item.rate.replace(",", ".")) !== Number(lines[index].formulaType === "FIXED" ? lines[index].fixedQuantity : lines[index].multiplier));
  const valid = draft.every(({ rate }) => /^\d+(?:[.,]\d+)?$/.test(rate) && Number(rate.replace(",", ".")) <= 1000000000);
  async function save() {
    if (!version || !editable || saving || !changed || !valid) return;
    setSaving(true); setError("");
    try {
      const updated = lines.map((line, index): RecipeLine => {
        const entry = draft[index];
        const config = { ...line.formulaConfig };
        if (entry.basis === "VOLUME") config.measurement = "UNIT_VOLUME_M3";
        else if (config.measurement === "UNIT_VOLUME_M3") delete config.measurement;
        const rate = Number(entry.rate.replace(",", "."));
        return { ...line, formulaType: entry.basis === "VOLUME" ? "PER_ITEM" : entry.basis, formulaConfig: config,
          fixedQuantity: entry.basis === "FIXED" ? rate : null, multiplier: entry.basis === "FIXED" ? null : rate };
      });
      await materialsApi.updateRecipe(authorization, recipe.recipeRef, version, updated);
      onSaved();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.includes("AUTH")) onUnauthorized();
      else setError(code.includes("CONFLICT") ? "La receta cambió. Actualiza antes de guardar." : "No se pudo guardar la receta. Revisa los valores e intenta de nuevo.");
    } finally { setSaving(false); }
  }
  return <details className="border-b border-slate-200 py-2">
    <summary className="cursor-pointer px-1 text-sm font-semibold text-[#003366]">{recipe.name}
      <span className="ml-2 text-xs font-normal text-slate-600">{recipe.code}{version ? " · V" + version.version : ""}{recipe.status !== "ACTIVE" ? " · Inactiva" : ""}</span>
    </summary>
    {version && <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs">
      <thead className="text-slate-600"><tr><th>Material</th><th>Base de cálculo</th><th>Cantidad por base</th><th>Unidad</th></tr></thead>
      <tbody>{lines.map((line, index) => <tr key={line.materialRef + line.unitRef} className="border-t border-slate-100">
        <td>{line.materialName}</td><td><select aria-label={"Base de " + line.materialName} className={COMPACT_TABLE_FIELD}
          disabled={!editable || saving} value={draft[index].basis} onChange={(event) => setDraft(draft.map((item, i) =>
            index === i ? { ...item, basis: event.target.value as Basis } : item))}>
          {Object.entries(bases).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></td>
        <td><NumericInput aria-label={"Cantidad de " + line.materialName} className={COMPACT_TABLE_FIELD + " max-w-28"}
          disabled={!editable || saving} allowDecimalComma min={0} step="any" value={draft[index].rate}
          onChange={(event) => setDraft(draft.map((item, i) => index === i ? { ...item, rate: event.target.value } : item))} /></td>
        <td>{line.unitCode}</td>
      </tr>)}</tbody>
    </table></div>}
    {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    {editable && changed && <Button className="mt-2" type="button" size="sm" disabled={!valid || saving} onClick={save}>
      {saving ? "Guardando…" : "Guardar nueva versión"}
    </Button>}
  </details>;
}

export default function PackingRecipeList({ recipes, ...props }: Props) {
  return <section className="mt-3 bg-white p-3" aria-label="Recetas de empaque"><h2 className="text-sm font-bold">Recetas de empaque</h2>
    {recipes.map((recipe) => <RecipeDetails key={recipe.recipeRef + ":" + recipe.versions[0]?.version} recipe={recipe} {...props} />)}
    {recipes.length === 0 && <p className="py-3 text-xs text-slate-600">Sin recetas registradas.</p>}
  </section>;
}
