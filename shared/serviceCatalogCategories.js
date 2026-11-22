const categories = [
  ["CUSTOMS", "Aduanas y documentación"],
  ["STORAGE", "Almacenaje con custodia"],
  ["PACKING", "Empaque y embalaje"],
  ["FREIGHT", "Flete internacional"],
  ["ENGINEERING", "Ingeniería y huacales"],
  ["INSTALLATION", "Instalación y desmontaje"],
  ["INVENTORY", "Inventario y etiquetado"],
  ["MOVING", "Mudanzas"],
  ["TRANSPORT", "Transporte"],
  ["OTHER", "Otros servicios"],
];

export const DEFAULT_SERVICE_CATEGORIES = Object.freeze(
  categories.map(([code, name]) => Object.freeze({ code, name, version: 0 })),
);
