import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiCaseAction, apiGetCaseDetail, apiGetCases, apiGetEvents, apiPatchCase, apiPatchEvent } from "./apiClient";
import { applyAction, evaluateAutoTransitions, type ActionId } from "./stateEngine";
import type { Event, Quote, ServiceCase } from "./types";
import { mockPipelineEvents, mockQuotes, mockServiceCases } from "./mocks";

type CaseSnapshot = {
  case: ServiceCase;
  events: Event[];
  quotes: Quote[];
  crating?: Record<string, unknown> | null;
};

type CasesStoreValue = {
  cases: ServiceCase[];
  events: Event[];
  quotes: Quote[];
  loading: boolean;
  updateCase: (id: string, patch: Partial<ServiceCase>) => void;
  applyCaseAction: (id: string, action: ActionId, payload?: Partial<ServiceCase>) => void;
  ensureCaseDetail: (id: string) => Promise<void>;
  updateEvent: (id: string, patch: Partial<Event>) => void;
};

const CasesStoreContext = createContext<CasesStoreValue | null>(null);

const CASES_QUERY_KEY = ["pipeline", "cases"] as const;
const FORCE_MOCK_MODE = import.meta.env.VITE_PIPELINE_V2_MOCKS === "1";

function dedupeById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(row.id, row));
  return Array.from(map.values());
}

function mergeCaseInList(list: ServiceCase[], nextCase: ServiceCase) {
  const found = list.some((item) => item.id === nextCase.id);
  if (!found) return [nextCase, ...list];
  return list.map((item) => (item.id === nextCase.id ? nextCase : item));
}

