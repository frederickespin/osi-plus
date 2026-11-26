function positive(value) {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function planVolume(preference, surveyVolume, estimatedVolume) {
  const quick = preference?.quickQuote;
  const direct = preference?.directQuote;
  const manual = positive(quick?.volumeM3);
  if (manual !== null && (quick?.volumeSource === "MANUAL" || (!quick?.volumeSource && !direct))) {
    return { amount: manual, source: "MANUAL" };
  }
  const survey = positive(surveyVolume);
  if (survey !== null) return { amount: Number(survey.toFixed(6)), source: "SURVEY" };
  if (direct) return { amount: positive(direct.volumeM3), source: "CLIENT" };
  return { amount: positive(estimatedVolume), source: "CASE" };
}
