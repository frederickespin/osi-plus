import type { 
  Client, 
  ClientInstructionTemplate, 
  WelcomePackage, 
  LiveTracking,
  ClientEvaluation,
  SecurityQR,
  ClientDashboard
} from '@/types/client.types';

// ============================================
// CLIENTES
// ============================================

export const clients: Client[] = [
  {
    id: 'CLI-001',
    name: 'Juan Pérez García',
    email: 'juan.perez@email.com',
    phone: '+52 555 123 4567',
    alternatePhone: '+52 555 987 6543',
    address: 'Av. Reforma 123, Col. Centro, Ciudad de México',
    company: 'Familia Pérez',
    createdAt: new Date('2024-01-10'),
    projects: ['P001'],
    rating: 4.5,
    notes: 'Cliente recurrente, muy organizado'
  },
  {
    id: 'CLI-002',
    name: 'ABC Corporation',
    email: 'logistica@abccorp.com',
    phone: '+52 555 987 6543',
    address: 'Paseo de la Reforma 500, Ciudad de México',
    company: 'ABC Corporation S.A. de C.V.',
    rfc: 'ABC123456XYZ',
    createdAt: new Date('2024-01-15'),
    projects: ['P002'],
    rating: 4.8,
    notes: 'Empresa corporativa, requiere factura'
  },
  {
    id: 'CLI-003',
    name: 'María Elena Sánchez',
    email: 'maria.sanchez@email.com',
    phone: '+52 555 456 7890',
    address: 'Calle Insurgentes 456, Col. Roma, Ciudad de México',
    createdAt: new Date('2024-01-08'),
    projects: ['P003'],
    rating: 4.2,
    notes: 'Primera vez, necesita orientación extra'
  }
];

// ============================================
// PLANTILLAS PIC (Creadas por K)
// ============================================

