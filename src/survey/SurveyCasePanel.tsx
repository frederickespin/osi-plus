import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSurveyApi } from "./api";
import type { SurveyAssignment } from "./types";

type Props = Readonly<{ caseRef: string; authorization?: string; onNavigate(pathname: string): void; onUnauthorized(): void }>;

function publishedStatus(value: SurveyAssignment | null) {
  if (!value) return "Sin asignar";
  if (["COMPLETED", "PUBLISHED"].includes(value.status)) return "Publicado";
  if (["ARRIVED", "IN_PROGRESS"].includes(value.status)) return "En progreso";
  return "Asignado";
}

export default function SurveyCasePanel({ caseRef, authorization, onNavigate, onUnauthorized }: Props) {
  const [assignment, setAssignment] = useState<SurveyAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const rows = await createSurveyApi(authorization).agenda();
      setAssignment(rows.find((row) => row.caseRef === caseRef) || null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "CRM_SURVEY_REQUEST_FAILED";
      if (/UNAUTHORIZED|AUTH_REQUIRED/.test(code)) onUnauthorized();
      else setError("No fue posible consultar el estado de Survey. Reintente desde esta misma ficha.");
    } finally { setLoading(false); }
  }, [authorization, caseRef, onUnauthorized]);
  useEffect(() => { void load(); }, [load]);
  return <section role="tabpanel" data-testid="survey-case-panel" className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Aplicación operativa especializada</p><h2 className="text-lg font-black text-[#003366]">Survey</h2></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Actualizar</Button></header>
    {loading && <p className="p-8 text-center text-sm text-slate-500">Consultando la agenda vigente…</p>}
    {error && <p role="alert" className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!loading && !error && <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><ClipboardCheck className="mb-2 h-6 w-6 text-[#0070a8]" /><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Estado actual</p><p className="mt-1 text-xl font-black text-[#003366]">{publishedStatus(assignment)}</p><p className="mt-2 text-sm text-slate-600">{assignment ? `${assignment.evaluator.displayName} · ${new Date(assignment.scheduledStart).toLocaleString("es-DO")}` : "No existe una asignación de Survey para este caso."}</p><p className="mt-1 text-xs text-slate-500">La selección de artículos y la publicación permanecen en Survey App. Los materiales se derivan después mediante recetas; no se seleccionan aquí.</p></div><Button onClick={() => onNavigate("/survey")}>Abrir Survey App</Button></div>}
  </section>;
}
