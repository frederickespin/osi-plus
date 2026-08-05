import { Mt01bAuthError } from "./authPolicy.js";

export const MT01B_REFRESH_COOKIE = "__Host-osi_refresh";

function appendSetCookie(res, value) {
  const current = res.getHeader?.("Set-Cookie");
  const values = current == null ? [] : Array.isArray(current) ? current : [current];
  res.setHeader("Set-Cookie", [...values, value]);
}

export function refreshCookieValue(token, maxAgeSeconds) {
  if (!token || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Mt01bAuthError("No se pudo construir la cookie de sesión.", {
      code: "MT01B_COOKIE_INVALID",
      status: 500,
    });
  }
  return `${MT01B_REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedRefreshCookieValue() {
  return `${MT01B_REFRESH_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

export function setRefreshCookie(res, token, maxAgeSeconds) {
  appendSetCookie(res, refreshCookieValue(token, maxAgeSeconds));
}

export function clearRefreshCookie(res) {
  appendSetCookie(res, clearedRefreshCookieValue());
}

export function readRefreshCookie(req) {
  const raw = String(req?.headers?.cookie || "");
  for (const item of raw.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() !== MT01B_REFRESH_COOKIE) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
