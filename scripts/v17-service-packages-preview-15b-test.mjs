import assert from "node:assert/strict";
import { assertSurveyItemTypeLimit } from "../api/_lib/crmSurveyDomain.js";

let assertions = 0;
function check(name, task) { task(); assertions += 1; process.stdout.write(`PASS ${name}\n`); }
check("Mini permite crear el décimo tipo", () => assert.doesNotThrow(() => assertSurveyItemTypeLimit("MINI", 9)));
check("Mini rechaza el tipo once", () => assert.throws(() => assertSurveyItemTypeLimit("MINI", 10), (error) => error?.code === "CRM_SURVEY_MINI_ITEM_TYPE_LIMIT" && error?.status === 409));
check("cantidad por tipo no forma parte del límite", () => assert.doesNotThrow(() => assertSurveyItemTypeLimit("MINI", 4)));
check("edición del décimo tipo sigue permitida", () => assert.doesNotThrow(() => assertSurveyItemTypeLimit("MINI", 10, false)));
check("Survey completo no hereda el límite Mini", () => assert.doesNotThrow(() => assertSurveyItemTypeLimit("IN_PERSON", 11)));
console.log(JSON.stringify({ ok: true, assertions }));
