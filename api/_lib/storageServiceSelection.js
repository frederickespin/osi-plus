const STORAGE_CODES = new Set(["STORAGE", "ALMACENAJE"]);

export function isStorageServiceItem(item) {
  return Boolean(item && (item.categorySnapshot === "STORAGE" || item.category === "STORAGE"
    || STORAGE_CODES.has(item.codeSnapshot) || STORAGE_CODES.has(item.code)));
}

export function storageServiceItem(revision) {
  return revision?.items?.find(isStorageServiceItem) ?? null;
}

export function hasStorageService(revision) {
  return Boolean(storageServiceItem(revision));
}
