import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSignature, LockKeyhole } from "lucide-react";
import CommercialStorageAuthorizationPanel from "@/customer-custody/CommercialStorageAuthorizationPanel";
import { CustomerCustodyApi, type CustomerStorageType } from "@/customer-custody/api";
import { CrmServicesApi, CrmServicesApiError, type CaseServiceWorkspace } from "@/crm-services/api";
import { communicationsApi, type CommunicationTemplate } from "@/communications/api";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  canUpdate: boolean;
  canViewTemplates: boolean;
  onUnauthorized(): void;
}>;

function isStorageService(item: Readonly<{ code: string; category: string | null }> | null | undefined) {
  return Boolean(item && (item.category === "STORAGE" || ["STORAGE", "ALMACENAJE"].includes(item.code)));
}

function recommendedCode(workspace: CaseServiceWorkspace, storageSelected: boolean, storageType: CustomerStorageType | null) {
  if (storageSelected) return storageType === "COMMERCIAL_STORAGE" ? "CTR.STORAGE.COMMERCIAL" : "CTR.STORAGE.PERSONAL";
  if (workspace.mode === "EXPORT") return "CTR.MOVE.EXPORT";
  if (workspace.mode === "IMPORT") return "CTR.MOVE.IMPORT";
  const primary = `${workspace.selection.primary?.code || ""} ${workspace.selection.primary?.name || ""}`.toUpperCase();
  return primary.includes("TRANSPORT") ? "CTR.TRANSPORT.LOCAL" : "CTR.MOVE.LOCAL";
}

export default function ContractCasePanel({ caseRef, authorization, canUpdate, canViewTemplates, onUnauthorized }: Props) {
  const api = useMemo(() => new CrmServicesApi(() => authorization || null), [authorization]);
  const custodyApi = useMemo(() => new CustomerCustodyApi(authorization), [authorization]);
  const [workspace, setWorkspace] = useState<CaseServiceWorkspace | null>(null);
  const [storageType, setStorageType] = useState<CustomerStorageType | null>(null);
  const [templates, setTemplates] = useState<readonly CommunicationTemplate[]>([]);
  const [templateRef, setTemplateRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      api.workspace(caseRef, controller.signal),
      canViewTemplates ? communicationsApi.templates(authorization) : Promise.resolve([]),
      custodyApi.storageRequirementWorkspace(caseRef, controller.signal).catch(() => null),
    ])
      .then(([nextWorkspace, nextTemplates, requirementWorkspace]) => {
        setWorkspace(nextWorkspace);
        setStorageType(requirementWorkspace?.current?.storageType || null);
        setTemplates(nextTemplates.filter((item) => item.code.startsWith("CTR.") && item.state !== "INACTIVE" && Boolean(item.current)));
      })
      .catch((cause) => {
        if (cause instanceof CrmServicesApiError && cause.status === 401) onUnauthorized();
        else if (!controller.signal.aborted) setError("No fue posible consultar el plan de servicios del caso.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, authorization, canViewTemplates, caseRef, custodyApi, onUnauthorized]);

  useEffect(load, [load]);

  if (loading) return <div role="status" className="p-8 text-center text-sm text-slate-500">Cargando autoridad contractual…</div>;
  if (error) return <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!workspace) return null;

  const storageSelected = isStorageService(workspace.selection.primary) || workspace.selection.complementaries.some(isStorageService);
  const recommended = recommendedCode(workspace, storageSelected, storageType);
  const chosen = templates.find((item) => item.templateRef === templateRef) || templates.find((item) => item.code === recommended) || templates[0] || null;
  const suggestedTermsVersion = chosen ? `${chosen.code}@v${chosen.currentVersion}` : undefined;

  return <section role="tabpanel" aria-labelledby="contract-tab" className="w-full p-4" data-testid="case-contract-panel">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0070a8]">Propuesta aceptada → contrato → firma</p>
        <h2 className="mt-1 text-xl font-black text-[#003366]">Contrato del caso</h2>
        <p className="mt-1 text-xs text-slate-500">El contrato conserva la propuesta aceptada, la plantilla aplicable y la evidencia de firma.</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800"><FileSignature className="h-4 w-4" />Plan V{workspace.selection.revision || 0}</span>
    </header>

    <section className="mt-4 rounded-lg border border-slate-200 bg-white" aria-labelledby="contract-template-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
        <div><h3 id="contract-template-heading" className="text-xs font-black uppercase tracking-wide text-[#003366]">Plantilla contractual</h3><p className="text-[10px] text-slate-500">La versión elegida identifica los términos aplicables al contrato.</p></div>
        {chosen && <span className="rounded bg-white px-2 py-1 text-[10px] font-bold text-slate-700">{chosen.state === "PUBLISHED" ? "Publicada" : chosen.state === "DRAFT" ? "Borrador" : "Inactiva"} · v{chosen.currentVersion}</span>}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(260px,1fr)_minmax(220px,.8fr)] md:items-end">
        <label className="text-xs font-bold">Contrato aplicable<select value={chosen?.templateRef || ""} disabled={!templates.length} onChange={(event) => setTemplateRef(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">{templates.length ? "Seleccionar plantilla" : "No hay plantillas contractuales creadas"}</option>{templates.map((item) => <option key={item.templateRef} value={item.templateRef}>{item.code === recommended ? "Recomendada · " : ""}{item.name} · v{item.currentVersion}</option>)}</select></label>
        <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950"><b>Referencia de términos:</b><span className="mt-1 block font-mono text-[11px]">{suggestedTermsVersion || "Pendiente"}</span></div>
      </div>
      {chosen?.current && <details className="border-t"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">Consultar contenido de la versión</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-700">{chosen.current.bodyText}</pre></details>}
    </section>

    {storageSelected ? <CommercialStorageAuthorizationPanel
      caseRef={caseRef}
      selectionRef={workspace.selection.selectionRef}
      primary={workspace.selection.primary}
      complementaries={workspace.selection.complementaries}
      authorization={authorization}
      canAuthorize={canUpdate}
      activeView="agreement"
      suggestedTermsVersion={suggestedTermsVersion}
    /> : <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
      <div><strong>Contrato pendiente del servicio principal</strong><p className="mt-1 text-xs leading-5">La plantilla contractual se habilitará cuando exista una propuesta aceptada para {workspace.selection.primary?.name || "el servicio seleccionado"}. El contrato de almacenaje ya está disponible desde esta pantalla.</p></div>
    </div>}
  </section>;
}
