import { useCallback, useEffect, useState } from "react";
import { getOsis, getProjects, type ApiListResponse, type OsiDto, type ProjectDto } from "@/lib/api";
import type { OSI, OpsProject } from "@/types/osi.types";
import { loadOsi, saveOsi } from "@/lib/hrNotaStorage";
import { mergeOsisPreservingNota, mapProjectsFromApi } from "@/lib/opsSync";

export function useOpsOsis() {
  const [osis, setOsis] = useState<OSI[]>(() => loadOsi());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ApiListResponse<OsiDto> = await getOsis();
      if (Array.isArray(res.data) && res.data.length) {
        const merged = mergeOsisPreservingNota(loadOsi(), res.data);
        setOsis(merged);
        saveOsi(merged);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { osis, setOsis, reload, loading, error };
}

export function useOpsProjects() {
  const [projects, setProjects] = useState<OpsProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ApiListResponse<ProjectDto> = await getProjects();
      if (Array.isArray(res.data)) {
        setProjects(mapProjectsFromApi(res.data));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { projects, reload, loading, error };
}
