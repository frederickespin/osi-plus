export async function readActiveArticleCatalog(database, tenantId) {
  const catalog = await database.surveyCatalogVersion.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { version: "desc" },
    select: {
      version: true,
      articles: {
        where: { status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
        select: { articleRef: true, code: true, name: true, aliases: true, defaultVolumeM3: true },
      },
    },
  });
  if (!catalog) return null;
  return {
    version: catalog.version,
    articles: catalog.articles.map(({ articleRef, code, name, aliases, defaultVolumeM3 }) => ({
      articleRef,
      code,
      name,
      aliases,
      defaultVolumeM3: defaultVolumeM3 === null ? null : Number(defaultVolumeM3),
    })),
  };
}
