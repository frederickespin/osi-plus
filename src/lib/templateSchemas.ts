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

