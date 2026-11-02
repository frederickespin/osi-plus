import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWarehouseLocalitiesCatalogCli } from "./capture-v17-warehouse-localities-catalog.mjs";
export { collectWarehouseLocalitiesCatalogEvidence, captureWarehouseLocalitiesCatalog, validateWarehouseLocalitiesCatalogChange, validateWarehouseLocalitiesCatalogTransition } from "./capture-v17-warehouse-localities-catalog.mjs";
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runWarehouseLocalitiesCatalogCli(17);
