import { CommercialTenancyError, commercialDatabaseUnavailable } from "./commercialTenancyWrite.js";
import {
  CRM_PIPELINE_READ_MODES,
  requireCrmPipelineRead,
  resolveCrmPipelineModes,
} from "./crmPipelineAccess.js";
import { PERMS } from "./rbac.js";

export const CRM_PIPELINE_RUNTIME_MODES = CRM_PIPELINE_READ_MODES;

export const CRM_PIPELINE_PERMISSION = PERMS.PIPELINE_VIEW;

const PIPELINE_STATUSES = Object.freeze([
  "NEW_INBOX",
  "AWAITING_ICP",
  "GOVERNANCE_CONFIRMED",
  "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING",
  "SURVEY_SCHEDULED",
  "SURVEY_COMPLETED",
  "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS",
  "QUOTE_DRAFT",
  "INTERNAL_REVIEW",
  "QUOTE_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "CHANGE_CONTROL",
  "APPROVED",
  "OPS_HANDOFF",
]);
const PIPELINE_MODES = Object.freeze(["LOCAL", "EXPORT", "IMPORT"]);
const LIST_QUERY_FIELDS = Object.freeze(new Set([
  "page",
  "pageSize",
  "status",
  "mode",
  "serviceType",
  "q",
  "unassigned",
]));
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const OWNER_SELECT = Object.freeze({
  role: true,
  status: true,
  user: { select: { name: true } },
});

const CASE_SELECT = Object.freeze({
  id: true,
  caseCode: true,
  clientName: true,
  mode: true,
  serviceType: true,
  customerType: true,
  status: true,
  estimatedCbm: true,
  requiresSurvey: true,
  surveyMethod: true,
  originLocation: true,
  destinationLocation: true,
  destinationContracted: true,
  assetsCount: true,
  createdAt: true,
  updatedAt: true,
  enterpriseOwner: { select: OWNER_SELECT },
  _count: { select: { quotes: true, events: true } },
});

function invalid(code = "CRM_PIPELINE_FILTER_INVALID", status = 400) {
  throw new CommercialTenancyError(code, status);
}

function scalar(value, name) {
  if (Array.isArray(value) || (value !== undefined && typeof value !== "string" && typeof value !== "number")) {
    invalid("CRM_PIPELINE_FILTER_INVALID");
  }
  const text = value === undefined ? "" : String(value);
  if (text !== text.trim()) invalid("CRM_PIPELINE_FILTER_INVALID");
  if (/\u0000/.test(text)) invalid("CRM_PIPELINE_FILTER_INVALID");
  return text;
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const text = scalar(value);
  if (!/^[1-9]\d*$/.test(text)) invalid();
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) invalid();
  return parsed;
}

function strictOptional(value, allowed) {
  if (value === undefined) return undefined;
  const text = scalar(value);
  if (!allowed.includes(text)) invalid();
  return text;
}

function boundedOptional(value, maximum) {
  if (value === undefined) return undefined;
  const text = scalar(value);
  if (!text || text.length > maximum) invalid();
  return text;
}

function exactBoolean(value) {
  if (value === undefined) return undefined;
  const text = scalar(value);
  if (text === "true") return true;
  if (text === "false") return false;
  invalid();
}

export function resolveCrmPipelineRuntimeMode(env = process.env) {
  return resolveCrmPipelineModes(env).readMode;
}

export function requireCrmPipelineReadOnly(env = process.env) {
  return requireCrmPipelineRead(env);
}

export function parsePipelineListQuery(query = {}) {
  const keys = Object.keys(query);
  if (keys.some((key) => !LIST_QUERY_FIELDS.has(key))) invalid();
  const page = positiveInteger(query.page, 1, 1_000_000);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const status = strictOptional(query.status, PIPELINE_STATUSES);
  const mode = strictOptional(query.mode, PIPELINE_MODES);
  const serviceType = boundedOptional(query.serviceType, 80);
  const search = boundedOptional(query.q, 100);
  const unassigned = exactBoolean(query.unassigned);
  return Object.freeze({
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    status,
    mode,
    serviceType,
    search,
    unassigned,
  });
}

