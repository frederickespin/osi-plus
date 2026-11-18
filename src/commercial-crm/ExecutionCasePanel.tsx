import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, LockKeyhole } from "lucide-react";
import CommercialStorageAuthorizationPanel from "@/customer-custody/CommercialStorageAuthorizationPanel";
import { CrmServicesApi, CrmServicesApiError, type CaseServiceWorkspace } from "@/crm-services/api";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void api.workspace(caseRef, controller.signal)
      .then(setWorkspace)
      .catch((cause) => {
        if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
        else if (!controller.signal.aborted) setError("No fue posible consultar la autoridad de ejecución del caso.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized]);

  useEffect(load, [load]);

  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando autoridad de ejecución…</div>;
  if (error) return <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!workspace) return null;

  const storageSelected = isStorageService(workspace.selection.primary) || workspace.selection.complementaries.some(isStorageService);

  return <section role="tabpanel" aria-labelledby="execution-tab" className="w-full p-4" data-testid="case-execution-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Contrato vigente → autorización → operación</p>
        <h2 className="mt-1 text-xl font-black text-[#003366]">Ejecución del servicio</h2>
        <p className="mt-1 text-xs text-slate-500">Comercial autoriza el alcance; Coordinación, Operaciones o Almacenes ejecutan la orden correspondiente.</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"><ClipboardCheck className="h-4 w-4" />Plan V{workspace.selection.revision || 0}</span>
    </header>

    {storageSelected ? <CommercialStorageAuthorizationPanel
      caseRef={caseRef}
      selectionRef={workspace.selection.selectionRef}
      primary={workspace.selection.primary}
      complementaries={workspace.selection.complementaries}
      authorization={authorization}
      canAuthorize={canUpdate}
      activeView="authorization"
    /> : <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
      <div><strong>Orden operativa pendiente de configuración</strong><p className="mt-1 text-xs leading-5">Para {workspace.selection.primary?.name || "este servicio"}, la orden se habilitará cuando exista contrato vigente y estén confirmados fecha, alcance, direcciones y recursos. Las autorizaciones de almacenaje ya están operativas en esta pantalla.</p></div>
    </div>}
  </section>;
}
