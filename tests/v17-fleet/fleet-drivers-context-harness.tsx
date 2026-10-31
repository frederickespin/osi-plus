import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import FleetModule from "../../src/admin-fleet/FleetModule";
import { saveSession } from "../../src/lib/sessionStore";
import type { FleetVehicle } from "../../src/admin-fleet/types";

declare global {
  interface Window {
    v17FleetDriversHarness?: { switchContext(): void; resolveOriginal(): void; snapshot(): { writes: number; aborted: boolean } };
  }
}

export function mountFleetDriversHarness() {
  const actorRefs = { A: "11111111-1111-4111-8111-111111111111", B: "44444444-4444-4444-8444-444444444444" };
  const vehicleRefs = { A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  const permissions = ["fleet:view", "fleet:edit", "fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"];
  let active: "A" | "B" = "A"; let writes = 0;
  let signal: AbortSignal | null | undefined;
  let resolveOriginal: (response: Response) => void = () => undefined;
  let switchContext = () => undefined;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const vehicle = (context: "A" | "B"): FleetVehicle => ({ vehicleRef: vehicleRefs[context], businessCode: `FLOTA-${context}`, plate: null, vin: null, vehicleType: "Camión", brand: null, model: null, modelYear: null,
    capacityWeight: 4000, capacityVolume: 20, usableLength: null, usableWidth: null, usableHeight: null, weightUnit: "KG", volumeUnit: "CBM", dimensionUnit: "M", operationalStatus: "AVAILABLE", availableForCalculation: true,
    effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: null, hubCode: null, rowVersion: 1, updatedAt: "2026-10-31T12:00:00.000Z", retiredAt: null, calculationLocked: false });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    if (url.pathname === "/api/admin/fleet/vehicles") return json({ ok: true, data: [vehicle(active)], total: 1, page: 1, pageSize: 20 });
    if (url.pathname === "/api/admin/fleet/drivers/options") return json({ ok: true, data: [{ membershipRef: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", displayName: `Chofer de ${active}` }], total: 1, page: 1, pageSize: 20 });
    if (url.pathname === `/api/admin/fleet/vehicles/${vehicleRefs.A}/drivers/primary` && init?.method === "PUT") {
      writes += 1; signal = init.signal;
      // A mock resolves even after abort, exercising the response fence as well as cancellation.
      return new Promise<Response>((resolve) => { resolveOriginal = resolve; });
    }
    if (url.pathname === `/api/admin/fleet/vehicles/${vehicleRefs[active]}/drivers`) return json({ ok: true, vehicle: { vehicleRef: vehicleRefs[active], businessCode: `FLOTA-${active}`, plate: null, operationalStatus: "AVAILABLE" }, primaryDriver: null, primaryVersion: 0, generatedAt: "2030-11-01T13:00:00.000Z", historyKind: url.searchParams.get("historyKind"), data: [], total: 0, page: 1, pageSize: 20, permissions: { assign: true, request: true, authorize: true } });
    return originalFetch(input, init);
  };
  const storeContext = () => saveSession({ role: "A", membershipRef: actorRefs[active], memberships: [{ membershipRef: actorRefs[active], tenantName: `Empresa ${active}`, role: "A", preferred: true }], token: `synthetic-drivers-${active}` });
  storeContext();
  function Harness() {
    const [context, setContext] = useState(active);
    useEffect(() => { switchContext = () => { active = "B"; storeContext(); setContext("B"); }; return () => { switchContext = () => undefined; }; }, []);
    return createElement(FleetModule, { role: "A", authorization: `synthetic-drivers-${context}`, effectivePermissions: permissions, deniedPermissions: [], onUnauthorized: () => undefined, onReturnToHub: () => undefined });
  }
  window.v17FleetDriversHarness = {
    switchContext: () => switchContext(),
    resolveOriginal: () => resolveOriginal(json({ ok: true, vehicleRef: vehicleRefs.A, reference: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", version: 1, idempotent: false })),
    snapshot: () => ({ writes, aborted: signal?.aborted === true }),
  };
  createRoot(document.getElementById("root")!).render(createElement(Harness));
}