function pipelineWhere(tenantId, filters = {}) {
  const where = { tenantId: String(tenantId) };
  if (filters.status) where.status = filters.status;
  if (filters.mode) where.mode = filters.mode;
  if (filters.serviceType) where.serviceType = filters.serviceType;
  if (filters.unassigned === true) {
    where.ownerMembershipId = null;
    where.ownerUserId = null;
  } else if (filters.unassigned === false) {
    where.ownerMembershipId = { not: null };
    where.ownerUserId = { not: null };
  }
  if (filters.search) {
    where.OR = [
      { caseCode: { contains: filters.search, mode: "insensitive" } },
      { clientName: { contains: filters.search, mode: "insensitive" } },
      { originLocation: { contains: filters.search, mode: "insensitive" } },
      { destinationLocation: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  return where;
}

function safeOwner(owner) {
  if (!owner) return null;
  return Object.freeze({
    displayName: String(owner.user?.name || ""),
    role: String(owner.role),
    membershipStatus: String(owner.status),
  });
}

function safeCase(row) {
  return Object.freeze({
    id: row.id,
    caseCode: row.caseCode,
    clientName: row.clientName,
    mode: row.mode,
    serviceType: row.serviceType,
    customerType: row.customerType,
    status: row.status,
    estimatedCbm: row.estimatedCbm,
    requiresSurvey: row.requiresSurvey,
    surveyMethod: row.surveyMethod,
    originLocation: row.originLocation,
    destinationLocation: row.destinationLocation,
    destinationContracted: row.destinationContracted,
    assetsCount: row.assetsCount,
    owner: safeOwner(row.enterpriseOwner),
    quoteCount: Number(row._count?.quotes || 0),
    eventCount: Number(row._count?.events || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function listCrmPipelineCases(prisma, { tenantId, filters }) {
  const where = pipelineWhere(tenantId, filters);
  try {
    const [total, rows] = await prisma.$transaction([
      prisma.pipelineCase.count({ where }),
      prisma.pipelineCase.findMany({
        where,
        select: CASE_SELECT,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: filters.skip,
        take: filters.pageSize,
      }),
    ]);
    return Object.freeze({
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      data: Object.freeze(rows.map(safeCase)),
    });
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function findCrmPipelineCase(prisma, { tenantId, caseId }) {
  const id = boundedOptional(caseId, 128);
  if (!id) invalid("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  try {
    const row = await prisma.pipelineCase.findFirst({
      where: { id, tenantId: String(tenantId) },
      select: CASE_SELECT,
    });
    if (!row) invalid("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
    return safeCase(row);
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    throw commercialDatabaseUnavailable(cause);
  }
}

export async function summarizeCrmPipelineCases(prisma, { tenantId }) {
  const where = { tenantId: String(tenantId) };
  try {
    const [groups, assigned, unassigned] = await prisma.$transaction([
      prisma.pipelineCase.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        orderBy: { status: "asc" },
      }),
      prisma.pipelineCase.count({
        where: { ...where, ownerMembershipId: { not: null }, ownerUserId: { not: null } },
      }),
      prisma.pipelineCase.count({
        where: { ...where, ownerMembershipId: null, ownerUserId: null },
      }),
    ]);
    const byStatus = Object.fromEntries(PIPELINE_STATUSES.map((status) => [status, 0]));
    for (const group of groups) byStatus[group.status] = Number(group._count?._all || 0);
    return Object.freeze({
      total: assigned + unassigned,
      assigned,
      unassigned,
      byStatus: Object.freeze(byStatus),
      sla: Object.freeze({ overdue: null, basis: "UNAVAILABLE" }),
    });
  } catch (cause) {
    throw commercialDatabaseUnavailable(cause);
  }
}

export const CRM_PIPELINE_STATUS_VALUES = PIPELINE_STATUSES;
export const CRM_PIPELINE_MODE_VALUES = PIPELINE_MODES;
export const CRM_PIPELINE_LIST_QUERY_FIELDS = LIST_QUERY_FIELDS;
