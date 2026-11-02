// PostgreSQL17 is captured from its own local guarded database, never inferred
// from PostgreSQL18. Both versions share only the exact transition rules.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWarehouseRoutesCatalogCli } from "./capture-v17-warehouse-routes-catalog.mjs";
export {
  collectWarehouseRoutesCatalogEvidence, captureWarehouseRoutesCatalog,
  validateWarehouseRoutesCatalogChange, validateWarehouseRoutesCatalogTransition,
} from "./capture-v17-warehouse-routes-catalog.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runWarehouseRoutesCatalogCli(17);
