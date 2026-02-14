export const roleDefinitions = [
  { code: "A", name: "Administrador", description: "Control total", permissions: ["all"], isMobile: false },
  { code: "V", name: "Ventas", description: "Comercial", permissions: ["sales"], isMobile: true },
  { code: "K", name: "Coordinador", description: "Coordinación", permissions: ["coord"], isMobile: true },
  { code: "I", name: "RRHH", description: "Recursos Humanos", permissions: ["hr"], isMobile: false },
] as any[];

export const mockUsers = [
  {
    id: "U001",
    code: "EMP001",
    name: "Admin User",
    fullName: "Admin User",
    email: "admin@demo.local",
    phone: "+1 809 555 0001",
    whatsappNumber: "+1 809 555 0001",
    role: "A",
    status: "ACTIVE",
    currentRating: 95,
    rating: 4.8,
    points: 1200,
    contractType: "Planta",
    joinDate: "2024-01-01",
    department: "Administración",
    skills: [],
  },
] as any[];

export const mockClients = [
  {
    id: "CL001",
    legalName: "International Packers SRL (Demo Cliente)",
    displayName: "International Packers (Demo)",
    phone: "+1 809 555 0101",
    email: "demo@ipackers.local",
    address: "Santo Domingo, RD",
    status: "ACTIVE",
    createdAt: "2026-01-15",
    updatedAt: "2026-02-10",
  },
  {
    id: "CL002",
    legalName: "Museo Nacional (Demo)",
    displayName: "Museo Nacional",
    phone: "+1 809 555 0201",
    email: "museo@demo.rd",
    address: "Distrito Nacional, RD",
    status: "ACTIVE",
    createdAt: "2026-01-22",
    updatedAt: "2026-02-11",
  },
  {
    id: "CL003",
    legalName: "Constructora Atlas SRL (Demo)",
    displayName: "Constructora Atlas",
    phone: "+1 809 555 0301",
    email: "atlas@demo.rd",
    address: "Santiago, RD",
    status: "INACTIVE",
    createdAt: "2025-12-10",
    updatedAt: "2026-02-01",
  },
] as const;

export const mockProjects = [
  {
    id: "P001",
    code: "PRJ-001",
    name: "Proyecto Demo",
    clientId: "CL001",
    clientName: "International Packers (Demo)",
    status: "active",
    startDate: "2026-02-01",
    endDate: "2026-02-20",
    osiCount: 1,
    totalValue: 150000,
    assignedTo: "U001",
  },
  {
    id: "P002",
    code: "PRJ-002",
    name: "Mudanza Museo Nacional",
    clientId: "CL002",
    clientName: "Museo Nacional",
    status: "completed",
    startDate: "2026-01-10",
    endDate: "2026-01-18",
    osiCount: 3,
    totalValue: 275000,
    assignedTo: "U001",
  },
  {
    id: "P003",
    code: "PRJ-003",
    name: "Traslado Constructora Atlas",
    clientId: "CL003",
    clientName: "Constructora Atlas",
    status: "pending",
    startDate: "2026-03-03",
    endDate: "2026-03-08",
    osiCount: 0,
    totalValue: 98000,
    assignedTo: "U001",
  },
] as any[];

export const mockOSIs = [
  {
    id: "OSI001",
    code: "OSI-2026-001",
    projectId: "P001",
    projectCode: "PRJ-001",
    clientId: "CL001",
    clientName: "GrupoSoft (Demo)",
    status: "assigned",
    type: "local",
    origin: "Santo Domingo",
    destination: "Santiago",
    scheduledDate: "2026-02-20",
    createdAt: "2026-02-10T10:00:00.000Z",
    value: 25000,
    assignedTo: "U001",
    vehicles: ["VH001"],
    notes: "OSI demo",
  },
] as any[];

export const mockBadges = [
  {
    id: "B001",
    code: "TOP",
    name: "Top Performer",
    description: "Rendimiento sobresaliente",
    icon: "award",
    color: "#D4AF37",
    requirement: "KPI > 90",
    points: 100,
  },
] as any[];

export const mockNOTAs = [
  {
    id: "N001",
    code: "NOTA-001",
    osiId: "OSI001",
    osiCode: "OSI-2026-001",
    description: "Material adicional",
    category: "materials",
    amount: 5000,
    currency: "RD$",
    requestedBy: "U001",
    status: "pending",
    createdAt: "2026-02-10T11:00:00.000Z",
  },
] as any[];