export const picTemplates: ClientInstructionTemplate[] = [
  {
    id: 'PIC-001',
    templateId: 'PIC-MUDANZA-LOCAL',
    name: 'Instrucciones Mudanza Local',
    serviceType: 'MUDANZA_LOCAL',
    version: 2,
    createdBy: 'U002', // María González (K)
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    isActive: true,
    content: {
      generalProcedure: `
        1. Nuestro equipo llegará en la ventana de tiempo acordada (±30 minutos).
        2. El Supervisor presentará al equipo y verificará el inventario.
        3. Se protegerán pisos, puertas y paredes antes de iniciar.
        4. Carga ordenada por habitaciones.
        5. Transporte seguro a su nuevo domicilio.
        6. Descarga y colocación de muebles según sus indicaciones.
        7. Verificación final y firma de conformidad.
      `,
      rightsAndDuties: `
        DERECHOS DEL CLIENTE:
        • Recibir un servicio profesional y cuidadoso
        • Ser informado de cualquier daño inmediatamente
        • Tener seguro de carga incluido
        • Solicitar pausa en el servicio si es necesario

        DEBERES DEL CLIENTE:
        • Asegurar joyas, dinero en efectivo y documentos importantes personalmente
        • Desconectar electrodomésticos 24h antes (refrigerador, lavadora)
        • Retirar objetos de paredes y estantes
        • Reservar elevador de servicio (si aplica)
        • Estar presente o designar un representante
      `,
      specialCare: `
        • Plantas: No transportamos plantas en macetas grandes (riesgo de derrame)
        • Mascotas: Asegure a sus mascotas en una habitación separada
        • Líquidos: Drene completamente tanques de agua, gasolina, etc.
        • Clima: En caso de lluvia intensa, podemos reprogramar sin costo
      `,
      preparationChecklist: [
        { id: 'CHK-001', text: 'Desconectar refrigerador 24h antes', required: true, category: 'ANTES' },
        { id: 'CHK-002', text: 'Retirar objetos de paredes', required: true, category: 'ANTES' },
        { id: 'CHK-003', text: 'Reservar elevador de servicio', required: false, category: 'ANTES' },
        { id: 'CHK-004', text: 'Asegurar mascotas', required: true, category: 'ANTES' },
        { id: 'CHK-005', text: 'Verificar inventario al finalizar', required: true, category: 'DESPUES' }
      ],
      contactInfo: {
        emergencyPhone: '+52 555 000 0000',
        supportEmail: 'soporte@packers.com',
        coordinatorName: 'María González'
      }
    }
  },
  {
    id: 'PIC-002',
    templateId: 'PIC-MUDANZA-INT',
    name: 'Instrucciones Mudanza Internacional',
    serviceType: 'MUDANZA_INTERNACIONAL',
    version: 1,
    createdBy: 'U002',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
    isActive: true,
    content: {
      generalProcedure: `
        1. Inspección pre-embarque y fotografías de condición.
        2. Embalaje especializado para exportación (NIMF-15).
        3. Inventario detallado con valores declarados.
        4. Documentación aduanera completa.
        5. Transporte terrestre al puerto/aeropuerto.
        6. Seguimiento en tiempo real durante tránsito internacional.
        7. Despacho aduanal en destino.
        8. Entrega final en domicilio del extranjero.
      `,
      rightsAndDuties: `
        DERECHOS:
        • Seguro internacional de carga
        • Rastreo GPS durante todo el tránsito
        • Agente destino asignado
        • Soporte en idioma local en destino

        DEBERES:
        • Declaración de valores exactos
        • Documentación migratoria vigente
        • Permisos de importación (si aplica)
        • Pago de impuestos aduaneros en destino
      `,
      specialCare: `
        • PROHIBIDO: Armas, drogas, alimentos perecederos, plantas
        • Restricciones por país: Verifique lista específica
        • Fumigación: Obligatoria para madera (certificado NIMF-15)
        • Empaque: Usamos solo materiales certificados para exportación
      `,
      preparationChecklist: [
        { id: 'CHK-INT-001', text: 'Pasaporte vigente', required: true, category: 'ANTES' },
        { id: 'CHK-INT-002', text: 'Visa de destino', required: true, category: 'ANTES' },
        { id: 'CHK-INT-003', text: 'Inventario con valores', required: true, category: 'ANTES' },
        { id: 'CHK-INT-004', text: 'Póliza de seguro internacional', required: true, category: 'ANTES' },
        { id: 'CHK-INT-005', text: 'Documentación aduanera', required: true, category: 'ANTES' }
      ],
      contactInfo: {
        emergencyPhone: '+52 555 000 0000',
        supportEmail: 'internacional@packers.com',
        coordinatorName: 'María González'
      }
    }
  }
];

// ============================================
// PAQUETES DE BIENVENIDA ENVIADOS
// ============================================

