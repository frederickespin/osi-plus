import type { LeadStatus } from "@/types/sales.types";

const stages: { key: LeadStatus; label: string; color: string }[] = [
  { key: "PROSPECT", label: "Prospecto", color: "bg-[#B6ACAF]" },
  { key: "CONTACTED", label: "Contact.", color: "bg-[#373363]" },
  { key: "SITE_VISIT", label: "Visita", color: "bg-[#373363]" },
  { key: "QUOTE_SENT", label: "Enviada", color: "bg-[#D7554F]" },
  { key: "NEGOTIATION", label: "Negocia", color: "bg-[#D7554F]" },
  { key: "WON", label: "Proyecto", color: "bg-emerald-500" },
  { key: "LOST", label: "Perdido", color: "bg-[#CB3B3B]" },
];

export function CustomerPipelineBar({ status }: { status: LeadStatus }) {
  const idx = stages.findIndex((s) => s.key === status);
  const safeIdx = idx < 0 ? 0 : idx;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 rounded-full bg-slate-200 overflow-hidden flex">
        {stages.slice(0, 6).map((s, i) => (
          <div
            key={s.key}
            className={`h-full ${i <= safeIdx ? s.color : "bg-transparent"}`}
            style={{ width: `${100 / 6}%` }}
            title={s.label}
          />
        ))}
      </div>
      <span className="text-xs text-slate-500">{stages[safeIdx]?.label}</span>
    </div>
  );
}
