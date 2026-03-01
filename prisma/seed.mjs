/**
 * Seed de base de datos – solo para desarrollo y preview.
 * No usar en producción sin cambiar las contraseñas por defecto (Admin123*, Demo123*, Ventas123*).
 * Ver docs/AUDITORIA_SEGURIDAD.md (C3).
 */
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ONLY_ARG = process.argv.find((arg) => arg.startsWith("--only="));
const VALID_ONLY = new Set(["all", "cases", "osi"]);
const RAW_SEED_ONLY = (ONLY_ARG ? ONLY_ARG.split("=")[1] : "all").toLowerCase();
const SEED_ONLY = VALID_ONLY.has(RAW_SEED_ONLY) ? RAW_SEED_ONLY : "all";
const SEED_STRICT = process.env.SEED_STRICT === "1";
const SEED_OSI_FORCE = process.env.SEED_OSI === "1";

function warn(message) {
  console.warn(`[seed] ${message}`);
}

if (!VALID_ONLY.has(RAW_SEED_ONLY)) {
  warn(`--only=${RAW_SEED_ONLY} no es válido. Usando --only=all.`);
}

async function tableHasColumn(tableName, columnName) {
  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      LIMIT 1
    `
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function seedCasesSafe() {
  try {
    const mod = await import("../api/cases/_service.js");
    if (typeof mod.ensureSeedCases === "function") {
      await mod.ensureSeedCases();
      console.log("[seed] Cases seed listo (ensureSeedCases).");
      return;
    }
    warn("No se encontró ensureSeedCases en api/cases/_service.js.");
  } catch (error) {
    warn(`No se pudo ejecutar seed de cases: ${error?.message || String(error)}`);
  }
}

async function seedOsiData({ project1, project2, clientA, clientB, admin, sales }) {
  await prisma.osi.upsert({
    where: { code: "OSI-2024-001" },
    update: {},
    create: {
      code: "OSI-2024-001",
      projectId: project1.id,
      projectCode: project1.code,
      clientId: clientA.id,
      clientName: clientA.name,
      type: "PROJECT",
      status: "completed",
      serviceType: "local",
      origin: "Av. Arce #1234, La Paz",
      destination: "Calle Loayza #500, La Paz",
      scheduledDate: "2024-01-15",
      createdAt: "2024-01-05",
      assignedTo: admin.id,
      team: [],
      vehicles: [],
      value: 8500,
      notes: "Mudanza de mobiliario de oficina",
    },
  });

  await prisma.osi.upsert({
    where: { code: "OSI-2024-002" },
    update: {},
    create: {
      code: "OSI-2024-002",
      projectId: project1.id,
      projectCode: project1.code,
      clientId: clientA.id,
      clientName: clientA.name,
      type: "PROJECT",
      status: "in_transit",
      serviceType: "local",
      origin: "Av. Arce #1234, La Paz",
      destination: "Calle Loayza #500, La Paz",
      scheduledDate: "2024-01-20",
      createdAt: "2024-01-10",
      assignedTo: admin.id,
      team: [],
      vehicles: [],
      value: 12000,
      notes: "Equipos de computo y servidores",
    },
  });

  await prisma.osi.upsert({
    where: { code: "OSI-2024-003" },
    update: {},
    create: {
      code: "OSI-2024-003",
      projectId: project2.id,
      projectCode: project2.code,
      clientId: clientB.id,
      clientName: clientB.name,
      type: "PROJECT",
      status: "assigned",
      serviceType: "national",
      origin: "La Paz",
      destination: "Santa Cruz",
      scheduledDate: "2024-01-25",
      createdAt: "2024-01-12",
      assignedTo: sales.id,
      team: [],
      vehicles: [],
      value: 15000,
      notes: "Traslado de caja fuerte",
    },
  });
}

async function seedOsiSafe(deps) {
  const hasServiceTypeColumn = await tableHasColumn("osi_osis", "serviceType");
  const shouldRunOsi = SEED_OSI_FORCE || hasServiceTypeColumn;

  if (!shouldRunOsi) {
    const msg =
      "Seed OSI omitido: falta columna osi_osis.serviceType (usa SEED_OSI=1 para forzar).";
    if (SEED_STRICT) throw new Error(msg);
    warn(msg);
    return;
  }

  try {
    await seedOsiData(deps);
    console.log("[seed] OSI seed aplicado.");
  } catch (error) {
    const msg = `Seed OSI falló: ${error?.message || String(error)}`;
    if (SEED_STRICT) throw error;
    warn(msg);
  }
}

async function main() {
  await seedCasesSafe();

  if (SEED_ONLY === "cases") {
    console.log("[seed] --only=cases completado.");
    return;
  }

  const passwordHash = await bcrypt.hash("Admin123*", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ipackers.com" },
    update: {},
    create: {
      code: "EMP001",
      name: "Carlos Rodriguez",
      email: "admin@ipackers.com",
      phone: "+59170000001",
      role: "A",
      status: "active",
      department: "Administracion",
      joinDate: "2020-01-15",
      points: 1250,
      rating: 4.8,
      passwordHash,
    },
  });

  const demoHash = await bcrypt.hash("Demo123*", 10);

  const sales = await prisma.user.upsert({
    where: { email: "maria@ipackers.com" },
    update: {},
    create: {
      code: "EMP002",
      name: "Maria Gonzalez",
      email: "maria@ipackers.com",
      phone: "+59170000002",
      role: "K",
      status: "active",
      department: "Comercial",
      joinDate: "2020-03-20",
      points: 980,
      rating: 4.7,
      passwordHash: await bcrypt.hash("Ventas123*", 10),
    },
  });

  await prisma.user.upsert({
    where: { email: "ventas@ipackers.com" },
    update: {},
    create: {
      code: "EMP003",
      name: "Laura Fernandez",
      email: "ventas@ipackers.com",
      phone: "+59170000003",
      role: "V",
      status: "active",
      department: "Comercial",
      joinDate: "2020-05-10",
      points: 820,
      rating: 4.5,
      passwordHash: demoHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "operaciones@ipackers.com" },
    update: {},
    create: {
      code: "EMP004",
      name: "Roberto Vargas",
      email: "operaciones@ipackers.com",
      phone: "+59170000004",
      role: "B",
      status: "active",
      department: "Operaciones",
      joinDate: "2020-02-01",
      points: 1100,
      rating: 4.9,
      passwordHash: demoHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "materiales@ipackers.com" },
    update: {},
    create: {
      code: "EMP005",
      name: "Ana Mendoza",
      email: "materiales@ipackers.com",
      phone: "+59170000005",
      role: "C",
      status: "active",
      department: "Logística",
      joinDate: "2020-04-15",
      points: 750,
      rating: 4.6,
      passwordHash: demoHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "rrhh@ipackers.com" },
    update: {},
    create: {
      code: "EMP006",
      name: "Pedro Suarez",
      email: "rrhh@ipackers.com",
      phone: "+59170000006",
      role: "I",
      status: "active",
      department: "RRHH",
      joinDate: "2020-01-20",
      points: 900,
      rating: 4.7,
      passwordHash: demoHash,
    },
  });

  const clientA = await prisma.client.upsert({
    where: { code: "CLI001" },
    update: {},
    create: {
      code: "CLI001",
      name: "Minera Los Andes S.A.",
      email: "contacto@losandes.com",
      phone: "+5912100001",
      address: "Av. Arce #1234, La Paz",
      type: "corporate",
      status: "active",
      totalServices: 15,
      lastService: "2024-01-15",
      createdAt: "2020-01-10",
    },
  });

  const clientB = await prisma.client.upsert({
    where: { code: "CLI002" },
    update: {},
    create: {
      code: "CLI002",
      name: "Banco Nacional",
      email: "logistica@bnacional.com",
      phone: "+5912100002",
      address: "Calle Comercio #567, La Paz",
      type: "corporate",
      status: "active",
      totalServices: 32,
      lastService: "2024-01-20",
      createdAt: "2019-05-15",
    },
  });

  const project1 = await prisma.project.upsert({
    where: { code: "PRJ-2024-001" },
    update: {},
    create: {
      code: "PRJ-2024-001",
      name: "Relocalizacion Oficinas Corporativas",
      clientId: clientA.id,
      clientName: clientA.name,
      status: "active",
      startDate: "2024-01-01",
      osiCount: 2,
      totalValue: 45000,
      assignedTo: sales.id,
      notes: "Proyecto de mudanza de oficinas centrales",
    },
  });

  const project2 = await prisma.project.upsert({
    where: { code: "PRJ-2024-002" },
    update: {},
    create: {
      code: "PRJ-2024-002",
      name: "Renovacion Sucursales Banco",
      clientId: clientB.id,
      clientName: clientB.name,
      status: "active",
      startDate: "2024-01-15",
      osiCount: 1,
      totalValue: 120000,
      assignedTo: admin.id,
      notes: "Renovacion de sucursales a nivel nacional",
    },
  });
  if (SEED_ONLY === "all" || SEED_ONLY === "osi") {
    await seedOsiSafe({ project1, project2, clientA, clientB, admin, sales });
  }

  // ====================
  // Default Templates (PGD/PIC/NPS) - so K can apply PGD immediately in MVP.
  // ====================

  const ensureTemplatePublished = async ({ type, name, contentJson, contentHtml = null }) => {
    const existing = await prisma.template.findFirst({
      where: { type, name, tenantId: null },
    });

    const template = existing
      ? existing
      : await prisma.template.create({
          data: {
            type,
            name,
            scope: "GLOBAL",
            tenantId: null,
          },
        });

    // If already published, keep it.
    if (template.publishedVersionId) return template;

    const v1 = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        contentJson,
        contentHtml,
        changeSummary: "Seed v1",
        requestedAt: new Date(),
        approvedAt: new Date(),
        approvedById: admin.id,
        publishedAt: new Date(),
        createdById: admin.id,
        baseVersionId: null,
      },
    });

    return prisma.template.update({
      where: { id: template.id },
      data: { publishedVersionId: v1.id },
    });
  };

  await ensureTemplatePublished({
    type: "PGD",
    name: "PGD - Base",
    contentJson: {
      serviceTags: ["Base"],
      documents: [
        {
          name: "Permiso de Parqueo / Municipal",
          visibility: "INTERNAL_VIEW",
          responsible: "SUPERVISOR",
          isBlocking: false,
          expectedFileType: "PDF",
          serviceTags: ["Local", "Nacional", "Internacional"],
        },
        {
          name: "Declaración de Valor",
          visibility: "CLIENT_VIEW",
          responsible: "CLIENT",
          isBlocking: true,
          expectedFileType: "PDF",
          serviceTags: ["Internacional"],
        },
        {
          name: "Copia de Pasaporte / ID",
          visibility: "CLIENT_VIEW",
          responsible: "CLIENT",
          isBlocking: true,
          expectedFileType: "PHOTO",
          serviceTags: ["Internacional"],
        },
      ],
    },
  });

  await ensureTemplatePublished({
    type: "PIC",
    name: "PIC - Preparacion (Base)",
    contentJson: {
      triggerPhase: "PRE_OSI",
      channel: "BOTH",
      bodyHtml:
        "<p><strong>Hola {Cliente_Nombre}</strong>,</p>" +
        "<p>Confirmamos tu servicio para <strong>{Fecha_Servicio}</strong>. Para evitar contratiempos:</p>" +
        "<ul>" +
        "<li>Desconecta electrodomesticos 24h antes.</li>" +
        "<li>Ten listos documentos y llaves.</li>" +
        "<li>Indica restricciones de acceso o ascensores.</li>" +
        "</ul>" +
        "<p>Proyecto: {Proyecto_Codigo}</p>",
      attachments: [],
      variables: ["Cliente_Nombre", "Fecha_Servicio", "Proyecto_Codigo"],
    },
  });

  await ensureTemplatePublished({
    type: "NPS",
    name: "NPS - Base",
    contentJson: {
      question: "En una escala del 0 al 10, ¿qué tan probable es que recomiendes a International Packers?",
      scale: "0_10",
      positiveTags: ["Puntualidad", "Amabilidad", "Cuidado", "Profesionalismo"],
      negativeTags: ["Retraso", "Daños", "Actitud", "Comunicación"],
      evaluateSupervisorD: true,
      evaluateOfficeKV: true,
      alertThreshold: 7,
    },
  });

  // ====================
  // Commercial Catalogs (v1)
  // ====================
  const surchargeCatalog = [
    { code: "SUR_LONG_CARRY", name: "Long Carry", description: "Recorrido largo desde parqueo hasta punto de carga", defaultUnit: "servicio" },
    { code: "SUR_STAIR_CARRY", name: "Stair Carry", description: "Manipulación por escaleras/pisos sin elevador", defaultUnit: "piso" },
    { code: "SUR_WEEKEND", name: "Servicio fin de semana", description: "Recargo por ejecución en sábado/domingo", defaultUnit: "servicio" },
    { code: "SUR_WAITING", name: "Tiempo de espera", description: "Espera por restricciones de acceso/cliente", defaultUnit: "hora" },
  ];

  const specialHandlingCatalog = [
    { code: "SH_PIANO", name: "Piano / Instrumento pesado", description: "Requiere maniobra especial y equipo dedicado" },
    { code: "SH_ART", name: "Obra de arte", description: "Manipulación con protección premium y personal especializado" },
    { code: "SH_SERVER", name: "Servidor / Rack TI", description: "Embalaje técnico y control de vibración" },
    { code: "SH_FRAGILE", name: "Carga frágil crítica", description: "Manipulación manual supervisada" },
  ];

  const materialsCatalog = [
    { code: "MAT_CARTON_STD", name: "Caja cartón estándar", unit: "unidad", description: "Caja de cartón corrugado estándar" },
    { code: "MAT_CARTON_DH", name: "Caja cartón doble hoja", unit: "unidad", description: "Caja reforzada doble hoja" },
    { code: "MAT_TAPE", name: "Cinta de embalaje", unit: "rollo", description: "Cinta transparente industrial" },
    { code: "MAT_BUBBLE", name: "Plástico burbuja", unit: "metro", description: "Protección de piezas frágiles" },
    { code: "MAT_STRETCH", name: "Film stretch", unit: "rollo", description: "Envoltura para mobiliario y palets" },
  ];

  const assumptionsCatalog = [
    { code: "ASM_ACCESS_WINDOW_OK", name: "Acceso en ventana confirmada", description: "No habrá bloqueos de acceso durante la ventana acordada" },
    { code: "ASM_PARKING_AVAILABLE", name: "Parqueo disponible cercano", description: "Distancia de camión dentro de rango estándar" },
    { code: "ASM_NO_EXTRA_WAIT", name: "Sin tiempos extra de espera", description: "Carga/descarga continua sin interrupciones externas" },
    { code: "ASM_VOLUME_TOLERANCE_10", name: "Tolerancia de volumen ±10%", description: "El volumen real no supera un 10% del estimado" },
  ];

  const serviceTypeCatalog = [
    { code: "RESIDENTIAL_LOCAL", name: "Mudanza residencial local", category: "LOCAL", modePolicy: "FIXED", fixedMode: "LOCAL" },
    { code: "RESIDENTIAL_NATIONAL", name: "Mudanza residencial nacional", category: "NATIONAL", modePolicy: "FIXED", fixedMode: "LOCAL" },
    { code: "RESIDENTIAL_INTERNATIONAL", name: "Mudanza residencial internacional", category: "INTERNATIONAL", modePolicy: "FIXED", fixedMode: "IMPORT_EXPORT" },
    { code: "CORPORATE_OFFICE", name: "Relocación oficina corporativa", category: "CORPORATE", modePolicy: "BY_DESTINATION", fixedMode: null },
    { code: "CORPORATE_EMPLOYEE", name: "Relocación colaborador corporativo", category: "CORPORATE", modePolicy: "BY_DESTINATION", fixedMode: null },
    { code: "INDUSTRIAL_RELOC", name: "Relocación industrial", category: "INDUSTRIAL", modePolicy: "BY_DESTINATION", fixedMode: null },
    { code: "STORAGE_ONLY", name: "Solo almacenaje", category: "LOGISTICS", modePolicy: "FIXED", fixedMode: "LOCAL" },
    { code: "CRATING_ONLY", name: "Solo fabricación/huacal", category: "LOGISTICS", modePolicy: "FIXED", fixedMode: "LOCAL" },
  ];

  const serviceFlagsCatalog = [
    { code: "CRATING_REQUIRED", name: "Crating requerido", description: "El caso exige huacal/caja técnica" },
    { code: "PACKING_EQUIPMENT", name: "Packing de equipos", description: "Incluye desarme/embalaje técnico de equipos" },
    { code: "LONG_CARRY", name: "Long Carry", description: "Distancia de maniobra superior al umbral estándar" },
    { code: "STAIR_CARRY_RISK", name: "Riesgo por escaleras", description: "Movilización por escaleras sin elevador de carga" },
    { code: "NIMF15", name: "NIMF-15", description: "Requisito de tratamiento fitosanitario en exportación/importación" },
  ];

  for (const row of surchargeCatalog) {
    await prisma.catalogSurcharge.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, defaultUnit: row.defaultUnit, active: true },
      create: { code: row.code, name: row.name, description: row.description, defaultUnit: row.defaultUnit, active: true },
    });
  }

  for (const row of specialHandlingCatalog) {
    await prisma.catalogSpecialHandling.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, active: true },
      create: { code: row.code, name: row.name, description: row.description, active: true },
    });
  }

  for (const row of materialsCatalog) {
    await prisma.catalogMaterial.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, unit: row.unit, active: true },
      create: { code: row.code, name: row.name, description: row.description, unit: row.unit, active: true },
    });
  }

  for (const row of assumptionsCatalog) {
    await prisma.catalogAssumption.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, active: true },
      create: { code: row.code, name: row.name, description: row.description, active: true },
    });
  }

  for (const row of serviceTypeCatalog) {
    await prisma.catalogServiceType.upsert({
      where: { code: row.code },
      update: {
        name: row.name,
        category: row.category,
        modePolicy: row.modePolicy,
        fixedMode: row.fixedMode,
        active: true,
        metadata: {},
      },
      create: {
        code: row.code,
        name: row.name,
        category: row.category,
        modePolicy: row.modePolicy,
        fixedMode: row.fixedMode,
        active: true,
        metadata: {},
      },
    });
  }

  for (const row of serviceFlagsCatalog) {
    await prisma.catalogServiceFlag.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, active: true },
      create: { code: row.code, name: row.name, description: row.description, active: true },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
