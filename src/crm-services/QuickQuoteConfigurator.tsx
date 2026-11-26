import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import { NumericInput } from "@/components/ui/numeric-input";
import { commercialIntake } from "@/commercial-crm/caseCommercialIntake";
import { pricingDecimal } from "@/costing/pricingInput";
import { planVolume } from "../../shared/planVolume.js";
import { knownAccessFlags, ROUTE_ACCESS_LABELS } from "../../shared/routeAccess.js";
import type { PlanSurveySummary, ServiceMaterialPolicy, ServicePackage } from "./api";
import { PlanAdditionalNeeds } from "./PlanAdditionalNeeds";
import { planPricedAdditions, validPlanQuantity } from "./planPricedAdditions";

type Props = Readonly<{
  caseRef: string;
  authorization?: string;
  canReadCatalog?: boolean;
  surveySummary?: PlanSurveySummary | null;
  estimatedVolumeM3?: number | null;
  routeRevision?: number | null;
  packages: readonly ServicePackage[];
  policies: readonly ServiceMaterialPolicy[];
  initialPackageVersionRef: string;
  initialPolicyVersionRef: string;
  initialDurationHours: string;
  initialPreference: Record<string, unknown>;
  disabled: boolean;
  saving: boolean;
  onConfirm(input: Readonly<{ packageVersionRef: string; policyVersionRef: string; durationHours: string; preference: Record<string, unknown> }>): void;
}>;

