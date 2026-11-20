export const ROAD_TRANSPORT_KINDS = Object.freeze(["BASE", "FUEL", "TOLL", "OTHER"]);

export function isRoadTransportComponent(component) {
  return ROAD_TRANSPORT_KINDS.includes(component.kind) && component.basis !== "PERSON_DAY";
}

export function includesPersonnelCosts(component, baseIncludes = []) {
  return (component.includedConcepts ?? []).some((kind) => !ROAD_TRANSPORT_KINDS.includes(kind))
    || component.kind === "BASE" && baseIncludes.some((kind) => !ROAD_TRANSPORT_KINDS.includes(kind));
}
