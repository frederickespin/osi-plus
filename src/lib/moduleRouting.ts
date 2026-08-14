import type { ModuleId } from "@/lib/roleModuleMap";

const ROUTE_TO_MODULE = Object.freeze<Record<string, ModuleId>>({
  "/sales/pipeline": "crm-pipeline",
  "/evaluator": "evaluator-app",
});

const MODULE_TO_ROUTE = Object.freeze<Partial<Record<ModuleId, string>>>({
  "crm-pipeline": "/sales/pipeline",
  "evaluator-app": "/evaluator",
});

export function resolveModuleFromPath(pathname: string): ModuleId | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_TO_MODULE[normalized] ?? null;
}

export function routeForModule(moduleId: ModuleId): string | null {
  return MODULE_TO_ROUTE[moduleId] ?? null;
}

export function updateModuleRoute(moduleId: ModuleId, history: Pick<History, "pushState">, location: Pick<Location, "pathname">) {
  const nextPath = routeForModule(moduleId) ?? "/";
  if (nextPath !== location.pathname) history.pushState({}, "", nextPath);
}