const FIELD = COMPACT_TABLE_FIELD + " mt-1 bg-slate-100 px-2";
const LABEL = "min-w-0 text-xs font-semibold text-slate-700";
const LEGACY_ADDITIONS: Record<string, string> = {
  STAIRS: "Escaleras", LONG_CARRY: "Acarreo largo", ASSEMBLY: "Armar / desarmar", CRANE: "Grúa",
  WOOD_CRATE: "Huacal", EXTRA_STOP: "Parada adicional", WAITING: "Espera", SPECIAL_HOURS: "Horario especial",
};
const formatVolume = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 6 });
type AccessSide = "origin" | "destination";
type ClientConditions = Partial<Record<AccessSide, { routeRevision: number; flags: string[] }>>;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default function QuickQuoteConfigurator({
  caseRef, authorization, canReadCatalog = false, surveySummary, estimatedVolumeM3, routeRevision, packages, policies, initialPackageVersionRef,
  initialPolicyVersionRef, initialDurationHours, initialPreference, disabled, saving, onConfirm,
}: Props) {
  const previous = objectValue(initialPreference.quickQuote);
  const intake = commercialIntake(initialPreference).directQuote;
  const automatic = planVolume({ directQuote: intake }, surveySummary?.volumeM3, estimatedVolumeM3);
  const initialVolume = planVolume(initialPreference, surveySummary?.volumeM3, estimatedVolumeM3);
  const [manualVolume, setManualVolume] = useState<string | null>(() => initialVolume.source === "MANUAL" ? String(initialVolume.amount) : null);
  const [packageRef, setPackageRef] = useState(initialPackageVersionRef);
  const [policyRef, setPolicyRef] = useState(initialPolicyVersionRef);
  const [enteredDuration, setEnteredDuration] = useState<string | null>(initialDurationHours || null);
  const durations = packages.find((item) => item.versionRef === packageRef)?.requirements.filter((line) => line.kind === "DURATION") ?? [];
  const packageHours = durations.length === 1 ? durations[0].hours : null;
  const durationHours = enteredDuration ?? (packageHours != null ? String(packageHours) : "");
  const [pricedAdditions, setPricedAdditions] = useState(() => planPricedAdditions(initialPreference));
  const [clientAccess, setClientAccess] = useState({
    origin: typeof previous.clientOriginAccess === "string" ? previous.clientOriginAccess : "",
    destination: typeof previous.clientDestinationAccess === "string" ? previous.clientDestinationAccess : "",
  });
  const [accessVersions, setAccessVersions] = useState(() => objectValue(previous.clientAccessRouteVersions));
  const [conditions, setConditions] = useState<ClientConditions>(() => {
    const stored = objectValue(previous.clientAccessConditions);
    const initial: ClientConditions = {};
    for (const side of ["origin", "destination"] as const) {
      const value = objectValue(stored[side]);
      const flags = knownAccessFlags(value.flags);
      if (flags.length && typeof value.routeRevision === "number") initial[side] = { routeRevision: value.routeRevision, flags };
    }
    return initial;
  });
  function updateConditions(side: AccessSide, flags: string[]) {
    if (routeRevision == null || routeRevision < 1) return;
    setConditions((current) => {
      const next = { ...current };
      if (flags.length) next[side] = { routeRevision, flags: knownAccessFlags(flags) };
      else delete next[side];
      return next;
    });
  }
  const intakeAccessVersions = objectValue(initialPreference.directAccessRouteVersions);
  const isCurrentAccess = (version: unknown) => routeRevision != null && version === routeRevision;
  const changeAccess = (side: "origin" | "destination", note: string) => {
    setClientAccess((current) => ({ ...current, [side]: note }));
    setAccessVersions((current) => ({ ...current, [side]: routeRevision ?? null }));
  };
  const legacyAdditions = Array.isArray(previous.additions) ? previous.additions.filter((v): v is string => typeof v === "string") : [];
  const availablePolicies = policies.filter((item) => !item.packageVersionRef || item.packageVersionRef === packageRef);
  const manual = manualVolume?.trim() || "";
  const volumeValue = manualVolume ?? (automatic.amount === null ? "" : String(automatic.amount));
  const decimal = pricingDecimal(manual, 6);
  const volumeM3 = manual ? (decimal === null ? null : Number(decimal)) : automatic.amount;
  const validVolume = (!manual && volumeM3 === null) || (volumeM3 !== null && volumeM3 > 0 && volumeM3 <= 100_000);
  const duration = pricingDecimal(durationHours, 6);
  const validDuration = !durationHours.trim() || (duration !== null && Number(duration) <= 100_000);
  const locked = disabled || saving;
  const canSave = !locked && validVolume && validDuration && pricedAdditions.every(validPlanQuantity);
  const source = { SURVEY: "Survey", CLIENT: "Cliente", CASE: "Caso", MANUAL: "Plan" }[automatic.source];

  function save() {
    if (!canSave) return;
    onConfirm({
      packageVersionRef: packageRef, policyVersionRef: policyRef, durationHours: duration ?? "",
      preference: {
        ...previous, schemaVersion: 2, volumeM3, volumeSource: manual ? "MANUAL" : "AUTO",
        clientOriginAccess: clientAccess.origin.trim() || null, clientDestinationAccess: clientAccess.destination.trim() || null,
        clientAccessRouteVersions: accessVersions,
        clientAccessConditions: conditions,
        pricedAdditions,
      },
    });
  }

  return <div className="mt-3 space-y-4">
    <div className="grid items-start gap-x-5 gap-y-2 sm:grid-cols-[minmax(14rem,2fr)_minmax(11rem,1fr)_minmax(10rem,1fr)]">
      <label className={LABEL}>Paquete de referencia
        <select className={FIELD} value={packageRef} disabled={locked} onChange={(event) => { setPackageRef(event.target.value); setPolicyRef(""); }}>
          <option value="">Sin paquete</option>
          {packages.map((item) => <option key={item.versionRef} value={item.versionRef}>{item.name} · v{item.version}</option>)}
        </select>
      </label>
      <div><label className={LABEL}>Volumen a cotizar (m³)
        <NumericInput className={FIELD} value={volumeValue} placeholder="Escriba el volumen" disabled={locked}
          allowDecimalComma min={0.000001} max={100000} step="any" onChange={(event) => setManualVolume(event.target.value)} />
      </label>
        {automatic.amount !== null && <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
          <span>{source} · {formatVolume.format(automatic.amount)} m³</span>
          {manualVolume !== null && <button type="button" className="font-semibold text-sky-800 hover:underline"
            disabled={locked} onClick={() => setManualVolume(null)}>Usar este volumen</button>}
        </div>}
        {!validVolume && <p role="alert" className="mt-1 text-xs text-red-700">Indique de 0.000001 a 100,000 m³, con hasta seis decimales.</p>}
      </div>
      <label className={LABEL}>Duración prevista (h)
        <NumericInput className={FIELD} value={durationHours} disabled={locked} allowDecimalComma min={0} step="any"
          max={100000} placeholder="Por determinar" onChange={(event) => setEnteredDuration(event.target.value)} />
        {!validDuration && <span role="alert" className="mt-1 block text-xs text-red-700">Revise las horas indicadas.</span>}
      </label>
    </div>

    <div className="space-y-1 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
      <p><strong className="text-[#003366]">Contenido{surveySummary ? " · Survey V" + surveySummary.revision : intake?.clientList ? " · Listado del cliente" : ""}</strong>
        {" — "}{surveySummary?.contentNote ?? (surveySummary ? "Sin artículos registrados." : intake?.clientList ?? "Pendiente de levantamiento.")}</p>
      {surveySummary?.materialsNote && <p><strong>Materiales previstos</strong>{" — "}{surveySummary.materialsNote}</p>}
    </div>

    <section aria-label="Acceso de origen y destino" className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {([
        { key: "origin", name: "Origen", survey: surveySummary?.originAccess, client: intake?.originAccess },
        { key: "destination", name: "Destino", survey: surveySummary?.destinationAccess, client: intake?.destinationAccess },
      ] as const).map((side) => {
        const note = clientAccess[side.key];
        const oldClient = side.client && !isCurrentAccess(intakeAccessVersions[side.key]);
        const oldNote = note && !isCurrentAccess(accessVersions[side.key]);
        const selected = conditions[side.key]?.flags ?? [];
        const stale = selected.length > 0 && !isCurrentAccess(conditions[side.key]?.routeRevision);
        const observed = isCurrentAccess(surveySummary?.routeVersion) ? surveySummary?.accessFlags?.[side.key] ?? [] : [];
        const available = Object.entries(ROUTE_ACCESS_LABELS).filter(([flag]) => !selected.includes(flag) && !observed.includes(flag));
        return <div key={side.key} className="min-w-0 text-xs">
          <h4 className="font-semibold text-[#003366]">Acceso · {side.name}</h4>
          {side.survey && <p className="mt-1 whitespace-pre-line text-slate-700"><strong>{isCurrentAccess(surveySummary?.routeVersion)
            ? "Survey" : "Survey anterior · confirmar acceso"}</strong>{" · "}{side.survey}</p>}
          {side.client && side.client !== note && <p className="mt-1 whitespace-pre-line text-slate-700">
            <strong>{oldClient ? "Informado por el cliente · por confirmar" : "Informado por el cliente"}</strong>{" · "}{side.client}</p>}
          <label className="mt-1 block text-slate-600">Informado por el cliente{oldNote ? " · por confirmar" : ""}
            <input aria-label={"Observación del cliente sobre acceso de " + side.name.toLowerCase()} value={note} maxLength={160}
              placeholder={side.client || side.survey ? "Añadir detalle del cliente" : "Acceso indicado por el cliente"}
              className={FIELD} disabled={locked} onChange={(event) => changeAccess(side.key, event.target.value)} />
          </label>
          {routeRevision != null && (oldNote || (oldClient && !note)) && <button type="button" disabled={locked}
            onClick={() => changeAccess(side.key, note || side.client || "")} className="mt-1 font-semibold text-sky-800 hover:underline">
            Confirmar con el cliente</button>}
          {routeRevision != null && routeRevision > 0 && <div className="mt-1">
            <select aria-label={"Condición de acceso en " + side.name.toLowerCase()} className={FIELD}
              value="" disabled={locked || stale || !available.length}
              onChange={(event) => updateConditions(side.key, [...selected, event.target.value])}>
              <option value="">Añadir condición indicada por el cliente…</option>
              {available.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
            </select>
            {selected.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {selected.map((flag) => <span className="inline-flex items-center gap-1 text-slate-700" key={flag}>{ROUTE_ACCESS_LABELS[flag]}
                {!stale && <button type="button" disabled={locked} aria-label={"Quitar " + ROUTE_ACCESS_LABELS[flag] + " en " + side.name.toLowerCase()}
                  onClick={() => updateConditions(side.key, selected.filter((item) => item !== flag))}>×</button>}</span>)}
              {stale && <><span className="text-amber-800">Dirección anterior</span>
                <button type="button" disabled={locked} className="text-sky-800 underline"
                  onClick={() => updateConditions(side.key, selected)}>Confirmar condiciones</button>
                <button type="button" disabled={locked} className="text-slate-600 underline"
                  onClick={() => updateConditions(side.key, [])}>Descartar</button></>}
            </div>}
          </div>}
        </div>;
      })}
    </section>

    <PlanAdditionalNeeds caseRef={caseRef} authorization={authorization} canReadCatalog={canReadCatalog} rows={pricedAdditions}
      onChange={setPricedAdditions} disabled={locked} />
    {legacyAdditions.length > 0 && <p className="text-xs text-slate-600">Anotaciones anteriores sin tarifa · {legacyAdditions.map((code) => LEGACY_ADDITIONS[code] ?? code).join(", ")}</p>}

    <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-2">
      <label className={LABEL}>Política de materiales
        <select disabled={locked} value={policyRef} onChange={(event) => setPolicyRef(event.target.value)} className={FIELD}>
          <option value="">Sin política confirmada</option>
          {availablePolicies.map((item) => <option key={item.versionRef} value={item.versionRef}>{item.name} · v{item.version}</option>)}
        </select>
      </label>
      <Button type="button" size="sm" disabled={!canSave} onClick={save}><Save aria-hidden="true"/>{saving ? "Guardando…" : "Guardar configuración"}</Button>
    </footer>
  </div>;
}