export function CasesStoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [detailMap, setDetailMap] = useState<Record<string, CaseSnapshot>>({});
  const [isFallbackMode, setIsFallbackMode] = useState<boolean>(FORCE_MOCK_MODE);
  const [offlineCases, setOfflineCases] = useState<ServiceCase[]>(() => mockServiceCases);
  const [offlineEvents, setOfflineEvents] = useState<Event[]>(() => mockPipelineEvents);
  const [offlineQuotes, setOfflineQuotes] = useState<Quote[]>(() => mockQuotes);
  const fallbackToastShownRef = useRef(false);

  const eventsFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);
  const eventsTo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    return d.toISOString();
  }, []);

  const activateFallbackMode = useCallback((reason?: string) => {
    setIsFallbackMode(true);
    if (!fallbackToastShownRef.current) {
      fallbackToastShownRef.current = true;
      toast.warning(reason || "API no disponible. Pipeline V2 en modo local para evaluación.");
    }
  }, []);

  const casesQuery = useQuery({
    queryKey: CASES_QUERY_KEY,
    queryFn: async () => {
      if (FORCE_MOCK_MODE || isFallbackMode) {
        return {
          data: offlineCases,
          page: 1,
          pageSize: offlineCases.length,
          total: offlineCases.length,
        };
      }

      try {
        const result = await apiGetCases({ page: 1, pageSize: 200 });
        setIsFallbackMode(false);
        return result;
      } catch (error: any) {
        activateFallbackMode(error?.body?.error || "No se pudo cargar /api/cases");
        return {
          data: offlineCases,
          page: 1,
          pageSize: offlineCases.length,
          total: offlineCases.length,
        };
      }
    },
    staleTime: 45_000,
  });

  const eventsQuery = useQuery({
    queryKey: ["pipeline", "events", eventsFrom, eventsTo],
    queryFn: async () => {
      if (FORCE_MOCK_MODE || isFallbackMode) {
        return offlineEvents;
      }

      try {
        return await apiGetEvents({ from: eventsFrom, to: eventsTo });
      } catch (error: any) {
        activateFallbackMode(error?.body?.error || "No se pudo cargar /api/events");
        return offlineEvents;
      }
    },
    staleTime: 30_000,
  });

  const mergeSnapshot = useCallback(
    (snapshot: CaseSnapshot) => {
      setDetailMap((prev) => ({ ...prev, [snapshot.case.id]: snapshot }));
      queryClient.setQueryData<{ data: ServiceCase[]; page: number; pageSize: number; total: number }>(
        CASES_QUERY_KEY,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: mergeCaseInList(prev.data || [], snapshot.case),
          };
        }
      );
    },
    [queryClient]
  );

  const ensureCaseDetail = useCallback(
    async (id: string) => {
      if (!id) return;

      if (FORCE_MOCK_MODE || isFallbackMode) {
        const serviceCase = offlineCases.find((item) => item.id === id);
        if (!serviceCase) return;
        mergeSnapshot({
          case: serviceCase,
          events: offlineEvents.filter((event) => event.case_id === id),
          quotes: offlineQuotes.filter((quote) => quote.case_id === id),
          crating: null,
        });
        return;
      }

      const snapshot = await queryClient.fetchQuery({
        queryKey: ["pipeline", "case", id],
        queryFn: () => apiGetCaseDetail(id),
        staleTime: 25_000,
      });
      mergeSnapshot(snapshot);
    },
    [isFallbackMode, mergeSnapshot, offlineCases, offlineEvents, offlineQuotes, queryClient]
  );

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ServiceCase> }) => {
      if (FORCE_MOCK_MODE || isFallbackMode) {
        const currentCase = offlineCases.find((item) => item.id === id);
        if (!currentCase) throw new Error("Caso no encontrado en modo local.");

        const nextCase = evaluateAutoTransitions({
          ...currentCase,
          ...patch,
          milestones: { ...currentCase.milestones, ...(patch.milestones || {}) },
        });

        const nextCases = offlineCases.map((item) => (item.id === id ? nextCase : item));
        setOfflineCases(nextCases);

        return {
          case: nextCase,
          events: offlineEvents.filter((event) => event.case_id === id),
          quotes: offlineQuotes.filter((quote) => quote.case_id === id),
          crating: null,
        } satisfies CaseSnapshot;
      }

      return apiPatchCase(id, patch);
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: CASES_QUERY_KEY });
      const previous = queryClient.getQueryData(CASES_QUERY_KEY);
      queryClient.setQueryData<{ data: ServiceCase[]; page: number; pageSize: number; total: number }>(
        CASES_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            data: current.data.map((item) => {
              if (item.id !== id) return item;
              return evaluateAutoTransitions({
                ...item,
                ...patch,
                milestones: { ...item.milestones, ...(patch.milestones || {}) },
              });
            }),
          };
        }
      );
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CASES_QUERY_KEY, context.previous);
      }
      toast.error(error?.body?.error || error?.message || "No se pudo guardar el caso.");
    },
    onSuccess: (snapshot) => {
      mergeSnapshot(snapshot);
    },
    onSettled: (_result, _error, vars) => {
      if (FORCE_MOCK_MODE || isFallbackMode) return;
      queryClient.invalidateQueries({ queryKey: CASES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["pipeline", "case", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", "events"] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, payload }: { id: string; action: ActionId; payload?: Partial<ServiceCase> }) => {
      if (FORCE_MOCK_MODE || isFallbackMode) {
        const currentCase = offlineCases.find((item) => item.id === id);
        if (!currentCase) throw new Error("Caso no encontrado en modo local.");

        const nextCase = applyAction(currentCase, action, payload);
        const nextCases = offlineCases.map((item) => (item.id === id ? nextCase : item));

        let nextEvents = offlineEvents;
        let nextQuotes = offlineQuotes;

        if (action === "SCHEDULE_SURVEY") {
          const surveyEvent: Event = {
            id: `evt-survey-${id}`,
            case_id: id,
            event_type: "SURVEY",
            start_at:
              nextCase.milestones.survey_planned_at ||
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: "PENDING",
          };
          const existingIndex = nextEvents.findIndex((event) => event.id === surveyEvent.id);
          if (existingIndex >= 0) {
            nextEvents = nextEvents.map((event, idx) => (idx === existingIndex ? surveyEvent : event));
          } else {
            nextEvents = [surveyEvent, ...nextEvents];
          }
        }

        if (action === "CREATE_FOLLOWUP") {
          const followupEvent: Event = {
            id: `evt-followup-${id}`,
            case_id: id,
            event_type: "FOLLOW_UP",
            start_at:
              nextCase.milestones.followup_event_at ||
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: "PENDING",
          };
          const existingIndex = nextEvents.findIndex((event) => event.id === followupEvent.id);
          if (existingIndex >= 0) {
            nextEvents = nextEvents.map((event, idx) => (idx === existingIndex ? followupEvent : event));
          } else {
            nextEvents = [followupEvent, ...nextEvents];
          }
        }

        if (action === "ISSUE_FAST_QUOTE" || action === "ISSUE_FINAL_QUOTE") {
          const currentCaseQuotes = nextQuotes.filter((quote) => quote.case_id === id);
          const nextVersion = currentCaseQuotes.length
            ? Math.max(...currentCaseQuotes.map((quote) => quote.version || 0)) + 1
            : 1;
          const level = action === "ISSUE_FAST_QUOTE" ? "BASIC" : "STANDARD";
          const quote: Quote = {
            id: `qt-${id}-${nextVersion}`,
            case_id: id,
            level,
            version: nextVersion,
            status: "SENT",
            sent_at: new Date().toISOString(),
            valid_until:
              nextCase.milestones.quote_valid_until ||
              new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          };
          nextQuotes = [quote, ...nextQuotes.filter((q) => q.id !== quote.id)];
        }

        setOfflineCases(nextCases);
        setOfflineEvents(nextEvents);
        setOfflineQuotes(nextQuotes);

        return {
          case: nextCase,
          events: nextEvents.filter((event) => event.case_id === id),
          quotes: nextQuotes.filter((quote) => quote.case_id === id),
          crating: null,
        } satisfies CaseSnapshot;
      }

      return apiCaseAction(id, action, payload);
    },
    onMutate: async ({ id, action, payload }) => {
      await queryClient.cancelQueries({ queryKey: CASES_QUERY_KEY });
      const previousCases = queryClient.getQueryData(CASES_QUERY_KEY);
      const previousDetail = detailMap[id] ? { ...detailMap[id] } : null;

      queryClient.setQueryData<{ data: ServiceCase[]; page: number; pageSize: number; total: number }>(
        CASES_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            data: current.data.map((item) => {
              if (item.id !== id) return item;
              return applyAction(item, action, payload);
            }),
          };
        }
      );

      if (previousDetail) {
        setDetailMap((prev) => ({
          ...prev,
          [id]: {
            ...previousDetail,
            case: applyAction(previousDetail.case, action, payload),
          },
        }));
      }

      return { previousCases, previousDetail, id };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previousCases) queryClient.setQueryData(CASES_QUERY_KEY, context.previousCases);
      if (context?.previousDetail) {
        setDetailMap((prev) => ({ ...prev, [context.id]: context.previousDetail }));
      }
      toast.error(error?.body?.error || error?.message || "No se pudo ejecutar la acción.");
    },
    onSuccess: (snapshot) => {
      mergeSnapshot(snapshot);
    },
    onSettled: (_result, _error, vars) => {
      if (FORCE_MOCK_MODE || isFallbackMode) return;
      queryClient.invalidateQueries({ queryKey: CASES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["pipeline", "case", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", "events"] });
    },
  });

  const eventMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Event> }) => {
      if (FORCE_MOCK_MODE || isFallbackMode) {
        const current = offlineEvents.find((event) => event.id === id);
        if (!current) throw new Error("Evento no encontrado en modo local.");
        const nextEvent = { ...current, ...patch };
        setOfflineEvents((prev) => prev.map((event) => (event.id === id ? nextEvent : event)));
        return nextEvent;
      }
      return apiPatchEvent(id, patch);
    },
    onSuccess: () => {
      if (FORCE_MOCK_MODE || isFallbackMode) return;
      queryClient.invalidateQueries({ queryKey: ["pipeline", "events"] });
    },
    onError: (error: any) => {
      toast.error(error?.body?.error || error?.message || "No se pudo actualizar el evento.");
    },
  });

  const cases = useMemo(() => {
    if (FORCE_MOCK_MODE || isFallbackMode) {
      return offlineCases.map((item) => detailMap[item.id]?.case || item);
    }
    const fromList = casesQuery.data?.data || [];
    return fromList.map((item) => detailMap[item.id]?.case || item);
  }, [casesQuery.data?.data, detailMap, isFallbackMode, offlineCases]);

  const events = useMemo(() => {
    if (FORCE_MOCK_MODE || isFallbackMode) {
      const fromDetails = Object.values(detailMap).flatMap((snapshot) => snapshot.events || []);
      return dedupeById([...offlineEvents, ...fromDetails]).sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    }
    const fromList = eventsQuery.data || [];
    const fromDetails = Object.values(detailMap).flatMap((snapshot) => snapshot.events || []);
    return dedupeById([...fromList, ...fromDetails]).sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [eventsQuery.data, detailMap, isFallbackMode, offlineEvents]);

  const quotes = useMemo(() => {
    if (FORCE_MOCK_MODE || isFallbackMode) {
      const fromDetails = Object.values(detailMap).flatMap((snapshot) => snapshot.quotes || []);
      return dedupeById([...offlineQuotes, ...fromDetails]).sort((a, b) => (b.version || 0) - (a.version || 0));
    }
    const fromDetails = Object.values(detailMap).flatMap((snapshot) => snapshot.quotes || []);
    return dedupeById(fromDetails).sort((a, b) => (b.version || 0) - (a.version || 0));
  }, [detailMap, isFallbackMode, offlineQuotes]);

  const value = useMemo<CasesStoreValue>(
    () => ({
      cases,
      events,
      quotes,
      loading: isFallbackMode ? false : casesQuery.isLoading || eventsQuery.isLoading,
      updateCase: (id, patch) => patchMutation.mutate({ id, patch }),
      applyCaseAction: (id, action, payload) => actionMutation.mutate({ id, action, payload }),
      ensureCaseDetail,
      updateEvent: (id, patch) => eventMutation.mutate({ id, patch }),
    }),
    [
      actionMutation,
      cases,
      casesQuery.isLoading,
      ensureCaseDetail,
      eventMutation,
      events,
      eventsQuery.isLoading,
      patchMutation,
      quotes,
      isFallbackMode,
    ]
  );

  return <CasesStoreContext.Provider value={value}>{children}</CasesStoreContext.Provider>;
}

export function useCasesStore() {
  const ctx = useContext(CasesStoreContext);
  if (!ctx) throw new Error("useCasesStore debe usarse dentro de CasesStoreProvider");
  return ctx;
}
