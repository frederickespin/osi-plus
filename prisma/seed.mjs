import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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

  await prisma.osi.upsert({
    where: { code: "OSI-2024-001" },
    update: {},
    create: {
      code: "OSI-2024-001",
      projectId: project1.id,
      projectCode: project1.code,
      clientId: clientA.id,
      clientName: clientA.name,
      status: "completed",
      type: "local",
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
      status: "in_transit",
      type: "local",
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
      status: "assigned",
      type: "national",
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
