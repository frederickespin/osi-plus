const KEY = "osi-plus.sequences";

type SeqMap = Record<string, number>;

function load(): SeqMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function save(m: SeqMap) {
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function nextNumber(seqKey: string, prefix: string, pad = 4) {
  const m = load();
  const n = (m[seqKey] ?? 0) + 1;
  m[seqKey] = n;
  save(m);
  return `${prefix}${String(n).padStart(pad, "0")}`;
}