export const welcomePackages: WelcomePackage[] = [
  {
    id: 'WP-001',
    projectId: 'P001',
    osiId: 'OSI-500',
    clientId: 'CLI-001',
    sentAt: new Date('2024-01-19T18:00:00'),
    sentVia: ['WHATSAPP', 'EMAIL'],
    status: 'READ',
    content: {
      blockA: picTemplates[0].content,
      blockB: {
        supervisor: {
          userId: 'U006',
          name: 'Pedro Sánchez',
          role: 'Supervisor',
          roleCode: 'D',
          photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pedro',
          rating: 4.6,
          experience: '5 años'
        },
        driver: {
          userId: 'U007',
          name: 'Roberto Díaz',
          role: 'Chofer',
          roleCode: 'E',
          photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Roberto',
          rating: 4.4,
          experience: '3 años'
        },
        fieldWorkers: [
          {
            userId: 'U009',
            name: 'José García',
            role: 'Personal de Campo',
            roleCode: 'N',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jose',
            rating: 4.2,
            experience: '2 años'
          }
        ],
        qrSecurity: {
          token: 'SEC-TOKEN-001-ABC123',
          instructions: 'Muestre este código al Supervisor al llegar y al salir cada día para validar las horas de trabajo',
          validFrom: new Date('2024-01-20'),
          validUntil: new Date('2024-01-22')
        }
      },
      blockC: {
        link: 'https://osi-plus.com/track/a1b2c3d4e5f6',
        projectHash: 'a1b2c3d4e5f6',
        expiresAt: new Date('2024-01-25'),
        states: [
          {
            state: 'DESPACHO',
            label: 'Despacho',
            description: 'Camión saliendo de instalaciones',
            active: true,
            activatedAt: new Date('2024-01-20T08:00:00'),
            activatedBy: 'U008' // Portero G
          },
          {
            state: 'EN_RUTA',
            label: 'En Ruta',
            description: 'En camino a su domicilio',
            active: true,
            activatedAt: new Date('2024-01-20T08:15:00')
          },
          {
            state: 'EN_SITIO',
            label: 'En Sitio',
            description: 'Personal trabajando en su domicilio',
            active: true,
            activatedAt: new Date('2024-01-20T08:45:00'),
            activatedBy: 'U006' // Supervisor D
          },
          {
            state: 'RETORNO',
            label: 'Retorno',
            description: 'Regresando a bodega',
            active: false
          },
          {
            state: 'CIERRE',
            label: 'Cierre',
            description: 'Equipo de regreso en base',
            active: false
          }
        ]
      }
    },
    trackingLink: 'https://osi-plus.com/track/a1b2c3d4e5f6',
    qrSecurityToken: 'SEC-TOKEN-001-ABC123'
  }
];

// ============================================
// RASTREO EN VIVO
// ============================================

export const liveTrackings: LiveTracking[] = [
  {
    id: 'LT-001',
    projectId: 'P001',
    osiId: 'OSI-500',
    isActive: true,
    currentState: 'EN_SITIO',
    driverLocation: {
      lat: 19.4326,
      lng: -99.1332,
      accuracy: 10,
      timestamp: new Date('2024-01-20T10:30:00')
    },
    route: [
      { lat: 19.4500, lng: -99.1500, accuracy: 15, timestamp: new Date('2024-01-20T08:00:00') },
      { lat: 19.4400, lng: -99.1400, accuracy: 12, timestamp: new Date('2024-01-20T08:15:00') },
      { lat: 19.4326, lng: -99.1332, accuracy: 10, timestamp: new Date('2024-01-20T08:45:00') }
    ],
    estimatedArrival: new Date('2024-01-20T08:30:00'),
    startedAt: new Date('2024-01-20T08:00:00'),
    privacyEnabled: false
  }
];

// ============================================
// EVALUACIONES NPS
// ============================================

export const clientEvaluations: ClientEvaluation[] = [
  {
    id: 'EVAL-001',
    projectId: 'P001',
    osiId: 'OSI-500',
    clientId: 'CLI-001',
    status: 'COMPLETED',
    createdAt: new Date('2024-01-20T14:00:00'),
    sentAt: new Date('2024-01-20T14:05:00'),
    completedAt: new Date('2024-01-20T16:30:00'),
    isManualRelease: false,
    ratings: {
      overall: 5,
      supervisor: 5,
      fieldWorkers: 4,
      coordination: 5,
      punctuality: 5,
      care: 5,
      communication: 5
    },
    comments: 'Excelente servicio, el supervisor Pedro fue muy profesional y cuidadoso con nuestros muebles.',
    npsScore: 9
  },
  {
    id: 'EVAL-002',
    projectId: 'P002',
    osiId: 'OSI-502',
    clientId: 'CLI-002',
    status: 'PENDING',
    createdAt: new Date('2024-01-22T10:00:00'),
    isManualRelease: true,
    releasedBy: 'U003', // Juan Pérez (B)
    releasedAt: new Date('2024-01-22T18:00:00'),
    ratings: {
      overall: 0,
      supervisor: 0,
      fieldWorkers: 0,
      coordination: 0,
      punctuality: 0,
      care: 0,
      communication: 0
    }
  },
  {
    id: 'EVAL-003',
    projectId: 'P003',
    osiId: 'OSI-503',
    clientId: 'CLI-003',
    status: 'AVAILABLE',
    createdAt: new Date('2024-01-18T12:00:00'),
    sentAt: new Date('2024-01-18T12:05:00'),
    isManualRelease: false,
    ratings: {
      overall: 0,
      supervisor: 0,
      fieldWorkers: 0,
      coordination: 0,
      punctuality: 0,
      care: 0,
      communication: 0
    }
  }
];

