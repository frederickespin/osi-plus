export function readAdminIdentityActivationToken() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("token") || "";
}

export function clearAdminIdentityActivationToken() {
  window.history.replaceState({}, "", "/activate-admin");
}

export function isAdminIdentityActivationRoute() {
  return window.location.pathname === "/activate-admin";
}
