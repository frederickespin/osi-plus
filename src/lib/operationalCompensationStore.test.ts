import { describe, expect, it } from "vitest";

import {
  createDefaultOperationalCompensationStore,
  normalizeOperationalCompensationStore,
  resolveOperationalClientChargeRule,
} from "@/lib/operationalCompensationStore";

describe("operationalCompensationStore", () => {
  it("define Stair Carry como una tarifa por piso", () => {
    const store = createDefaultOperationalCompensationStore();
    const stairCarry = store.rules.find((rule) => rule.id === "skill-heavy-stairs");

    expect(stairCarry).toMatchObject({
      name: "Stair Carry — tarifa por piso",
      unit: "FLOOR",
      family: "PAYABLE_COMPETENCY",
      group: "TECHNICAL_COMPETENCY",
    });
  });

  it("migra configuraciones anteriores sin alterar el monto guardado", () => {
    const previous = createDefaultOperationalCompensationStore();
    previous.version = 2;
    previous.rules = previous.rules.map((rule) =>
      rule.id === "skill-heavy-stairs"
        ? {
            ...rule,
            name: "Bajada articulos pesados por escalera",
            unit: "EVENT",
            baseAmount: 85,
          }
        : rule,
    );

    const migrated = normalizeOperationalCompensationStore(previous);
    const stairCarry = migrated.rules.find((rule) => rule.id === "skill-heavy-stairs");

    expect(migrated.version).toBe(4);
    expect(stairCarry).toMatchObject({
      name: "Stair Carry — tarifa por piso",
      unit: "FLOOR",
      baseAmount: 85,
    });
  });

  it("clasifica el tratamiento del cliente sin mezclarlo con la remuneración", () => {
    const previous = createDefaultOperationalCompensationStore();
    previous.version = 3;
    previous.rules = previous.rules.map((rule) =>
      rule.id === "skill-heavy-stairs"
        ? {
            ...rule,
            clientBillingMode: undefined as never,
            taxableToClient: true,
          }
        : rule,
    );

    const migrated = normalizeOperationalCompensationStore(previous);
    const stairCarry = migrated.rules.find((rule) => rule.id === "skill-heavy-stairs");
    const diet = migrated.rules.find((rule) => rule.family === "OPERATIONAL_ASSIGNMENT");

    expect(stairCarry?.clientBillingMode).toBe("EXTRA");
    expect(diet?.clientBillingMode).toBe("NOT_APPLICABLE");
  });

  it("recupera la tarifa por piso de elevador configurada en Motor Logístico", () => {
    const store = createDefaultOperationalCompensationStore();
    store.rules.push({
      ...store.rules.find((rule) => rule.id === "skill-heavy-stairs")!,
      id: "elevator-floor-charge",
      code: "USO_ELEVADOR",
      name: "Uso de elevador — tarifa por piso",
      baseAmount: 125,
    });

    const resolved = resolveOperationalClientChargeRule(store, [
      "ELEVATOR_CARRY",
      "USO_ELEVADOR",
    ]);

    expect(resolved?.rule.id).toBe("elevator-floor-charge");
    expect(resolved?.rate).toBe(125);
  });
});
