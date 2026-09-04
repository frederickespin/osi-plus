export function isCanonicalLegacyPassword(value) {
  return typeof value === "string"
    && value.length >= 14
    && value.length <= 128
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}
