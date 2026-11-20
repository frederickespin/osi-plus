import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import { FleetApi, FleetApiError, fleetErrorText } from "./api";
import type { FleetVehicleType } from "./types";

export default function FleetTypeForm({ api, existing, onSaved, onClose, onUnauthorized }: {
  api: FleetApi;
  existing?: FleetVehicleType;
  onSaved(type: FleetVehicleType): void;
  onClose(): void;
  onUnauthorized(): void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [variableVolume, setVariableVolume] = useState(existing?.variableVolume ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const capacityId = useId();
  const pending = useRef<AbortController | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const canSave = !busy && Boolean(name.trim()) && variableVolume !== existing?.variableVolume;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const type = { name: name.trim(), variableVolume };
    if (!canSave || pending.current) return;
    const key = JSON.stringify(type);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const payload = { ...type, requestId: request.current.id };
      const saved = existing
        ? await api.updateType({ ...payload, expectedVariableVolume: existing.variableVolume }, controller.signal)
        : await api.createType(payload, controller.signal);
      if (!controller.signal.aborted) onSaved(saved);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof FleetApiError && cause.status === 401) onUnauthorized();
      else setError(fleetErrorText(cause));
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <form aria-label={existing ? "Editar tipo de vehículo" : "Registrar tipo de vehículo"}
    onSubmit={(event) => void save(event)} className="min-w-0 text-xs">
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
      {!existing && <label className="grid min-w-44 flex-1 gap-1 font-semibold text-slate-700">Nombre del tipo
        <input autoFocus required maxLength={80} value={name} placeholder="Ej. Camión de caja cerrada"
          onChange={(event) => setName(event.target.value)} className={COMPACT_FORM_FIELD} />
      </label>}
      <div className="grid min-w-48 flex-1 gap-1 font-semibold text-slate-700">
        <label htmlFor={capacityId}>Capacidad de carga</label>
        <select id={capacityId} value={variableVolume ? "container" : "fixed"} onChange={(event) => setVariableVolume(event.target.value === "container")} className={COMPACT_FORM_FIELD}>
          <option value="fixed">Volumen fijo del vehículo</option>
          <option value="container">Volumen según el contenedor</option>
        </select>
      </div>
      <AdministrationHelp title="capacidad de carga">
        <p><strong>Volumen fijo del vehículo.</strong> Para un furgón o camión de caja cerrada. En la ficha de cada vehículo se registra el volumen y las dimensiones de su espacio de carga.</p>
        <p><strong>Volumen según el contenedor.</strong> Para un tractocamión con contenedores intercambiables. La ficha admite el peso de carga y el volumen depende del contenedor utilizado.</p>
      </AdministrationHelp>
      <AdministrationIconAction label="Guardar tipo" type="submit" disabled={!canSave}><Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
      <AdministrationIconAction label="Cancelar tipo" disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
    </fieldset>
    {error && <p role="alert" className="mt-1 text-red-800">{error}</p>}
  </form>;
}
