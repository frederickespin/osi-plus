import { CommercialTenancyError, commercialDatabaseUnavailable } from "./commercialTenancyWrite.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return fallback;
  return Math.min(Number(text), maximum);
}

export function commercialPagination(query = {}) {
  const page = positiveInteger(query.page, 1, 1_000_000);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return Object.freeze({ page, pageSize, skip: (page - 1) * pageSize });
}

function searchWhere(query, fields) {
  const needle = String(query || "").trim();
  if (!needle) return {};
  return {
    OR: fields.map((field) => ({ [field]: { contains: needle, mode: "insensitive" } })),
  };
}

export async function listTenantClients(prisma, { tenantId, query, page, pageSize, skip }) {
  const where = {
    tenantId: String(tenantId),
    ...searchWhere(query, ["name", "code"]),
  };
  try {
    const [total, data] = await prisma.$transaction([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take: pageSize,
        omit: { tenantId: true },
      }),
    ]);
    return Object.freeze({ total, data: Object.freeze(data), page, pageSize });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}

function projectTenantWhere(tenantId, query = "") {
  return {
    tenantId: String(tenantId),
    tenantClient: { is: { tenantId: String(tenantId) } },
    ...searchWhere(query, ["name", "code"]),
  };
}

export async function listTenantProjects(prisma, { tenantId, query, page, pageSize, skip }) {
  const where = projectTenantWhere(tenantId, query);
  try {
    const [total, data] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: [{ startDate: "desc" }, { id: "asc" }],
        skip,
        take: pageSize,
        omit: { tenantId: true },
      }),
    ]);
    return Object.freeze({ total, data: Object.freeze(data), page, pageSize });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function listTenantDashboardProjects(prisma, { tenantId, take = 50, include }) {
  try {
    return await prisma.project.findMany({
      where: projectTenantWhere(tenantId),
      orderBy: [{ startDate: "desc" }, { id: "asc" }],
      take: Math.min(positiveInteger(take, 50), MAX_PAGE_SIZE),
      omit: { tenantId: true },
      include,
    });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function findTenantProject(prisma, { tenantId, projectId, include }) {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: String(projectId || ""),
        ...projectTenantWhere(tenantId),
      },
      omit: { tenantId: true },
      include,
    });
    if (!project) throw new CommercialTenancyError("COMMERCIAL_RESOURCE_NOT_FOUND", 404);
    return project;
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function transitionTenantProject(prisma, {
  tenantId,
  projectId,
  expectedUpdatedAt,
  expectedKState,
  data,
}) {
  try {
    const result = await prisma.project.updateMany({
      where: {
        id: String(projectId || ""),
        tenantId: String(tenantId),
        updatedAt: expectedUpdatedAt,
        kState: expectedKState,
        tenantClient: { is: { tenantId: String(tenantId) } },
      },
      data,
    });
    if (result.count !== 1) {
      const exists = await prisma.project.count({
        where: { id: String(projectId || ""), tenantId: String(tenantId) },
      });
      throw new CommercialTenancyError(
        exists === 1 ? "COMMERCIAL_PROJECT_CONCURRENT_MODIFICATION" : "COMMERCIAL_RESOURCE_NOT_FOUND",
        exists === 1 ? 409 : 404,
      );
    }
    return await prisma.project.findFirst({
      where: { id: String(projectId || ""), tenantId: String(tenantId) },
      omit: { tenantId: true },
    });
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function listTenantPipelineCases(prisma, { tenantId, page, pageSize, skip }) {
  const where = { tenantId: String(tenantId) };
  try {
    const [total, data] = await prisma.$transaction([
      prisma.pipelineCase.count({ where }),
      prisma.pipelineCase.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip,
        take: pageSize,
        omit: { tenantId: true, ownerMembershipId: true, ownerUserId: true },
      }),
    ]);
    return Object.freeze({ total, data: Object.freeze(data), page, pageSize });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function listTenantLeads(prisma, { tenantId, page, pageSize, skip }) {
  const where = { tenantId: String(tenantId) };
  try {
    const [total, data] = await prisma.$transaction([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip,
        take: pageSize,
        omit: { tenantId: true },
      }),
    ]);
    return Object.freeze({ total, data: Object.freeze(data), page, pageSize });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}
