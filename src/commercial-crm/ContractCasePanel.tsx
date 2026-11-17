import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSignature, LockKeyhole } from "lucide-react";
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

export default function ContractCasePanel({ caseRef, authorization, canUpdate, onUnauthorized }: Props) {
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
        else if (!controller.signal.aborted) setError("No fue posible consultar el plan de servicios del caso.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, caseRef, onUnauthorized]);

  useEffect(load, [load]);

  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando autoridad contractual…</div>;
  if (error) return <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!workspace) return null;

  const storageSelected = isStorageService(workspace.selection.primary) || workspace.selection.complementaries.some(isStorageService);

  return <section role="tabpanel" aria-labelledby="contract-tab" className="w-full p-4" data-testid="case-contract-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Propuesta aceptada → contrato → firma</p>
        <h2 className="mt-1 text-xl font-black text-[#003366]">Contrato del caso</h2>
        <p className="mt-1 text-xs text-slate-500">El contrato conserva la propuesta aceptada, la plantilla aplicable y la evidencia de firma.</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800"><FileSignature className="h-4 w-4" />Plan V{workspace.selection.revision || 0}</span>
    </header>

    {storageSelected ? <CommercialStorageAuthorizationPanel
      caseRef={caseRef}
      selectionRef={workspace.selection.selectionRef}
      primary={workspace.selection.primary}
      complementaries={workspace.selection.complementaries}
      authorization={authorization}
      canAuthorize={canUpdate}
      activeView="agreement"
    /> : <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
      <div><strong>Contrato pendiente del servicio principal</strong><p className="mt-1 text-xs leading-5">La plantilla contractual se habilitará cuando exista una propuesta aceptada para {workspace.selection.primary?.name || "el servicio seleccionado"}. El contrato de almacenaje ya está disponible desde esta pantalla.</p></div>
    </div>}
  </section>;
}
