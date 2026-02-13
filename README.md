# OSi-plus ERP v17

Sistema de Gestión Integral para International Packers SRL

## Descripción

OSi-plus es un sistema ERP completo diseñado para la gestión de operaciones de embalaje y logística. Incluye módulos para:

- **Dashboard** - Torre de Control con métricas en tiempo real
- **Operaciones** - Gestión de OSI (Orden de Servicio Interno)
- **Seguridad** - Control de acceso y visitantes
- **Choferes** - Gestión de flota y entregas
- **Supervisor** - Evaluación de equipos y QR scanning
- **Mecánica** - Órdenes de trabajo y repuestos
- **Despacho** - Checklists de carga/descarga
- **WMS** - Sistema de gestión de almacén
- **Inventario** - Control de stock
- **Clientes** - CRM y gestión de clientes
- **Comercial (Ventas)** - Gestión comercial, clientes y proyectos
- **RRHH** - Recursos Humanos
- **Carpintería** - Flujo de trabajo de producción
- **Diseña y Cotiza** - Ingeniería, costos, inventario y producción
- **Nesting V2** - Consolidación de cajas
- **Configuración** - Ajustes del sistema

## Tecnologías

- **React 19** - Framework de UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **shadcn/ui** - Componentes UI
- **Lucide React** - Iconos
- **Recharts** - Gráficos

## Instalación

### Requisitos previos

- Node.js 18+ 
- npm o yarn

### Pasos

1. **Descomprimir el archivo** en tu carpeta de proyectos

2. **Abrir en VS Code:**
   ```bash
   code osi-plus-erp
   ```

3. **Instalar dependencias:**
   ```bash
   npm install
   ```

4. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```

5. **Abrir en navegador:**
   - La aplicación estará disponible en: `http://localhost:5173`

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm run preview` | Previsualiza build de producción |
| `npm run lint` | Ejecuta linter |

## Estructura del proyecto

```
osi-plus-erp/
├── src/
│   ├── components/
│   │   ├── layout/       # Componentes de layout (Sidebar)
│   │   ├── modules/      # Módulos del ERP
│   │   └── ui/           # Componentes UI (shadcn)
│   ├── lib/              # Utilidades y algoritmos
│   ├── types/            # Definiciones de tipos TypeScript
│   └── App.tsx           # Componente principal
├── public/               # Archivos estáticos
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Roles de usuario

El sistema soporta los siguientes roles:

- **A** - Administrador (acceso total)
- **K** - Ventas / Comercial (Key Account)
- **B** - Operaciones
- **C** - Materiales
- **I** - RRHH
- **D** - Supervisor
- **E** - Chofer
- **G** - Portería
- **C1** - Despachador
- **N** - Personal de Campo
- **PA** - Carpintero
- **PB** - Mecánico

## Módulo Diseña y Cotiza

El módulo más avanzado incluye:

1. **ROL A - Ingeniería**: Diseño de cajas con especificaciones técnicas
2. **ROL B - Costos**: Cálculo de costos con campos editables
3. **ROL C - Inventario**: Verificación de cajas reutilizables
4. **ROL D - Producción**: Órdenes de trabajo y cut lists

## Licencia

Propietario - International Packers SRL

## Soporte

Para soporte técnico contactar al departamento de TI.
