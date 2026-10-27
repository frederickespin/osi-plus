export type ExternalToolId = "packing" | "visual-inventory";

export type ExternalTool = Readonly<{
  id: ExternalToolId;
  areaTitle: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  icon: "calculator" | "smartphone";
}>;

export const EXTERNAL_TOOLS: Readonly<Record<ExternalToolId, ExternalTool>> =
  Object.freeze({
    packing: Object.freeze({
      id: "packing",
      areaTitle: "Herramientas de cotización",
      title: "Calculadora de empaque",
      description: "Medidas, materiales y reportes para tus cotizaciones.",
      href: "https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html",
      actionLabel: "Abrir calculadora",
      icon: "calculator",
    }),
    "visual-inventory": Object.freeze({
      id: "visual-inventory",
      areaTitle: "Procesos móviles",
      title: "Inventario Visual",
      description: "Fotografías, medidas y levantamientos de tus trabajos.",
      href: "https://ip-suite-inventario-empaquee.vercel.app/inventario/index.html",
      actionLabel: "Abrir inventario",
      icon: "smartphone",
    }),
  });

export const EXTERNAL_TOOL_OPEN_NOTICE =
  "Se abre la aplicación que ya utilizas, con sus datos y diseño actuales.";

export const EXTERNAL_TOOL_LINKAGE_NOTICE =
  "La vinculación automática con el expediente de OSI está pendiente.";
