import { Fragment, useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { Button } from "@/components/ui/button";
import { COMPACT_FORM_FIELD as FIELD } from "@/components/ui/compact-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CrmServicesApi, CrmServicesApiError, type ServiceCatalogItem, type ServiceMaterialResource, type ServiceMode, type ServicePackage } from "./api";
import { newPolicyLine, validatePolicyDraft, type PolicyDraft, type PolicyLineDraft } from "./materialPolicyDraft";

type Props = Readonly<{
  api: CrmServicesApi;
  draft: PolicyDraft;
  packages: readonly ServicePackage[];
  modes: readonly ServiceMode[];
  services: readonly ServiceCatalogItem[];
  canReadServices: boolean;
  saving: boolean;
  error: string | null;
  onChange(draft: PolicyDraft): void;
  onSave(): void;
  onClose(): void;
  onUnauthorized(): void;
}>;

const ERROR_FIELD = "border-red-500";
const DISPOSITIONS = [
  ["CONSUMED", "Consumo"], ["RENTED", "Alquiler"], ["RETURNABLE", "Devolución"], ["USAGE_CHARGE", "Cargo por uso"],
] as const;
const CHARGES = [
  ["INCLUDED", "Incluido"], ["SALE", "Venta"], ["RENTAL", "Alquiler"], ["USAGE", "Uso"],
  ["PREPARATION", "Preparación"], ["MAINTENANCE", "Mantenimiento"], ["DETERIORATION", "Deterioro"], ["REPLACEMENT", "Reposición"],
] as const;
const formatPercentage = (value: number) => new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(value);
const NO_RESOURCES: readonly ServiceMaterialResource[] = [];

export default function MaterialPolicySheet({ api, draft, packages, modes, services, canReadServices, saving, error, onChange, onSave, onClose, onUnauthorized }: Props) {
  const [resourceResult, setResourceResult] = useState<Readonly<{
    source: CrmServicesApi; revision: number; items: readonly ServiceMaterialResource[]; error: string | null;
  }> | null>(null);
  const [reload, setReload] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const currentResult = resourceResult?.source === api && resourceResult.revision === reload ? resourceResult : null;
  const resources = currentResult?.items || NO_RESOURCES;
  const resourceError = currentResult?.error || null;
  const resourcesReady = Boolean(currentResult && !resourceError);

  useEffect(() => {
    const controller = new AbortController();
    void api.materialResources(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setResourceResult({ source: api, revision: reload, items, error: null });
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
      else setResourceResult({ source: api, revision: reload, items: NO_RESOURCES, error: "No fue posible cargar el catálogo de materiales y recursos. Intente actualizarlo." });
    });
    return () => controller.abort();
  }, [api, onUnauthorized, reload]);

  const validation = validatePolicyDraft(draft, resourcesReady ? resources : undefined);
  const updateLine = (rowId: string, patch: Partial<PolicyLineDraft>) => onChange({
    ...draft, lines: draft.lines.map((line) => line.rowId === rowId ? { ...line, ...patch } : line),
  });
  const save = () => {
    setShowErrors(true);
    if (!saving && resourcesReady && validation.valid) onSave();
  };
  const knownScope = !draft.serviceRef || services.some((item) => item.serviceRef === draft.serviceRef);

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent showCloseButton={!saving} className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-3rem)] sm:max-w-6xl" data-testid="material-policy-sheet">
      <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
        <div className="flex items-center gap-1"><DialogTitle>{draft.policyRef ? "Editar política de materiales" : "Nueva política de materiales"}</DialogTitle><AdministrationHelp title="Políticas de materiales"><p>Complete los datos y edite la composición directamente en las filas. Use Tab para avanzar entre celdas.</p><p>Los porcentajes declarados deben sumar 100 %. Deje una celda vacía cuando esa fila no tenga una proporción.</p><p>Clase describe la condición o grupo del recurso. Uso indica consumo, alquiler o devolución; Cargo define cómo se trata económicamente.</p></AdministrationHelp></div>
        <DialogDescription>Edite la composición en una sola hoja. Los materiales y recursos se seleccionan del catálogo.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 min-w-0 overflow-y-auto px-4 py-3 sm:px-5">
        <fieldset disabled={saving} className="min-w-0 space-y-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(160px,1fr)]">
            <label className="min-w-0 text-xs font-medium text-slate-700">Nombre de la política<input aria-label="Nombre de la política" autoFocus maxLength={160} value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} aria-invalid={showErrors && Boolean(validation.general.name)} aria-describedby={showErrors && validation.general.name ? "material-policy-name-error" : undefined} className={`${FIELD} mt-1 w-full ${showErrors && validation.general.name ? ERROR_FIELD : ""}`} />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">{draft.code ? <>Código: <code>{draft.code}</code></> : "Código automático al guardar"}</span>
              {showErrors && validation.general.name && <span id="material-policy-name-error" className="mt-1 block text-xs text-red-700">{validation.general.name}</span>}
            </label>
            <label className="min-w-0 text-xs font-medium text-slate-700">Combinación<select aria-label="Combinación" value={draft.packageVersionRef} onChange={(event) => onChange({ ...draft, packageVersionRef: event.target.value })} className={`${FIELD} mt-1 w-full`}><option value="">Sin combinación específica</option>{packages.map((item) => <option key={item.versionRef} value={item.versionRef}>{item.name} · v{item.version}</option>)}</select></label>
            <label className="min-w-0 text-xs font-medium text-slate-700">Modalidad<select aria-label="Modalidad" value={draft.modeRef} onChange={(event) => onChange({ ...draft, modeRef: event.target.value })} className={`${FIELD} mt-1 w-full`}><option value="">Cualquier modalidad</option>{modes.map((item) => <option key={item.modeRef} value={item.modeRef}>{item.name}</option>)}</select></label>
          </div>
          {showErrors && validation.general.scope && <p role="alert" className="text-xs text-red-700">{validation.general.scope}</p>}

          <section className="min-w-0" aria-labelledby="material-policy-composition">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 id="material-policy-composition" className="text-sm font-semibold text-slate-900">Composición y cargos</h3><div className="flex items-center gap-1"><AdministrationIconAction label="Actualizar catálogo de materiales y recursos" disabled={saving || (!resourcesReady && !resourceError)} onClick={() => setReload((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${!resourcesReady && !resourceError ? "animate-spin" : ""}`} /></AdministrationIconAction><Button size="sm" variant="outline" disabled={draft.lines.length >= 100} onClick={() => onChange({ ...draft, lines: [...draft.lines, newPolicyLine()] })}><Plus aria-hidden="true" />Agregar fila</Button></div></div>
            {!resourcesReady && !resourceError && <p role="status" className="mb-2 text-xs text-slate-500">Cargando materiales y recursos…</p>}
            {resourceError && <p role="alert" className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{resourceError}</p>}
            {resourcesReady && !resources.length && <p role="status" className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">No hay materiales ni recursos activos en el catálogo. Registre los recursos antes de completar la política.</p>}
            <div className="max-h-[48dvh] min-w-0 overflow-auto rounded border border-slate-200" data-testid="material-policy-table-scroll" tabIndex={0} role="region" aria-label="Hoja de composición y cargos">
              <table className="w-full min-w-[1020px] border-collapse text-left text-xs" aria-label="Composición y cargos">
                <caption className="sr-only">Una fila por material o recurso. Todos los campos se editan directamente en la tabla.</caption>
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-600"><tr><th scope="col" className="w-10 px-2 py-2">Fila</th><th scope="col" className="w-36 px-2 py-2">Tipo</th><th scope="col" className="w-60 px-2 py-2">Material o recurso</th><th scope="col" className="w-40 px-2 py-2">Clase</th><th scope="col" className="w-24 px-2 py-2 text-right">%</th><th scope="col" className="w-36 px-2 py-2">Uso</th><th scope="col" className="w-40 px-2 py-2">Cargo</th><th scope="col" className="w-24 px-2 py-2"><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>{draft.lines.map((line, index) => {
                  const rowLabel = `fila ${index + 1}`;
                  const choices = resources.filter((item) => item.kind === line.authorityKind);
                  const resource = choices.find((item) => item.resourceRef === line.authorityRef);
                  const unavailable = resourcesReady && Boolean(line.authorityRef) && !resource;
                  const rowErrors = validation.rows[line.rowId];
                  const errorId = `material-policy-row-${line.rowId}`;
                  const messages = rowErrors ? Object.values(rowErrors) : [];
                  const visibleErrors = showErrors ? messages : unavailable ? [rowErrors?.resource] : [];
                  return <Fragment key={line.rowId}>
                    <tr className="border-t border-slate-200 align-top hover:bg-slate-50/50">
                      <th scope="row" className="px-2 py-1 align-middle font-normal text-slate-400">{index + 1}</th>
                      <td className="px-1.5 py-1"><select aria-label={`Tipo, ${rowLabel}`} value={line.authorityKind} onChange={(event) => updateLine(line.rowId, { authorityKind: event.target.value as PolicyLineDraft["authorityKind"], authorityRef: "" })} className={`${FIELD} w-32`}><option value="MATERIAL">Material</option><option value="ASSET">Activo</option></select></td>
                      <td className="px-1.5 py-1"><select aria-label={`Material o recurso, ${rowLabel}`} aria-invalid={Boolean((showErrors || unavailable) && rowErrors?.resource)} aria-describedby={visibleErrors.length ? errorId : undefined} disabled={!resourcesReady} value={line.authorityRef} onChange={(event) => updateLine(line.rowId, { authorityRef: event.target.value })} className={`${FIELD} w-56 ${(showErrors || unavailable) && rowErrors?.resource ? ERROR_FIELD : ""}`}><option value="">Seleccionar del catálogo</option>{line.authorityRef && !resource && <option value={line.authorityRef}>{resourcesReady ? "Recurso no disponible" : "Cargando recurso guardado…"}</option>}{choices.map((item) => <option key={item.resourceRef} value={item.resourceRef}>{item.name} · {item.code}</option>)}</select>{resource && <span className="mt-1 block max-w-56 truncate text-[10px] text-slate-500">{resource.family}</span>}</td>
                      <td className="px-1.5 py-1"><input aria-label={`Clase, ${rowLabel}`} aria-invalid={showErrors && Boolean(rowErrors?.materialClass)} aria-describedby={visibleErrors.length ? errorId : undefined} maxLength={80} value={line.materialClass} onChange={(event) => updateLine(line.rowId, { materialClass: event.target.value })} placeholder="Clase o condición" className={`${FIELD} w-36 ${showErrors && rowErrors?.materialClass ? ERROR_FIELD : ""}`} /></td>
                      <td className="px-1.5 py-1"><input aria-label={`Porcentaje, ${rowLabel}`} aria-invalid={showErrors && Boolean(rowErrors?.percentage)} aria-describedby={visibleErrors.length ? errorId : undefined} inputMode="decimal" maxLength={6} value={line.percentage} onChange={(event) => updateLine(line.rowId, { percentage: event.target.value })} placeholder="—" className={`${FIELD} w-20 text-right tabular-nums ${showErrors && rowErrors?.percentage ? ERROR_FIELD : ""}`} /></td>
                      <td className="px-1.5 py-1"><select aria-label={`Uso, ${rowLabel}`} value={line.disposition} onChange={(event) => updateLine(line.rowId, { disposition: event.target.value as PolicyLineDraft["disposition"] })} className={`${FIELD} w-32`}>{DISPOSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                      <td className="px-1.5 py-1"><select aria-label={`Cargo, ${rowLabel}`} value={line.chargeType} onChange={(event) => updateLine(line.rowId, { chargeType: event.target.value as PolicyLineDraft["chargeType"] })} className={`${FIELD} w-36`}>{CHARGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                      <td className="px-1.5 py-1"><div className="flex items-center gap-0.5"><AdministrationIconAction label={`Duplicar ${rowLabel}`} className="sm:h-7 sm:min-w-7" disabled={draft.lines.length >= 100} onClick={() => onChange({ ...draft, lines: [...draft.lines.slice(0, index + 1), { ...line, rowId: crypto.randomUUID() }, ...draft.lines.slice(index + 1)] })}><Copy className="h-4 w-4" /></AdministrationIconAction><AdministrationIconAction label={`Eliminar ${rowLabel}`} className="sm:h-7 sm:min-w-7" onClick={() => onChange({ ...draft, lines: draft.lines.filter((item) => item.rowId !== line.rowId) })}><Trash2 className="h-4 w-4" /></AdministrationIconAction></div></td>
                    </tr>
                    {visibleErrors.length > 0 && <tr className="bg-red-50"><td colSpan={8} id={errorId} className="px-3 py-2 text-xs text-red-700">Fila {index + 1}: {visibleErrors.filter(Boolean).join(" ")}</td></tr>}
                  </Fragment>;
                })}</tbody>
              </table>
              {!draft.lines.length && <p className="p-5 text-center text-xs text-slate-500">Agregue una fila para comenzar.</p>}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-xs"><span className="text-slate-500">{draft.lines.length} {draft.lines.length === 1 ? "fila" : "filas"} · Tab para avanzar entre celdas</span><div className="text-right"><p aria-live="polite" className={`font-semibold tabular-nums ${validation.proportionError ? "text-amber-800" : "text-slate-700"}`}>{validation.declared ? `Total: ${formatPercentage(validation.totalPercentage)} %` : "Sin proporciones declaradas"}</p>{validation.proportionError && <p role={showErrors ? "alert" : undefined} className="mt-1 text-xs text-red-700">{validation.proportionError}</p>}</div></div>
            {showErrors && validation.general.lines && <p role="alert" className="mt-2 text-xs text-red-700">{validation.general.lines}</p>}
          </section>

          <details className="rounded border border-slate-200 px-3 py-2 text-xs"><summary className="cursor-pointer font-medium text-slate-600">Opciones de la política</summary><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">{canReadServices ? <label className="min-w-0 font-medium text-slate-700">Servicio específico<select aria-label="Servicio específico" value={draft.serviceRef} onChange={(event) => onChange({ ...draft, serviceRef: event.target.value })} className={`${FIELD} mt-1 w-full`}><option value="">Cualquier servicio</option>{!knownScope && <option value={draft.serviceRef}>Servicio guardado</option>}{services.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{item.name}</option>)}</select></label> : draft.serviceRef && <p className="text-slate-500">Se conserva el servicio asociado a esta política.</p>}<label className="min-w-0 font-medium text-slate-700">Estándar<input maxLength={80} value={draft.standardCode} onChange={(event) => onChange({ ...draft, standardCode: event.target.value })} className={`${FIELD} mt-1 w-full ${showErrors && validation.general.standard ? ERROR_FIELD : ""}`} />{showErrors && validation.general.standard && <span className="mt-1 block text-red-700">{validation.general.standard}</span>}</label><label className="min-w-0 font-medium text-slate-700">Preferencia<input maxLength={80} value={draft.preferenceCode} onChange={(event) => onChange({ ...draft, preferenceCode: event.target.value })} className={`${FIELD} mt-1 w-full`} placeholder="Opcional" /></label></div></details>
        </fieldset>
      </div>
      <footer className="min-w-0 border-t bg-white px-4 py-3 sm:px-5">
        {error && <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        {showErrors && !validation.valid && <p role="alert" className="mb-2 text-xs text-red-700">Revise los campos y las filas indicadas antes de guardar.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs font-medium text-slate-600">Guardar como<select aria-label="Guardar como" disabled={saving} value={draft.state} onChange={(event) => onChange({ ...draft, state: event.target.value as PolicyDraft["state"] })} className={`${FIELD} w-40`}><option value="DRAFT">Borrador</option><option value="PUBLISHED">Versión publicada</option></select></label><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={onClose}>Cerrar</Button><Button size="sm" disabled={saving || !resourcesReady} onClick={save}>{saving ? <RefreshCw className="animate-spin" aria-hidden="true" /> : null}{saving ? "Guardando…" : "Guardar política"}</Button></div></div>
      </footer>
    </DialogContent>
  </Dialog>;
}
