const TOKEN = /^ui1\.[A-Za-z0-9_-]{43}$/u;

export function readAdminUserIdentityActivationToken() {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const token = parameters.get("token");
  return parameters.size === 1 && token && TOKEN.test(token) ? token : "";
}

export function clearAdminUserIdentityActivationToken() {
  window.history.replaceState(window.history.state, "", "/activate-user");
}

export function isAdminUserIdentityActivationRoute() {
  return window.location.pathname === "/activate-user";
}
