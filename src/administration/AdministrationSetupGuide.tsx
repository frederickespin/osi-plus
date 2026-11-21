import { useId, useRef, useState, type ReactNode } from "react";
import { BookOpen, CircleHelp, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";

export type SetupLesson = {
  title: string;
  purpose: string;
  steps: readonly ReactNode[];
  example: ReactNode;
  reference?: ReactNode;
  check: string;
};

export function ExampleFields({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <dl className="divide-y divide-sky-100">
    {rows.map(([field, value]) => <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-2 py-1">
      <dt className="text-slate-600">{field}</dt><dd className="font-medium text-slate-900">{value}</dd>
    </div>)}
  </dl>;
}

export default function AdministrationSetupGuide<Topic extends string>({
  title, actions, navigation, activeTopic, topics, labels, lessons, setupOrder, children,
}: {
  title: string;
  actions?: ReactNode;
  navigation: ReactNode;
  activeTopic: Topic;
  topics: readonly Topic[];
  labels: Record<Topic, string>;
  lessons: Record<Topic, SetupLesson>;
  setupOrder?: readonly Topic[];
  children: ReactNode;
}) {
  const panelId = useId();
  const titleId = useId();
  const topicId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinnedTopic, setPinnedTopic] = useState("");
  const topic = topics.find((item) => item === pinnedTopic) ?? activeTopic;
  const lesson = lessons[topic];

  function toggle() {
    if (open) setPinnedTopic("");
    setOpen(!open);
  }

  function close() {
    toggle();
    trigger.current?.focus();
  }

  return <>
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <button ref={trigger} type="button" aria-label={`Guía de ${title}`}
          aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={toggle}
          className={"inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold hover:bg-sky-50 hover:text-[#003366] " +
            (open ? "bg-sky-100 text-[#003366]" : "text-slate-600")}>
          <CircleHelp aria-hidden="true" className="size-4 shrink-0" />Guía
        </button>
      </div>
      {actions}
    </header>
    {navigation}
    <div className={open ? "grid min-w-0 gap-2 pt-2 xl:grid-cols-[minmax(0,1fr)_18.5rem] xl:items-start" : "min-w-0"}>
      {open && <aside id={panelId} aria-labelledby={titleId}
        className="min-w-0 self-start rounded border border-slate-200 bg-white xl:sticky xl:top-3 xl:order-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5">
          <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-bold text-[#003366]">
            <BookOpen aria-hidden="true" className="size-4 shrink-0" />Guía de configuración
          </h3>
          <AdministrationIconAction label="Cerrar guía" onClick={close} className="border-transparent">
            <X aria-hidden="true" className="size-4" />
          </AdministrationIconAction>
        </div>
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
          <label htmlFor={topicId}>Tema de ayuda</label>
          <select id={topicId} className={COMPACT_FORM_FIELD + " min-w-0 flex-1"} value={pinnedTopic}
            onChange={(event) => setPinnedTopic(event.target.value)}>
            <option value="">Seguir la pestaña</option>
            {topics.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
          </select>
        </div>
        <div key={topic} role="region" aria-label={"Guía de " + labels[topic]} tabIndex={0}
          className="max-h-[min(15rem,38dvh)] space-y-3 overflow-y-auto px-3 py-2 text-xs leading-5 text-slate-700 xl:max-h-[calc(100dvh-7.5rem)]">
          {setupOrder && <details>
            <summary className="cursor-pointer font-semibold text-[#0070a8]">Orden recomendado</summary>
            <p className="mt-1">{setupOrder.filter((item) => topics.includes(item)).map((item) => labels[item]).join(" → ")}</p>
          </details>}
          <div>
            <h4 className="font-bold text-slate-900">{lesson.title}</h4>
            <p>{lesson.purpose}</p>
          </div>
          <ol className="list-decimal space-y-1.5 pl-4">
            {lesson.steps.map((step, index) => <li key={index}>{step}</li>)}
          </ol>
          <div className="rounded border border-sky-100 bg-sky-50 px-2.5 py-1.5">
            <h5 className="font-bold text-[#003366]">Ejemplo de llenado</h5>
            {lesson.example}
          </div>
          {lesson.reference}
          <p>{lesson.check}</p>
        </div>
      </aside>}
      <div className="min-w-0 xl:order-1">{children}</div>
    </div>
  </>;
}
