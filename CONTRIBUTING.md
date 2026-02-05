# Guía para Desarrolladores - OSi-plus V7

Esta guía explica cómo compartir y configurar el proyecto **OSi-plus V7** con otros desarrolladores.

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Compartir el Proyecto](#compartir-el-proyecto)
3. [Configuración Inicial](#configuración-inicial)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Flujo de Desarrollo](#flujo-de-desarrollo)
6. [Solución de Problemas](#solución-de-problemas)

---

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

### Software Requerido

- **Node.js**: Versión 18.x o superior
  - Verifica: `node --version`
  - Descarga: https://nodejs.org/

- **npm**: Versión 8.x o superior (incluido con Node.js)
  - Verifica: `npm --version`

- **Git**: Para control de versiones
  - Verifica: `git --version`
  - Descarga: https://git-scm.com/

### Conocimientos Recomendados

- **React 18+** y conceptos de hooks
- **TypeScript** básico/intermedio
- **Tailwind CSS** para estilos
- **Git** para control de versiones

---

## Compartir el Proyecto

### Opción 1: Compartir vía GitHub (Recomendado)

#### Para el propietario del proyecto:

1. **Asegúrate de que el repositorio esté en GitHub**

   Si aún no está en GitHub, usa el script incluido:
   ```bash
   ./github-setup.sh tu-usuario-github osi-plus
   ```

2. **Configura los permisos de acceso**

   - Ve a tu repositorio en GitHub
   - Click en **Settings** > **Collaborators**
   - Click en **Add people**
   - Ingresa el nombre de usuario o email del desarrollador
   - Selecciona el nivel de acceso (Write o Maintain recomendado)

3. **Comparte el enlace del repositorio**

   ```
   https://github.com/frederickespin/osi-plus
   ```

#### Para el nuevo desarrollador:

1. **Clona el repositorio**

   ```bash
   git clone https://github.com/frederickespin/osi-plus.git
   cd osi-plus
   ```

2. **Sigue la [Configuración Inicial](#configuración-inicial)**

### Opción 2: Compartir vía Archivo ZIP

Si no tienes acceso a GitHub o prefieres compartir el código directamente:

1. **Comprimir el proyecto** (excluir node_modules)
   ```bash
   # Desde la raíz del proyecto
   zip -r osi-plus-v7.zip . -x "node_modules/*" ".git/*" "dist/*"
   ```

2. **Compartir el archivo** vía email, drive, etc.

3. **El receptor debe descomprimir y seguir la configuración**
   ```bash
   unzip osi-plus-v7.zip
   cd osi-plus-v7
   ```

---

## Configuración Inicial

Una vez que tengas el código del proyecto:

### 1. Instalar Dependencias

```bash
# Desde la raíz del proyecto
npm install
```

Este comando instalará todas las dependencias listadas en `package.json`, incluyendo:
- React 19
- TypeScript 5
- Vite 7
- Tailwind CSS
- shadcn/ui components
- Y muchas más...

**Tiempo estimado**: 2-5 minutos dependiendo de tu conexión

### 2. Verificar la Instalación

```bash
# Listar todas las dependencias instaladas
npm list --depth=0
```

### 3. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en: `http://localhost:5173/`

**¡Deberías ver la aplicación funcionando en tu navegador!**

### 4. Comandos Disponibles

```bash
# Desarrollo - Inicia servidor con hot reload
npm run dev

# Build - Compila para producción
npm run build

# Preview - Previsualiza el build de producción
npm run preview

# Lint - Revisa el código con ESLint
npm run lint
```

---

## Estructura del Proyecto

```
osi-plus/
├── src/
│   ├── components/        # Componentes React reutilizables
│   │   └── ui/           # Componentes de shadcn/ui
│   ├── data/             # Datos mock y constantes
│   ├── App.tsx           # Componente principal
│   └── App.css           # Estilos globales
├── public/               # Archivos estáticos
├── index.html            # HTML principal
├── package.json          # Dependencias y scripts
├── vite.config.ts        # Configuración de Vite
├── tailwind.config.js    # Configuración de Tailwind
├── tsconfig.json         # Configuración de TypeScript
└── README.md             # Documentación principal
```

### Archivos de Configuración Importantes

- **vite.config.ts**: Configuración del build tool (alias de paths, plugins)
- **tailwind.config.js**: Temas, colores, y extensiones de Tailwind
- **tsconfig.json**: Opciones del compilador de TypeScript
- **components.json**: Configuración de shadcn/ui

---

## Flujo de Desarrollo

### 1. Crear una Rama para tu Feature

```bash
# Crear y cambiar a una nueva rama
git checkout -b feature/nombre-del-feature

# O para un bugfix
git checkout -b fix/nombre-del-bug
```

### 2. Realizar Cambios

- Edita los archivos necesarios
- El servidor de desarrollo se recargará automáticamente
- Revisa los cambios en el navegador

### 3. Revisar el Código

```bash
# Ejecutar el linter
npm run lint

# Compilar TypeScript para verificar errores
npm run build
```

### 4. Commit y Push

```bash
# Ver cambios
git status

# Agregar archivos
git add .

# Crear commit con mensaje descriptivo
git commit -m "feat: agregar módulo de inventario"

# Subir cambios a GitHub
git push origin feature/nombre-del-feature
```

### 5. Crear Pull Request

- Ve a GitHub
- Verás un botón para crear Pull Request
- Describe tus cambios
- Solicita revisión de código

---

## Solución de Problemas

### Error: "Cannot find module"

**Problema**: Faltan dependencias
```bash
# Solución: Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: "Port 5173 is already in use"

**Problema**: El puerto está ocupado
```bash
# Solución 1: Matar el proceso
lsof -ti:5173 | xargs kill -9

# Solución 2: Usar otro puerto
npm run dev -- --port 3000
```

### Error de TypeScript

**Problema**: Errores de tipos
```bash
# Revisar configuración
npx tsc --noEmit

# Verificar versión de TypeScript
npm list typescript
```

### Problemas con Tailwind

**Problema**: Los estilos no se aplican
```bash
# Reconstruir
npm run build

# Verificar postcss y configuración
cat postcss.config.js
cat tailwind.config.js
```

### Error de permisos en scripts

**Problema**: No se pueden ejecutar scripts .sh
```bash
# Dar permisos de ejecución
chmod +x github-setup.sh
chmod +x push-to-github.sh
```

### Node version incompatible

**Problema**: Versión de Node muy antigua
```bash
# Actualizar Node.js
# Visita: https://nodejs.org/

# O usa nvm (Node Version Manager)
nvm install 20
nvm use 20
```

### Errores de TypeScript en build

**Nota**: El proyecto puede tener algunos errores de TypeScript preexistentes relacionados con archivos faltantes como `@/lib/utils` o `@/types/*`. Estos errores no impiden ejecutar el servidor de desarrollo (`npm run dev`), que funciona correctamente.

**Para trabajar sin problemas**:
- Usa `npm run dev` para desarrollo (funciona sin errores)
- El servidor de desarrollo soporta hot-reload y es completamente funcional
- Los errores de build (`npm run build`) son conocidos y están siendo trabajados

---

## Buenas Prácticas

### Commits

- Usa mensajes descriptivos
- Formato: `tipo: descripción`
- Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Ejemplos:
```
feat: agregar dashboard de operaciones
fix: corregir error en cálculo de inventario
docs: actualizar README con instrucciones
```

### Código

- Sigue las reglas de ESLint configuradas
- Usa TypeScript para tipado fuerte
- Componentes reutilizables en `src/components/`
- Mantén los componentes pequeños y enfocados

### Testing

- Prueba manualmente en el navegador
- Verifica responsive design (mobile, tablet, desktop)
- Usa herramientas de desarrollador del navegador

---

## Recursos Útiles

### Documentación Oficial

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)

### Herramientas Recomendadas

- **VS Code**: Editor recomendado con extensiones:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript Vue Plugin (Volar)
  
---

## Contacto y Soporte

Para preguntas o problemas:

1. Revisa esta guía primero
2. Busca en issues de GitHub
3. Contacta al equipo de desarrollo
4. Crea un issue en GitHub con detalles del problema

---

**International Packers SRL** - Sistema ERP OSi-plus V7
