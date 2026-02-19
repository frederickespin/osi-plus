export type TriggerPhase = "PRE_OSI" | "ON_ROUTE" | "POST_OSI";
export type OutputChannel = "WHATSAPP" | "EMAIL" | "BOTH";

export type PicTemplateContent = {
  triggerPhase: TriggerPhase;
  channel: OutputChannel;
  // Rich text intended for WhatsApp/email rendering.
  bodyHtml: string;
  attachments?: Array<{ name: string; url: string }>;
  variables?: string[];
};

export type PgdVisibility = "CLIENT_VIEW" | "INTERNAL_VIEW";
export type PgdResponsible = "CLIENT" | "SUPERVISOR" | "DRIVER";
export type PgdFileType = "PDF" | "PHOTO" | "SIGNATURE" | "OTHER";

export type PgdDocumentItem = {
  name: string;
  visibility: PgdVisibility;
  responsible: PgdResponsible;
  isBlocking: boolean;
  expectedFileType: PgdFileType;
  serviceTags?: string[];
};

export type PgdTemplateContent = {
  // Tags to help auto-suggest templates per service category.
  serviceTags?: string[];
  documents: PgdDocumentItem[];
};

export type NpsScale = "0_10" | "1_5";

export type NpsTemplateContent = {
  question: string;
  scale: NpsScale;
  positiveTags: string[];
  negativeTags: string[];
  evaluateSupervisorD: boolean;
  evaluateOfficeKV: boolean;
  alertThreshold: number; // If score < threshold => alert.
};

export type PstBasePriceMode = "PER_M3" | "PER_KG" | "FLAT_FEE" | "PER_HOUR" | "CUSTOM_FORMULA";

export type PstRequiredInput =
  | "DESTINATION_ADDRESS"
  | "DECLARED_VALUE"
  | "MOVE_DATE"
  | "ORIGIN_ADDRESS"
  | "CONTACT_PHONE"
  | "SERVICE_DAYS"
  | "SPECIAL_HANDLING_NOTES";

export type PstTemplateContent = {
  schemaVersion: 1;
  serviceCode: string;
  serviceName: string;
  basePriceLogic: {
    mode: PstBasePriceMode;
    currency: "RD$" | "USD";
    baseRate: number;
    minimumCharge: number;
  };
  defaultNestingAllowed: boolean;
  linkedPgdTemplateCode?: string;
  marginRules: {
    maxDiscountPctWithoutApproval: number;
    minMarginPct: number;
  };
  requiredInputs: PstRequiredInput[];
  notes?: string;
};

export const PST_BASE_PRICE_MODES: PstBasePriceMode[] = [
  "PER_M3",
  "PER_KG",
  "FLAT_FEE",
  "PER_HOUR",
  "CUSTOM_FORMULA",
];

export const PST_REQUIRED_INPUT_OPTIONS: PstRequiredInput[] = [
  "DESTINATION_ADDRESS",
  "DECLARED_VALUE",
  "MOVE_DATE",
  "ORIGIN_ADDRESS",
  "CONTACT_PHONE",
  "SERVICE_DAYS",
  "SPECIAL_HANDLING_NOTES",
];

export function pstRequiredInputLabel(input: PstRequiredInput): string {
  if (input === "DESTINATION_ADDRESS") return "Dirección destino";
  if (input === "DECLARED_VALUE") return "Valor declarado";
  if (input === "MOVE_DATE") return "Fecha de servicio";
  if (input === "ORIGIN_ADDRESS") return "Dirección origen";
  if (input === "CONTACT_PHONE") return "Teléfono contacto";
  if (input === "SERVICE_DAYS") return "Días de servicio";
  if (input === "SPECIAL_HANDLING_NOTES") return "Notas de manejo especial";
  return input;
}

export function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeTagList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractVariablesFromHtml(html: string): string[] {
  const vars = new Set<string>();
  const re = /\{([A-Za-z0-9_]+)\}/g;
  const text = String(html || "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    vars.add(m[1]);
  }
  return Array.from(vars).sort((a, b) => a.localeCompare(b));
}
