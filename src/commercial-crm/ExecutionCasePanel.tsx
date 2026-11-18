import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import CommercialStorageAuthorizationPanel from "@/customer-custody/CommercialStorageAuthorizationPanel";
import { CrmServicesApi, CrmServicesApiError, type CaseServiceWorkspace } from "@/crm-services/api";
import CommonExecutionOrderPanel from "./CommonExecutionOrderPanel";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  canUpdate: boolean;
  onUnauthorized(): void;
}>;

function isStorageService(item: Readonly<{ code: string; category: string | null }> | null | undefined) {
  return Boolean(item && (item.category === "STORAGE" || ["STORAGE", "ALMACENAJE"].includes(item.code)));
}

export default function ExecutionCasePanel({ caseRef, authorization, canUpdate, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const [workspace, setWorkspace] = useState<CaseServiceWorkspace | null>(null);
  const [executionView, setExecutionView] = useState<"PRIMARY" | "STORAGE">("PRIMARY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api.workspace(caseRef, controller.signal)
      .then(setWorkspace)
      .catch((cause) => {
        if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
        else if (!controller.signal.aborted) setError("No fue posible consultar la autoridad de ejecución del caso.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized]);

  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando autoridad de ejecución…</div>;
  if (error) return <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!workspace) return null;

  const primaryIsStorage = isStorageService(workspace.selection.primary);
  const hasAssociatedStorage = workspace.selection.complementaries.some(isStorageService);
  const showStorageAuthorization = primaryIsStorage || (hasAssociatedStorage && executionView === "STORAGE");

  return <section role="tabpanel" aria-labelledby="execution-tab" className="w-full p-4" data-testid="case-execution-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Contrato vigente → autorización → operación</p>
        <h2 className="mt-1 text-xl font-black text-[#003366]">Ejecución del servicio</h2>
        <p className="mt-1 text-xs text-slate-500">Comercial autoriza el alcance; Coordinación, Operaciones o Almacenes ejecutan la orden correspondiente.</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"><ClipboardCheck className="h-4 w-4" />Plan V{workspace.selection.revision || 0}</span>
    </header>

    {!primaryIsStorage && hasAssociatedStorage ? <nav aria-label="Procesos de ejecución del caso" className="mt-3 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
      <button type="button" onClick={() => setExecutionView("PRIMARY")} className={`rounded px-3 py-2 text-xs font-bold ${executionView === "PRIMARY" ? "bg-[#003b71] text-white" : "bg-slate-100 text-slate-600"}`}>Orden principal</button>
      <button type="button" onClick={() => setExecutionView("STORAGE")} className={`rounded px-3 py-2 text-xs font-bold ${executionView === "STORAGE" ? "bg-[#003b71] text-white" : "bg-slate-100 text-slate-600"}`}>Almacenaje asociado</button>
    </nav> : null}

    {showStorageAuthorization ? <CommercialStorageAuthorizationPanel
      caseRef={caseRef}
      selectionRef={workspace.selection.selectionRef}
      primary={workspace.selection.primary}
      complementaries={workspace.selection.complementaries}
      authorization={authorization}
      canAuthorize={canUpdate}
      activeView="authorization"
    /> : <CommonExecutionOrderPanel caseRef={caseRef} authorization={authorization} canUpdate={canUpdate} onUnauthorized={onUnauthorized} />}
  </section>;
}
