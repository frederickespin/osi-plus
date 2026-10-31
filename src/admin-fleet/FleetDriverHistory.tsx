import { Check, ChevronLeft, ChevronRight, Eye, MoreHorizontal, ShieldOff, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FLEET_DRIVER_STATUS_LABELS, canDecideFleetDriver, type FleetDriverAuthorization, type FleetDriverDecision, type FleetDriverHistoryEntry, type FleetDriverWorkspace } from "./driverTypes";
import { formatFleetDriverDate } from "./driverTime";

export default function FleetDriverHistory({ workspace, disabled, canAuthorize, retired, onDetail, onDecision, onPage }: {
  workspace: FleetDriverWorkspace;
  disabled: boolean;
  canAuthorize: boolean;
  retired: boolean;
  onDetail(entry: FleetDriverHistoryEntry): void;
  onDecision(entry: FleetDriverAuthorization, action: FleetDriverDecision): void;
  onPage(page: number): void;
}) {
  const temporary = workspace.historyKind === "TEMPORARY";
  const totalPages = Math.max(1, Math.ceil(workspace.total / workspace.pageSize));
  return <div className="min-w-0 overflow-hidden rounded border border-slate-200">
    <div className="overflow-x-auto" role="region" aria-label={temporary ? "Tabla de autorizaciones temporales" : "Historial de chofer habitual"} tabIndex={0}>
      <table className={`w-full border-collapse text-left text-xs ${temporary ? "min-w-[650px]" : "min-w-[540px]"}`}>
        <thead className="bg-slate-50 text-slate-500"><tr>{(temporary ? ["Chofer", "Desde", "Hasta", "Estado", "Acciones"] : ["Fecha", "Chofer habitual", "Responsable", "Acciones"]).map((label) => <th key={label} scope="col" className={`border-b border-slate-200 px-2 py-2 font-semibold ${label === "Acciones" ? "w-12 text-center" : ""}`}>{label}</th>)}</tr></thead>
        <tbody>{workspace.data.map((entry) => <tr key={entry.kind === "PRIMARY" ? entry.assignmentRef : entry.authorizationRef} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          {entry.kind === "PRIMARY" ? <>
            <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">{formatFleetDriverDate(entry.assignedAt)}</td>
            <td className="px-2 py-2 text-slate-800">{entry.driver?.displayName || "Sin asignar"}{entry.driver && !entry.driverEligible && <span className="block text-[11px] text-amber-800">No habilitado</span>}</td>
            <td className="px-2 py-2 text-slate-600">{entry.assignedBy.displayName}</td>
          </> : <>
            <td className="px-2 py-2 font-medium text-slate-800">{entry.driver.displayName}</td>
            <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">{formatFleetDriverDate(entry.startsAt)}</td>
            <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">{formatFleetDriverDate(entry.endsAt)}</td>
            <td className="whitespace-nowrap px-2 py-2"><span className={`inline-flex rounded px-1.5 py-1 text-[11px] ${entry.effectiveStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : entry.effectiveStatus === "PENDING" ? "bg-amber-50 text-amber-800" : entry.effectiveStatus === "SCHEDULED" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{FLEET_DRIVER_STATUS_LABELS[entry.effectiveStatus]}</span></td>
          </>}
          <td className="px-1 py-1 text-center"><DropdownMenu><DropdownMenuTrigger asChild><button type="button" disabled={disabled} aria-label={`Acciones de ${entry.kind === "PRIMARY" ? "asignación" : "autorización"} de ${entry.driver?.displayName || "Sin asignar"}`} className="inline-flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40 sm:h-8 sm:w-8"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onDetail(entry)}><Eye aria-hidden="true" />Ver detalle</DropdownMenuItem>
              {entry.kind === "TEMPORARY" && canAuthorize && <>
                {!retired && canDecideFleetDriver(entry, "APPROVE") && <DropdownMenuItem onSelect={() => onDecision(entry, "APPROVE")}><Check aria-hidden="true" />Aprobar</DropdownMenuItem>}
                {!retired && canDecideFleetDriver(entry, "REJECT") && <DropdownMenuItem onSelect={() => onDecision(entry, "REJECT")}><X aria-hidden="true" />Rechazar</DropdownMenuItem>}
                {canDecideFleetDriver(entry, "REVOKE") && <DropdownMenuItem onSelect={() => onDecision(entry, "REVOKE")}><ShieldOff aria-hidden="true" />Revocar</DropdownMenuItem>}
              </>}
            </DropdownMenuContent></DropdownMenu></td>
        </tr>)}</tbody>
      </table>
      {workspace.data.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">{temporary ? "Todavía no hay solicitudes de uso temporal." : "Todavía no hay cambios de chofer habitual."}</p>}
    </div>
    <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-2 py-1 text-[11px] text-slate-500">
      <span>{workspace.total} registro{workspace.total === 1 ? "" : "s"}</span><div className="flex items-center gap-1"><button type="button" aria-label="Historial anterior" disabled={disabled || workspace.page === 1} onClick={() => onPage(workspace.page - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-slate-50 disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button><span>Página {workspace.page} de {totalPages}</span><button type="button" aria-label="Historial siguiente" disabled={disabled || workspace.page === totalPages} onClick={() => onPage(workspace.page + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-slate-50 disabled:opacity-30"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div>
    </footer>
  </div>;
}
