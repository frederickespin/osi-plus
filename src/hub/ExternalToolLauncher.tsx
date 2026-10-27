import { Calculator, CalendarDays, ExternalLink, Smartphone } from "lucide-react";
import {
  EXTERNAL_TOOLS,
  EXTERNAL_TOOL_LINKAGE_NOTICE,
  EXTERNAL_TOOL_OPEN_NOTICE,
  type ExternalToolId,
} from "./externalTools";

const TOOL_ICONS = {
  calculator: Calculator,
  smartphone: Smartphone,
};

export type ExternalToolLauncherProps = Readonly<{
  toolId: ExternalToolId;
  onOpenSurvey?: () => void;
}>;

export default function ExternalToolLauncher({
  toolId,
  onOpenSurvey,
}: ExternalToolLauncherProps) {
  const tool = EXTERNAL_TOOLS[toolId];
  const Icon = TOOL_ICONS[tool.icon];
  const headingId = `external-tool-${tool.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8"
    >
      <p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">
        {tool.areaTitle}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Icon aria-hidden="true" className="h-7 w-7 shrink-0 text-indigo-600" />
        <h1 id={headingId} className="text-2xl font-bold tracking-tight text-slate-950">
          {tool.title}
        </h1>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{tool.description}</p>
      <p className="mt-5 text-sm leading-6 text-slate-700">
        {EXTERNAL_TOOL_OPEN_NOTICE}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={tool.href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          aria-label={`${tool.actionLabel} (se abre en una pestaña nueva)`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {tool.actionLabel}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
        {toolId === "visual-inventory" && onOpenSurvey ? (
          <button
            type="button"
            onClick={onOpenSurvey}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
            Agenda de OSI
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">La aplicación se abre en una pestaña nueva.</p>
      <p className="mt-6 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600">
        {EXTERNAL_TOOL_LINKAGE_NOTICE}
      </p>
    </section>
  );
}