// ============================================
// QR DE SEGURIDAD
// ============================================

export const securityQRs: SecurityQR[] = [
  {
    id: 'QR-SEC-001',
    projectId: 'P001',
    osiId: 'OSI-500',
    token: 'SEC-ARRIVAL-001-XYZ789',
    type: 'ARRIVAL',
    generatedAt: new Date('2024-01-20T07:00:00'),
    validFrom: new Date('2024-01-20T08:00:00'),
    validUntil: new Date('2024-01-20T20:00:00'),
    scannedBy: 'U006',
    scannedAt: new Date('2024-01-20T08:45:00'),
    scanLocation: {
      lat: 19.4326,
      lng: -99.1332,
      accuracy: 5,
      timestamp: new Date('2024-01-20T08:45:00')
    },
    isValid: true
  },
  {
    id: 'QR-SEC-002',
    projectId: 'P001',
    osiId: 'OSI-500',
    token: 'SEC-DEPARTURE-001-ABC456',
    type: 'DEPARTURE',
    generatedAt: new Date('2024-01-20T07:00:00'),
    validFrom: new Date('2024-01-20T08:00:00'),
    validUntil: new Date('2024-01-20T20:00:00'),
    isValid: true
  }
];

// ============================================
// DASHBOARD DEL CLIENTE (VISTA PÚBLICA)
// ============================================

export const clientDashboards: ClientDashboard[] = [
  {
    projectId: 'P001',
    clientName: 'Juan Pérez García',
    serviceType: 'MUDANZA_LOCAL',
    scheduledDate: new Date('2024-01-20T09:00:00'),
    team: [
      {
        userId: 'U006',
        name: 'Pedro Sánchez',
        role: 'Supervisor',
        roleCode: 'D',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pedro',
        rating: 4.6,
        experience: '5 años'
      },
      {
        userId: 'U007',
        name: 'Roberto Díaz',
        role: 'Chofer',
        roleCode: 'E',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Roberto',
        rating: 4.4,
        experience: '3 años'
      },
      {
        userId: 'U009',
        name: 'José García',
        role: 'Personal de Campo',
        roleCode: 'N',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jose',
        rating: 4.2,
        experience: '2 años'
      }
    ],
    currentStatus: 'EN_SITIO',
    tracking: liveTrackings[0],
    instructions: picTemplates[0].content,
    evaluationAvailable: true,
    evaluation: clientEvaluations[0],
    documents: [
      {
        id: 'DOC-001',
        name: 'Contrato de Servicio',
        type: 'CONTRACT',
        url: '/docs/contract-001.pdf',
        uploadedAt: new Date('2024-01-15'),
        status: 'SIGNED'
      },
      {
        id: 'DOC-002',
        name: 'Inventario de Bienes',
        type: 'INVENTORY',
        url: '/docs/inventory-001.pdf',
        uploadedAt: new Date('2024-01-19'),
        status: 'VERIFIED'
      }
    ]
  }
];

// ============================================
// ESTADÍSTICAS DEL MÓDULO CLIENTE
// ============================================

export const clientStats = {
  totalClients: clients.length,
  activeProjects: 3,
  welcomePackagesSent: welcomePackages.length,
  welcomePackagesRead: welcomePackages.filter(wp => wp.status === 'READ').length,
  evaluationsCompleted: clientEvaluations.filter(e => e.status === 'COMPLETED').length,
  evaluationsPending: clientEvaluations.filter(e => e.status === 'PENDING' || e.status === 'AVAILABLE').length,
  averageNPS: 8.5,
  averageRating: 4.7
};
