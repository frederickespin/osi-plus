import { lazy, Suspense, useState, type MouseEvent } from "react";
import { ArrowLeft, Boxes, ChevronDown, ChevronRight, Hammer, Settings, Warehouse } from "lucide-react";
import { CanonicalAccessDenied } from "@/components/auth/CanonicalAccessDenied";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { isWarehouseSectionAllowed, warehouseSectionFromRoute, WAREHOUSE_SECTION_GROUPS, type WarehouseSection, type WarehouseSectionGroupId, type WarehouseSectionId } from "./warehouseSections";

const WarehouseSpaces = lazy(() => import("./WarehouseSpaces"));
const WarehouseConfiguration = lazy(() => import("./WarehouseConfiguration"));
const MaterialsInventoryApp = lazy(() => import("@/materials-inventory/MaterialsInventoryApp"));
const ToolsEquipmentApp = lazy(() => import("@/tools-equipment/ToolsEquipmentApp"));

const ICONS = { spaces: Warehouse, configuration: Settings, materials: Boxes, equipment: Hammer };

type Props = Readonly<{
  authorization?: string;
  pathname: string;
  sections: readonly WarehouseSection[];
  effectivePermissions: readonly string[];
  deniedPermissions: readonly string[];
  onNavigate(pathname: string): void;
  onUnauthorized(): void;
}>;

export default function WarehouseWorkspace({ authorization, pathname, sections, effectivePermissions, deniedPermissions, onNavigate, onUnauthorized }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<WarehouseSectionGroupId>>(new Set());
  const authorizedSections = sections.filter((section) => isWarehouseSectionAllowed(section, effectivePermissions, deniedPermissions));
  const requested = warehouseSectionFromRoute(pathname);
  const selected = pathname === "/warehouses" ? authorizedSections[0] : authorizedSections.find((section) => section.id === requested?.id);
  if (!selected) return <CanonicalAccessDenied onReturnToSafeRoute={() => onNavigate("/hub")} />;

  const navigate = (event: MouseEvent<HTMLAnchorElement>, route: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(route);
  };
  const consumerProps = { authorization, effectivePermissions, deniedPermissions, onUnauthorized };
  const renderSection = (id: WarehouseSectionId) => {
    switch (id) {
      case "spaces": return <WarehouseSpaces {...consumerProps} onNavigate={onNavigate} />;
      case "configuration": return <WarehouseConfiguration {...consumerProps} onNavigate={onNavigate} />;
      case "materials": return <MaterialsInventoryApp {...consumerProps} onNavigate={onNavigate} embedded />;
      case "equipment": return <ToolsEquipmentApp {...consumerProps} onNavigate={onNavigate} embedded />;
    }
  };

  return <div className="min-h-screen bg-slate-50" data-testid="warehouse-workspace">
    <header className="border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-1">
        <a href="/hub" onClick={(event) => navigate(event, "/hub")} className="inline-flex min-h-10 items-center gap-2 rounded px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070a8]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver al Hub</a>
        <h1 className="border-l border-slate-200 pl-5 text-xl font-bold text-[#003366]">Almacenes</h1>
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[225px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-white p-3 lg:min-h-[calc(100vh-57px)] lg:border-b-0 lg:border-r">
        <label className="block text-xs font-semibold text-slate-600 lg:hidden">Sección
          <select aria-label="Sección de Almacenes" value={selected.route} onChange={(event) => { setCollapsedGroups(new Set()); onNavigate(event.target.value); }} className={`${COMPACT_FORM_FIELD} mt-1 block w-full`}>{WAREHOUSE_SECTION_GROUPS.filter((group) => authorizedSections.some((section) => section.group === group.id)).map((group) => <optgroup key={group.id} label={group.label}>{authorizedSections.filter((section) => section.group === group.id).map((section) => <option key={section.id} value={section.route}>{section.label}</option>)}</optgroup>)}</select>
        </label>
        <nav aria-label="Secciones de Almacenes" className="hidden space-y-1 lg:block">
          {WAREHOUSE_SECTION_GROUPS.filter((group) => authorizedSections.some((section) => section.group === group.id)).map((group) => <div key={group.id} className="pb-2">
            <button type="button" aria-expanded={!collapsedGroups.has(group.id)} aria-controls={`warehouse-group-${group.id}`} onClick={() => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className="flex min-h-8 w-full items-center gap-1 rounded px-1 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-50">{collapsedGroups.has(group.id) ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{group.label}</button>
            <div id={`warehouse-group-${group.id}`} hidden={collapsedGroups.has(group.id)}>{authorizedSections.filter((section) => section.group === group.id).map((section) => {
            const Icon = ICONS[section.id];
            return <a key={section.id} href={section.route} aria-current={selected.id === section.id ? "page" : undefined} onClick={(event) => navigate(event, section.route)} className={`flex min-h-10 items-center gap-2 rounded px-2 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070a8] ${selected.id === section.id ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{section.label}</a>;
          })}</div></div>)}
        </nav>
      </aside>
      <main aria-label={selected.label} className="min-w-0 px-4 py-4 sm:px-5">
        <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">Cargando {selected.label}…</p>}>
          {renderSection(selected.id)}
        </Suspense>
      </main>
    </div>
  </div>;
}
