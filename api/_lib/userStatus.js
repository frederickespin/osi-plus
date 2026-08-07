export function normalizeUserStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isGloballyActiveUser(value) {
  return normalizeUserStatus(value) === "active";
}
