import assert from "node:assert/strict";
import { calculateQuoteTotals } from "../api/_lib/quoteContract.js";
import { __quoteChangeOrderInternals } from "../api/_lib/quoteChangeOrder.js";

let assertions = 0;

const operational = calculateQuoteTotals([
  { priceStatus: "CONFIRMED", capturedCost: "500", suggestedPrice: "1000", quotedPrice: "0", economicClass: "PR" },
], null);
assert.equal(operational.regularPrice, 1000); assertions += 1;
assert.equal(operational.payablePrice, 0); assertions += 1;
assert.equal(operational.foregoneRevenue, 1000); assertions += 1;

assert.throws(() => __quoteChangeOrderInternals.normalizeItems([{
  changeKind: "ADDED", lineKey: "AD-1", description: "Servicio operativo adicional",
  previousLineTotal: "0", newLineTotal: "0",
}]), /indicar su valor regular/); assertions += 1;

const waivedItems = __quoteChangeOrderInternals.normalizeItems([{
  changeKind: "ADDED", lineKey: "AD-2", description: "Servicio operativo adicional",
  previousLineTotal: "0", newLineTotal: "0", regularLineTotal: "750",
  waiverReason: "Cortesía solicitada; pendiente de Administración",
}]);
assert.deepEqual(waivedItems[0].after.billing, {
  regularLineTotal: "750.00", payableLineTotal: "0.00", waivedAmount: "750.00",
  waiverReason: "Cortesía solicitada; pendiente de Administración",
}); assertions += 1;

const money = __quoteChangeOrderInternals.monetarySummary(waivedItems, {
  previousSubtotal: "1000", previousTotal: "1000", taxAmount: "0",
});
assert.equal(money.newTotal.toFixed(2), "1000.00"); assertions += 1;
assert.equal(money.foregoneRevenue.toFixed(2), "750.00"); assertions += 1;

assert.throws(() => __quoteChangeOrderInternals.assertAdministrativeWaiverAuthority(
  { role: "V" }, { approval_reasons_json: ["ADMIN_WAIVER_REQUIRED"] }, "APPROVED",
), /Solo Administración/); assertions += 1;
assert.doesNotThrow(() => __quoteChangeOrderInternals.assertAdministrativeWaiverAuthority(
  { role: "A" }, { approval_reasons_json: ["ADMIN_WAIVER_REQUIRED"] }, "APPROVED",
)); assertions += 1;

console.log(`V17 billing authority: ${assertions}/${assertions}`);
