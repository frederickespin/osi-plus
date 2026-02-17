import { withCommonHeaders, methodNotAllowed } from "./_lib/http.js";

const modules = [
  { id: "dashboard", name: "Dashboard", area: "General" },
  { id: "operations", name: "Operaciones", area: "Operaciones" },
  { id: "clients", name: "Clientes", area: "Comercial" },
  { id: "projects", name: "Proyectos", area: "Comercial" },
  { id: "wms", name: "WMS", area: "Almacen" },
  { id: "inventory", name: "Inventario", area: "Almacen" },
  { id: "hr", name: "RRHH", area: "RRHH" },
  { id: "dispatch", name: "Despacho", area: "Operaciones" },
  { id: "mechanic", name: "Mecanica", area: "Mantenimiento" },
];

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return res.status(200).json({
    ok: true,
    total: modules.length,
    data: modules,
  });
});
