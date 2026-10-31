// A zero quantity documents a non-incurred expense internally (for example no
// toll passes). It is not a commercial line. A positive quantity priced at zero
// remains eligible, preserving an explicitly free service.
export function eligibleCostingLines(lines) {
  return lines.filter((line) => line.lineRef && line.suggestedPrice != null
    && typeof line.quantity === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(line.quantity)
    && /[1-9]/.test(line.quantity));
}
