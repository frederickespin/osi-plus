/**
 * Banner que muestra "Entorno de Pruebas" cuando VITE_APP_ENV === 'preview'.
 * No se muestra en producción para no saturar la UI.
 */
const env = import.meta.env.VITE_APP_ENV || "";

export function EnvBanner() {
  if (env !== "preview") return null;

  return (
    <div
      className="bg-amber-500/95 text-amber-950 text-center py-1.5 text-sm font-medium shadow-sm shrink-0"
      role="status"
      aria-label="Entorno de pruebas"
    >
      Entorno de Pruebas — Los datos aquí son de prueba, no de producción
    </div>
  );
}
