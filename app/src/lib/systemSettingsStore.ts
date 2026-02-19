export type MainCurrencyCode = "DOP" | "USD";

export type SystemSettings = {
  companyName: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  currency: MainCurrencyCode;
  language: string;
  dateFormat: string;
  notifications: boolean;
  emailAlerts: boolean;
  dailySummary: boolean;
  sessionTimeout: number;
  failedLoginAttempts: number;
  twoFactor: boolean;
  activityLog: boolean;
  primaryColor: string;
};

const KEY = "osi-plus.system-settings";

const DEFAULT_SETTINGS: SystemSettings = {
  companyName: "International Packers SRL",
  email: "admin@ipackers.com",
  phone: "+591 2100000",
  address: "Av. Principal #123, La Paz, Bolivia",
  timezone: "America/La_Paz (GMT-4)",
  currency: "DOP",
  language: "es",
  dateFormat: "DD/MM/YYYY",
  notifications: true,
  emailAlerts: true,
  dailySummary: false,
  sessionTimeout: 30,
  failedLoginAttempts: 3,
  twoFactor: false,
  activityLog: true,
  primaryColor: "#003366",
};

const CURRENCY_SYMBOLS: Record<MainCurrencyCode, string> = {
  DOP: "RD$",
  USD: "US$",
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeCurrency(raw: unknown): MainCurrencyCode {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (value === "USD" || value === "$" || value === "US$") return "USD";
  return "DOP";
}

export function getDefaultSystemSettings(): SystemSettings {
  return { ...DEFAULT_SETTINGS };
}

export function loadSystemSettings(): SystemSettings {
  if (typeof window === "undefined") return getDefaultSystemSettings();
  const parsed = safeParse<Partial<SystemSettings>>(window.localStorage.getItem(KEY), {});
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    currency: normalizeCurrency(parsed.currency),
  };
}

export function saveSystemSettings(input: SystemSettings): SystemSettings {
  const next: SystemSettings = {
    ...DEFAULT_SETTINGS,
    ...input,
    currency: normalizeCurrency(input.currency),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("osi:system-settings:changed", { detail: next }));
  }
  return next;
}

export function getCurrencySymbolByCode(code: MainCurrencyCode): string {
  return CURRENCY_SYMBOLS[code] ?? CURRENCY_SYMBOLS.DOP;
}

export function getMainCurrencyCode(): MainCurrencyCode {
  return loadSystemSettings().currency;
}

export function getMainCurrencySymbol(): string {
  return getCurrencySymbolByCode(getMainCurrencyCode());
}

