export const PREVIEW_HUB_RETURN_PARAM = "osiPlusHubReturn";

const PREVIEW_HUB_RETURN_STORAGE_KEY = "osi-plus.preview-hub-return";
const VERCEL_PREVIEW_HOST = /^osi-plus-erp-v17-[a-z0-9-]+-frederick-espinals-projects\.vercel\.app$/;

function trustedPreviewHubUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const candidate = new URL(value);
    const localPreview = ["localhost", "127.0.0.1"].includes(candidate.hostname)
      && ["http:", "https:"].includes(candidate.protocol);
    if ((!localPreview && candidate.protocol !== "https:") || candidate.username || candidate.password) return null;
    if (!localPreview && !VERCEL_PREVIEW_HOST.test(candidate.hostname)) return null;
    if (candidate.pathname !== "/experience-preview/tools") return null;
    candidate.search = "";
    candidate.hash = "";
    return candidate.toString();
  } catch {
    return null;
  }
}

export function withPreviewHubReturn(destination: string, hubUrl: string) {
  const trustedHubUrl = trustedPreviewHubUrl(hubUrl);
  if (!trustedHubUrl) return destination;
  const target = new URL(destination);
  target.searchParams.set(PREVIEW_HUB_RETURN_PARAM, trustedHubUrl);
  return target.toString();
}

export function rememberPreviewHubReturn(search = globalThis.location?.search ?? "") {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  const requested = trustedPreviewHubUrl(new URLSearchParams(search).get(PREVIEW_HUB_RETURN_PARAM));
  if (requested) globalThis.sessionStorage.setItem(PREVIEW_HUB_RETURN_STORAGE_KEY, requested);
  return requested;
}

export function redirectToPreviewHub(nextPath: string) {
  if (nextPath !== "/hub" || typeof globalThis.sessionStorage === "undefined") return false;
  const target = trustedPreviewHubUrl(globalThis.sessionStorage.getItem(PREVIEW_HUB_RETURN_STORAGE_KEY));
  if (!target) return false;
  globalThis.sessionStorage.removeItem(PREVIEW_HUB_RETURN_STORAGE_KEY);
  globalThis.location.assign(target);
  return true;
}
