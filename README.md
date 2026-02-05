# OSi-plus V7

Sistema ERP completo para **International Packers SRL** - Gestión integral de operaciones de mudanza y logística.

![Version](https://img.shields.io/badge/version-7.0.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-3.0-06B6D4?logo=tailwindcss)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)

## 📋 Características

- **25+ Módulos** para diferentes roles de usuario
- **Sistema de Roles (RBAC)** con 12 perfiles diferentes
- **Diseño Corporativo** con colores #003366 y #D4AF37
- **Navegación Simplificada** sin submenús desplegables
- **Responsive** para escritorio y móvil
- **Flujos de Trabajo** para operaciones de campo

## 👥 Roles del Sistema

| Rol | Código | Descripción |
|-----|--------|-------------|
| Administrador | A | Acceso total al sistema |
| Coordinador | K | Proyectos y planificación |
| Operaciones | B | Órdenes OSI y recursos |
| Materiales | C | Inventario y compras |
| Despachador | C1 | Handshake y cuarentena |
| Supervisor | D | Equipos y evaluaciones |
| Chofer | E | Rutas y custodia |
| Portería | G | Escaneo QR e incidentes |
| RRHH | I | KPIs y NOTA |
| Carpintero | PA | Embalaje y etiquetas |
| Mecánico | PB | Mantenimiento y repuestos |
| Personal Campo | N | Perfil y tareas |

## 🚀 Módulos Principales

### Torre de Control (Dashboard)
- Vista general de operaciones
- OSI por estado
- Alertas y notificaciones

### Operaciones
- Muro de Liquidación (Kanban)
- Órdenes OSI
- Calendario de servicios

### Inventario (WMS)
- Materiales y activos
- Cajas de madera
- Compras

### RRHH
- Dashboard de personal
- KPIs individuales
- Sistema NOTA
- Insignias

### Módulos Móviles
- **Portería**: Escaneo QR + Reporte de incidentes
- **Mecánica**: Órdenes + Solicitud de repuestos
- **Supervisor**: Escaneo inteligente + Evaluación de equipo
- **Carpintería**: Flujo de estados de trabajo
- **Despacho**: Checklists de entrega/recepción

## 🛠️ Tecnologías

- **Frontend**: React 18 + TypeScript 5
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 3
- **UI Components**: shadcn/ui + Radix UI
- **Charts**: Recharts
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod

## 📦 Instalación Rápida

```bash
# Clonar el repositorio
git clone https://github.com/frederickespin/osi-plus.git
cd osi-plus

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Construir para producción
npm run build
```

> 📘 **Para instrucciones detalladas de configuración y colaboración, ver [CONTRIBUTING.md](./CONTRIBUTING.md)**

## 🔧 Configuración de GitHub

### Opción 1: Script Automático
```bash
./github-setup.sh tu-usuario-github [nombre-repo]
```

### Opción 2: Manual
```bash
# Configurar remote
git remote add origin https://github.com/tu-usuario/osi-plus-v7.git

# Crear repo en GitHub (sin inicializar)
# https://github.com/new

# Subir código
git push -u origin main
```

## 🎨 Sistema de Diseño

### Colores Corporativos
- **Primario**: `#003366` (Azul corporativo)
- **Acento**: `#D4AF37` (Dorado)
- **Fondo**: `#FFFFFF` (Blanco)
- **Texto**: `#1f2937` (Gris oscuro)

### Tipografía
- Inter (sans-serif)
- Tamaños: xs (12px) a 4xl (36px)

## 📱 Responsive Breakpoints

- **Mobile**: < 768px (menú hamburguesa)
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px (sidebar colapsable)

## 🔐 Seguridad

- Autenticación por roles
- Permisos granulares por módulo
- Registro de actividad
- Sesiones con expiración

## 📝 Licencia

Propietario - International Packers SRL

## 👨‍💻 Colaboración y Desarrollo

¿Quieres colaborar en el proyecto? Lee nuestra **[Guía para Desarrolladores (CONTRIBUTING.md)](./CONTRIBUTING.md)** que incluye:

- 📋 Requisitos previos y software necesario
- 🔄 Cómo compartir el proyecto con otros desarrolladores
- ⚙️ Configuración paso a paso del entorno de desarrollo
- 🏗️ Estructura del proyecto y arquitectura
- 🔧 Flujo de trabajo y mejores prácticas
- 🐛 Solución de problemas comunes

Para reportar issues o solicitar features, crea un issue en GitHub.

---

**International Packers SRL** - Mudanzas Internacionales