export const mockCalendarEvents = [
  {
    id: "EV001",
    title: "Servicio Demo",
    type: "osi",
    startDate: "2026-02-20",
    endDate: "2026-02-20",
    status: "scheduled",
  },
] as any[];

export const mockWoodBoxes = [
  {
    id: "WB001",
    code: "WB-001",
    dimensions: { length: 100, width: 80, height: 70 },
    boardFeet: 25,
    status: "available",
    reuseCount: 0,
    createdAt: "2026-01-10",
  },
] as any[];

export const mockHandshakes = [
  {
    id: "H001",
    code: "HS-001",
    osiId: "OSI001",
    osiCode: "OSI-2026-001",
    type: "pickup",
    fromRole: "D",
    fromUserId: "U001",
    fromUserName: "Admin User",
    toRole: "E",
    toUserId: "U001",
    toUserName: "Admin User",
    status: "pending",
    qrCode: "QR001",
    timestamp: "2026-02-10T12:00:00.000Z",
  },
] as any[];

export const mockVehicles = [
  {
    id: "VH001",
    code: "TRK-001",
    plate: "A123456",
    type: "Camión",
    brand: "Isuzu",
    model: "NPR",
    year: 2023,
    capacity: 5,
    status: "available",
    mileage: 12000,
  },
] as any[];

export const mockMaintenanceRecords = [
  {
    id: "M001",
    vehicleId: "VH001",
    type: "preventive",
    description: "Cambio de aceite",
    cost: 3500,
    date: "2026-01-30",
    performedBy: "U001",
    status: "completed",
  },
] as any[];

export const mockKPIRecords = [
  {
    id: "KPI001",
    userId: "U001",
    period: "2026-02",
    metrics: {
      osisCompleted: 12,
      onTimeRate: 0.95,
      qualityScore: 94,
      safetyScore: 98,
      customerRating: 4.7,
    },
    totalScore: 95,
    ranking: 1,
  },
] as any[];

export const mockPurchaseRequests = [
  {
    id: "PR001",
    code: "REQ-001",
    description: "Compra de plywood",
    category: "materiales",
    amount: 25000,
    requestedBy: "U001",
    status: "pending",
    priority: "medium",
    createdAt: "2026-02-10",
  },
] as any[];

export const mockLocations = [
  {
    id: "L001",
    code: "A-01-01",
    warehouse: "Principal",
    zone: "MAIN",
    aisle: "A",
    rack: "01",
    level: "01",
    bin: "01",
    qrCode: "LOC001",
    category: "materials",
    capacity: 100,
    occupied: 40,
  },
] as any[];

export const mockInventoryItems = [
  {
    id: "I001",
    code: "ITM-001",
    name: "Plywood 3/8",
    category: "materials",
    locationId: "L001",
    locationCode: "A-01-01",
    quantity: 20,
    unit: "sheet",
    status: "available",
  },
] as any[];

export const mockInventoryMoves = [
  {
    id: "IM001",
    itemId: "I001",
    itemName: "Plywood 3/8",
    fromLocation: "A-01-01",
    toLocation: "A-01-02",
    quantity: 2,
    movedBy: "U001",
    movedAt: "2026-02-10T13:00:00.000Z",
    reason: "Reubicación",
    type: "transfer",
  },
] as any[];

export const ptfs = [
  {
    id: "PTF001",
    code: "PTF-001",
    name: "Plantilla Mudanza Local",
    description: "Plantilla base",
    items: [],
    serviceType: "local",
    materials: [],
    tools: [],
    createdAt: "2026-02-01",
  },
] as any[];

export const pets = [
  {
    id: "PET001",
    code: "PET-001",
    name: "Equipo Estándar",
    description: "Equipo mínimo",
    equipment: [],
    roles: [],
    requirements: [],
    createdAt: "2026-02-01",
  },
] as any[];

export const pics = [
  {
    id: "PIC001",
    clientId: "CL001",
    name: "Maria Perez",
    email: "maria@gruposoft.demo",
    phone: "+1 809 555 0102",
    role: "Compras",
    isPrimary: true,
  },
] as any[];

export const pgds = [
  {
    id: "PGD001",
    code: "PGD-001",
    name: "Guía Documental",
    description: "Checklist documental",
    guidelines: [],
    serviceType: "local",
    documents: [],
    createdAt: "2026-02-01",
  },
] as any[];
