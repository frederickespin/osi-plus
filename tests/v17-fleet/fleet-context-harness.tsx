import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import FleetModule from "../../src/admin-fleet/FleetModule";
import { saveSession } from "../../src/lib/sessionStore";
import type { FleetVehicle } from "../../src/admin-fleet/types";

declare global {
  interface Window {
    v17FleetHarness?: {
      switchContext(): void;
      resolveOriginalPatch(): void;
      resolveSlowList(): void;
      snapshot(): { writes: number; patchAborted: boolean; slowRequested: boolean; slowAborted: boolean };
    };
  }
}

export function mountFleetHarness() {
  const actorRefs = { A: "11111111-1111-4111-8111-111111111111", B: "44444444-4444-4444-8444-444444444444" };
  const base = "/api/admin/fleet/vehicles";
  let active: "A" | "B" = "A";
  let writes = 0;
  let slowRequested = false;
  let patchSignal: AbortSignal | null | undefined;
  let slowSignal: AbortSignal | null | undefined;
  let resolvePatch: (response: Response) => void = () => undefined;
  let resolveList: (response: Response) => void = () => undefined;
  let switchContext = () => undefined;
  const vehicle = (context: string): FleetVehicle => ({
    vehicleRef: `synthetic-vehicle-${context}`, businessCode: `VEHICULO-${context}`, plate: null, vin: null, vehicleType: "Camión",
    brand: null, model: null, modelYear: null, capacityWeight: 4500, capacityVolume: 20, usableLength: null, usableWidth: null, usableHeight: null,
    weightUnit: "KG", volumeUnit: "CBM", dimensionUnit: "M", operationalStatus: "AVAILABLE", availableForCalculation: true,
    effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: null, hubCode: null, rowVersion: 1, updatedAt: "2026-10-31T12:00:00.000Z", retiredAt: null, calculationLocked: false,
  });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    if (url.pathname === base) {
      if (url.searchParams.get("search") === "lento") {
        slowRequested = true; slowSignal = init?.signal;
        // Resolve after abort to test the response fence, not just fetch cancellation.
        return new Promise<Response>((resolve) => { resolveList = resolve; });
      }
      return json({ ok: true, data: [vehicle(url.searchParams.get("search") === "actual" ? "ACTUAL" : active)], total: 1, page: 1, pageSize: 20 });
    }
    if (url.pathname === `${base}/synthetic-vehicle-A` && init?.method === "PATCH") {
      writes += 1; patchSignal = init.signal;
      return new Promise<Response>((resolve) => { resolvePatch = resolve; });
    }
    if (url.pathname === `${base}/synthetic-vehicle-${active}`) return json({ ok: true, vehicle: vehicle(active) });
    return originalFetch(input, init);
  };
  const storeContext = () => saveSession({ role: "A", membershipRef: actorRefs[active], memberships: [{ membershipRef: actorRefs[active], tenantName: `Empresa ${active}`, role: "A", preferred: true }], token: `synthetic-fleet-${active}` });
  storeContext();
  function Harness() {
    const [context, setContext] = useState(active);
    useEffect(() => { switchContext = () => { active = "B"; storeContext(); setContext("B"); }; return () => { switchContext = () => undefined; }; }, []);
    return createElement(FleetModule, { role: "A", authorization: `synthetic-fleet-${context}`, effectivePermissions: ["fleet:view", "fleet:edit"], deniedPermissions: [], onUnauthorized: () => undefined, onReturnToHub: () => undefined });
  }
  window.v17FleetHarness = {
    switchContext: () => switchContext(),
    resolveOriginalPatch: () => resolvePatch(json({ ok: true, vehicle: { ...vehicle("A"), model: "Borrador A", rowVersion: 2 } })),
    resolveSlowList: () => resolveList(json({ ok: true, data: [vehicle("TARDE")], total: 1, page: 1, pageSize: 20 })),
    snapshot: () => ({ writes, patchAborted: patchSignal?.aborted === true, slowRequested, slowAborted: slowSignal?.aborted === true }),
  };
  createRoot(document.getElementById("root")!).render(createElement(Harness));
}
