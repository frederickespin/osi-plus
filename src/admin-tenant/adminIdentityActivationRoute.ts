export function consumeAdminIdentityActivationToken() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token") || "";
  window.history.replaceState({}, "", "/activate-admin");
  return token;
}

export function isAdminIdentityActivationRoute() {
  return window.location.pathname === "/activate-admin";
}
