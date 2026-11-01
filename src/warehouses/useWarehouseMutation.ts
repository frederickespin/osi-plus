import { useEffect, useRef, useState } from "react";
import { WarehouseApi, WarehouseApiError, isWarehouseRejectionConfirmed, warehouseErrorText, type WarehouseChange, type WarehouseSaved } from "./api";
import { clearPendingWarehouseDraft, setPendingWarehouseDraft, type PendingWarehouseDraft } from "./pendingDraft";

type Options = Readonly<{
  api: WarehouseApi;
  membershipRef: string | null;
  recovery?: PendingWarehouseDraft;
  onPending(draft: PendingWarehouseDraft | null): void;
  onSaved(saved: WarehouseSaved): void;
  onUnauthorized(): void;
}>;

/** Persist before dispatch, keep the exact intent while its result is unknown, and retry only on a user action. */
export function useWarehouseMutation({ api, membershipRef, recovery, onPending, onSaved, onUnauthorized }: Options) {
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(Boolean(recovery));
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(recovery ? "Hay un guardado anterior sin confirmar. Reintente para comprobar el mismo cambio." : null);
  const active = useRef(false);
  const attempt = useRef<PendingWarehouseDraft | null>(recovery ?? null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submit(candidate: WarehouseChange) {
    if (active.current || conflict || !membershipRef) return;
    const change = uncertain && attempt.current ? attempt.current.change : candidate;
    if (!attempt.current || JSON.stringify(attempt.current.change) !== JSON.stringify(change)) attempt.current = { requestId: crypto.randomUUID(), change };
    const draft = attempt.current;
    const controller = new AbortController(); controllerRef.current = controller;
    active.current = true; setSaving(true); setError(null);
    setPendingWarehouseDraft(membershipRef, draft); onPending(draft);
    try {
      const saved = await api.save(draft.change, draft.requestId, controller.signal);
      if (controller.signal.aborted) return;
      clearPendingWarehouseDraft(membershipRef); onPending(null); setUncertain(false); onSaved(saved);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const unknownResult = !(cause instanceof WarehouseApiError) || cause.status >= 500;
      const unresolved = unknownResult || uncertain && !isWarehouseRejectionConfirmed(cause);
      setUncertain(unresolved);
      if (!unresolved) { clearPendingWarehouseDraft(membershipRef); onPending(null); }
      if (cause instanceof WarehouseApiError && cause.status === 401) { onUnauthorized(); return; }
      setConflict(!unresolved && cause instanceof WarehouseApiError && ["MATERIALS_VERSION_CONFLICT", "MATERIALS_IDEMPOTENCY_CONFLICT", "MATERIALS_RESOURCE_NOT_FOUND", "WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", "WAREHOUSE_CONFIGURATION_IDEMPOTENCY_CONFLICT", "WAREHOUSE_AREA_USE_NOT_FOUND", "WAREHOUSE_LOCATION_NOT_FOUND"].includes(cause.code));
      setError(unknownResult ? "No se pudo confirmar el guardado. Sus datos se conservaron. Reintente para comprobar el mismo cambio." : `${warehouseErrorText(cause)}${unresolved ? " El guardado anterior sigue sin confirmar." : ""}`);
    } finally {
      active.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return { saving, uncertain, conflict, error, setError, submit, locked: saving || uncertain || conflict };
}
