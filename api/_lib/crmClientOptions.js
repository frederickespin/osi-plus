import { CommercialTenancyError, commercialDatabaseUnavailable } from "./commercialTenancyWrite.js";

const FIELDS = new Set(["page", "pageSize", "q"]);

function invalid() { throw new CommercialTenancyError("CRM_CLIENT_FILTER_INVALID", 400); }
function positive(value, fallback, max) {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || typeof value !== "string" || !/^[1-9]\d*$/.test(value)) invalid();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > max) invalid();
  return result;
}
export function parseCrmClientOptionsQuery(query = {}) {
  if (Object.keys(query).some((key) => !FIELDS.has(key))) invalid();
  const page = positive(query.page, 1, 1_000_000);
  const pageSize = positive(query.pageSize, 20, 50);
  let search;
  if (query.q !== undefined) {
    if (Array.isArray(query.q) || typeof query.q !== "string" || !query.q || query.q.length > 100
      || query.q !== query.q.trim() || /[\u0000-\u001f\u007f\ufeff]/u.test(query.q)) invalid();
    search = query.q;
  }
  return Object.freeze({ page, pageSize, skip: (page - 1) * pageSize, search });
}
export async function listCrmClientOptions(prisma, { tenantId, filters }) {
  const where = {
    tenantId: String(tenantId),
    ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
  };
  try {
    const [total, rows] = await prisma.$transaction([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        select: { publicRef: true, name: true, type: true, status: true },
        orderBy: [{ name: "asc" }, { publicRef: "asc" }],
        skip: filters.skip,
        take: filters.pageSize,
      }),
    ]);
    return Object.freeze({
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      data: Object.freeze(rows.map((row) => Object.freeze({
        clientRef: row.publicRef,
        displayName: row.name,
        type: row.type || null,
        status: row.status,
      }))),
    });
  } catch (error) {
    if (error instanceof CommercialTenancyError) throw error;
    throw commercialDatabaseUnavailable(error);
  }
}
