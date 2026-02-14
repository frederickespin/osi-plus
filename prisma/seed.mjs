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

