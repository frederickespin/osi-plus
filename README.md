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

## Cómo ver el preview de la aplicación

Existen dos formas de visualizar la aplicación:

### Opción 1: Modo Desarrollo (Recomendado para desarrollo)

Para ver la aplicación durante el desarrollo con recarga automática:

```bash
npm run dev
```

Luego abre tu navegador en: **http://localhost:5173**

Este modo incluye:
- ✅ Recarga automática al hacer cambios
- ✅ Mensajes de error detallados
- ✅ Herramientas de desarrollo de React

### Opción 2: Preview de Producción

Para ver cómo se verá la aplicación en producción:

1. **Primero, compila la aplicación:**
   ```bash
   npm run build
   ```

2. **Luego, inicia el servidor de preview:**
   ```bash
   npm run preview
   ```

3. **Abre tu navegador en:** `http://localhost:4173`

Este modo:
- ✅ Simula el entorno de producción
- ✅ Código optimizado y minificado
- ✅ Rendimiento similar a producción

**Nota:** El preview de producción usa el puerto `4173`, mientras que el modo desarrollo usa el puerto `5173`.

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm run preview` | Previsualiza build de producción |
| `npm run lint` | Ejecuta linter |

## Backend (Vercel Functions)

El proyecto incluye backend real en `api/` con base de datos y auth:

- `GET /api/health` - Estado de salud del backend
- `GET /api/info` - Información de entorno, commit y región
- `POST /api/auth/login` - Login (JWT)
- `GET /api/auth/me` - Perfil autenticado
- `GET/POST /api/users`
- `GET/POST /api/clients`
- `GET/POST /api/projects`
- `GET/POST /api/osis`

### Base de datos (Prisma)

1. Configura variables locales copiando `.env.example` a `.env`
2. Genera cliente:

```bash
npm run db:generate
```

3. Crea/actualiza estructura:

```bash
npm run db:push
```

4. Carga datos iniciales:

```bash
npm run db:seed
```

### Probar backend en local con CLI

```bash
npx vercel dev
```

Luego prueba:

- `http://localhost:3000/api/health`
- `http://localhost:3000/api/info`
- `http://localhost:3000/api/users`
- `http://localhost:3000/api/clients`
- `http://localhost:3000/api/projects`
- `http://localhost:3000/api/osis`

### Deploy por CLI

```bash
npx vercel
npx vercel --prod
```

### Variables/secrets en Vercel

```bash
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add JWT_EXPIRES_IN production
```

Repite para `preview` y `development` si corresponde.

Opcional para frontend:

- `VITE_API_URL=/api` (si frontend y backend viven en el mismo dominio de Vercel)

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
- **V** - Ventas / Comercial (Key Account)
- **K** - coordinador
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
