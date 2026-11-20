import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_TABLE_FIELD } from "@/components/ui/compact-form";
import { FleetApi, FleetApiError, fleetErrorText } from "./api";
import type { FleetVehicleType } from "./types";

export default function FleetTypeForm({ api, onSaved, onClose, onUnauthorized }: {
  api: FleetApi;
  onSaved(type: FleetVehicleType): void;
  onClose(): void;
  onUnauthorized(): void;
}) {
  const [name, setName] = useState("");
  const [variableVolume, setVariableVolume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const type = { name: name.trim(), variableVolume };
    if (!type.name || pending.current) return;
    const key = JSON.stringify(type);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const saved = await api.createType({ ...type, requestId: request.current.id }, controller.signal);
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

  return <form aria-label="Registrar tipo de vehículo" onSubmit={(event) => void save(event)}
    className="mb-3 rounded border border-slate-200 bg-sky-50 p-2 text-xs">
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
      <label className="min-w-40 flex-1 font-semibold text-slate-700">Nombre del tipo
        <input autoFocus required maxLength={80} value={name} placeholder="Ej. Camión de cama abierta"
          onChange={(event) => setName(event.target.value)} className={COMPACT_TABLE_FIELD} />
      </label>
      <label className="flex min-h-8 items-center gap-2 px-1 text-slate-700" title="Para tractocamiones o vehículos con contenedores intercambiables.">
        <input type="checkbox" checked={variableVolume} onChange={(event) => setVariableVolume(event.target.checked)} />
        Volumen según el contenedor
      </label>
      <AdministrationIconAction label="Guardar tipo" type="submit" disabled={busy || !name.trim()}><Check aria-hidden="true" className="size-4" /></AdministrationIconAction>
      <AdministrationIconAction label="Cancelar tipo" disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-4" /></AdministrationIconAction>
    </fieldset>
    {error && <p role="alert" className="mt-1 text-red-800">{error}</p>}
  </form>;
}
