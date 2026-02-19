const PST_PRICE_MODES = new Set(["PER_M3", "PER_KG", "FLAT_FEE", "PER_HOUR", "CUSTOM_FORMULA"]);
const PST_REQUIRED_INPUTS = new Set([
  "DESTINATION_ADDRESS",
  "DECLARED_VALUE",
  "MOVE_DATE",
  "ORIGIN_ADDRESS",
  "CONTACT_PHONE",
  "SERVICE_DAYS",
  "SPECIAL_HANDLING_NOTES",
]);

function toJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || "").trim();
}

export async function validateAndNormalizePstContent({ prisma, templateId, contentJson }) {
  const raw = toJsonObject(contentJson);

  const serviceCode = normalizeString(raw.serviceCode).toUpperCase();
  const serviceName = normalizeString(raw.serviceName);
  const basePriceLogic = raw.basePriceLogic && typeof raw.basePriceLogic === "object" ? raw.basePriceLogic : {};
  const marginRules = raw.marginRules && typeof raw.marginRules === "object" ? raw.marginRules : {};
  const linkedPgdTemplateCode = normalizeString(raw.linkedPgdTemplateCode);

  const mode = normalizeString(basePriceLogic.mode).toUpperCase();
  const currency = normalizeString(basePriceLogic.currency).toUpperCase() || "RD$";
  const baseRate = asNumber(basePriceLogic.baseRate);
  const minimumCharge = asNumber(basePriceLogic.minimumCharge);
  const defaultNestingAllowed = Boolean(raw.defaultNestingAllowed);
  const maxDiscountPctWithoutApproval = asNumber(marginRules.maxDiscountPctWithoutApproval);
  const minMarginPct = asNumber(marginRules.minMarginPct);
  const notes = normalizeString(raw.notes);

  const requiredInputs = Array.isArray(raw.requiredInputs)
    ? Array.from(
        new Set(
          raw.requiredInputs
            .map((x) => normalizeString(x).toUpperCase())
            .filter((x) => x && PST_REQUIRED_INPUTS.has(x)),
        ),
      )
    : [];

  const errors = [];
  if (!serviceCode) errors.push("serviceCode es obligatorio.");
  if (serviceCode && !/^[A-Z0-9._-]{3,40}$/.test(serviceCode)) {
    errors.push("serviceCode solo permite A-Z, 0-9, ., _ y - (3-40 chars).");
  }
  if (!serviceName) errors.push("serviceName es obligatorio.");
  if (!PST_PRICE_MODES.has(mode)) errors.push("basePriceLogic.mode inválido.");
  if (currency !== "RD$" && currency !== "USD") errors.push("basePriceLogic.currency debe ser RD$ o USD.");
  if (baseRate < 0) errors.push("basePriceLogic.baseRate no puede ser negativo.");
  if (minimumCharge < 0) errors.push("basePriceLogic.minimumCharge no puede ser negativo.");
  if (maxDiscountPctWithoutApproval < 0 || maxDiscountPctWithoutApproval > 30) {
    errors.push("marginRules.maxDiscountPctWithoutApproval debe estar entre 0 y 30.");
  }
  if (minMarginPct < 0 || minMarginPct > 100) {
    errors.push("marginRules.minMarginPct debe estar entre 0 y 100.");
  }
  if (requiredInputs.length === 0) errors.push("requiredInputs debe tener al menos un campo.");

  if (serviceCode) {
    const others = await prisma.template.findMany({
      where: {
        type: "PST",
        ...(templateId ? { id: { not: templateId } } : {}),
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    const collision = others.some((t) => {
      const latest = t.versions?.[0];
      const latestCode = normalizeString(latest?.contentJson?.serviceCode).toUpperCase();
      return latestCode === serviceCode;
    });

    if (collision) errors.push(`Ya existe otro PST con serviceCode ${serviceCode}.`);
  }

  if (linkedPgdTemplateCode) {
    const linked = await prisma.template.findFirst({
      where: {
        type: "PGD",
        isActive: true,
        name: linkedPgdTemplateCode,
      },
      include: { publishedVersion: true },
    });

    if (!linked || !linked.publishedVersion || linked.publishedVersion.status !== "PUBLISHED") {
      errors.push(`linkedPgdTemplateCode ${linkedPgdTemplateCode} no existe o no está ACTIVE.`);
    }
  }

  const normalized = {
    schemaVersion: 1,
    serviceCode,
    serviceName,
    basePriceLogic: {
      mode,
      currency,
      baseRate,
      minimumCharge,
    },
    defaultNestingAllowed,
    linkedPgdTemplateCode: linkedPgdTemplateCode || undefined,
    marginRules: {
      maxDiscountPctWithoutApproval,
      minMarginPct,
    },
    requiredInputs,
    notes: notes || undefined,
  };

  return {
    ok: errors.length === 0,
    errors,
    normalized,
  };
}
