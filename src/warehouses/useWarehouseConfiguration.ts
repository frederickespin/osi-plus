import { useEffect, useRef, useState } from "react";
import { WarehouseApi, WarehouseApiError, warehouseErrorText } from "./api";
import type { WarehouseConfiguration } from "./configurationTypes";

export function useWarehouseConfiguration(api: WarehouseApi, enabled: boolean, revision: number, onUnauthorized: () => void) {
  const [result, setResult] = useState<{ revision: number; data: WarehouseConfiguration | null; error: string | null } | null>(null);
  const callback = useRef(onUnauthorized);
  useEffect(() => { callback.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void api.configuration(controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ revision, data, error: null });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof WarehouseApiError && cause.status === 401) callback.current();
      else setResult({ revision, data: null, error: warehouseErrorText(cause) });
    });
    return () => controller.abort();
  }, [api, enabled, revision]);
  const current = enabled && result?.revision === revision;
  return { loading: enabled && !current, data: current ? result?.data ?? null : null, error: current ? result?.error ?? null : null };
}
