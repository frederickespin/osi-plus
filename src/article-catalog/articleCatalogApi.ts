import { buildSurveyCommand, requestSurveyJson } from "@/survey/api";
import type { SurveyCatalog } from "@/survey/types";

export type ArticleCatalogEntry = Readonly<{
  code: string;
  name: string;
  aliases: readonly string[];
  defaultVolumeM3: number | null;
}>;

export type ArticleCatalogRevision = Readonly<{
  version: number;
  articles: readonly ArticleCatalogEntry[];
  areas: SurveyCatalog["areas"];
  conditions: SurveyCatalog["conditions"];
  frequentAreaRefsByCode: ReadonlyMap<string, readonly string[]>;
}>;

type CatalogPublication = {
  catalogRef: string;
  version: number;
  replayed: boolean;
};

const CATALOG_URL = "/api/crm/survey/catalog";
const INITIAL_AREAS = [{ code: "GENERAL", name: "General" }] as const;

export function createArticleCatalogApi(authorization?: string) {
  let lastPublication: { payload: string; requestId: string } | null = null;

  return Object.freeze({
    catalog: async (signal?: AbortSignal): Promise<ArticleCatalogRevision | null> => {
      try {
        const { version, articles, areas, conditions } = await requestSurveyJson<SurveyCatalog>(authorization, CATALOG_URL, { signal });
        return {
          version,
          articles: articles.map(({ code, name, aliases, defaultVolumeM3 }) => ({ code, name, aliases, defaultVolumeM3 })),
          areas,
          conditions,
          frequentAreaRefsByCode: new Map(articles.map(({ code, frequentAreaRefs }) => [code, frequentAreaRefs])),
        };
      } catch (error) {
        if (
          error instanceof Error && error.message === "CRM_SURVEY_CATALOG_NOT_READY" &&
          "status" in error && error.status === 409
        ) return null;
        throw error;
      }
    },
    publish: async (catalog: ArticleCatalogRevision | null, articles: readonly ArticleCatalogEntry[]) => {
      const areaCodes = new Map(catalog?.areas.map(({ areaRef, code }) => [areaRef, code]));
      const payload = {
        expectedLatestVersion: catalog?.version ?? 0,
        articles: articles.map((article) => ({
          code: article.code,
          name: article.name,
          aliases: [...article.aliases],
          frequentAreaCodes: (catalog?.frequentAreaRefsByCode.get(article.code) ?? []).map((ref) => {
            const code = areaCodes.get(ref);
            if (!code) throw new Error("CRM_SURVEY_ARTICLE_AREA_UNKNOWN");
            return code;
          }),
          defaultVolumeM3: article.defaultVolumeM3,
          // Keep the legacy request shape. Service tariffs derive weight from volume.
          defaultWeightKg: null,
        })),
        areas: catalog?.areas.map(({ code, name }) => ({ code, name })) ?? INITIAL_AREAS,
        conditions: catalog?.conditions.map(({ code, name, kind }) => ({ code, name, kind })) ?? [],
      };
      const payloadKey = JSON.stringify(payload);
      if (lastPublication?.payload !== payloadKey) {
        // The same payload and version can be retried after an uncertain network response.
        lastPublication = { payload: payloadKey, requestId: crypto.randomUUID() };
      }
      const command = await buildSurveyCommand("CATALOG_CREATE", payload, lastPublication.requestId);
      return requestSurveyJson<CatalogPublication>(authorization, CATALOG_URL, {
        method: "POST",
        body: JSON.stringify(command),
      });
    },
  });
}
