export type CatalogArticle = Readonly<{
  articleRef: string;
  code: string;
  name: string;
  aliases: readonly string[];
  defaultVolumeM3: number | null;
}>;

export type ActiveArticleCatalog = Readonly<{
  version: number;
  articles: readonly CatalogArticle[];
}>;
