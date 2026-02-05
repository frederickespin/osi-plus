# 🚀 Guía de Inicio Rápido - OSi-plus V7

Esta guía te ayudará a comenzar a trabajar con OSi-plus V7 en menos de 10 minutos.

---

## ✅ Requisitos Mínimos

Antes de comenzar, verifica que tengas instalado:

```bash
node --version    # Debe ser v18.x o superior
npm --version     # Debe ser v8.x o superior
git --version     # Cualquier versión reciente
```

Si no tienes Node.js, descárgalo desde: https://nodejs.org/

---

## 📥 Paso 1: Obtener el Código

### Si tienes acceso a GitHub:

```bash
git clone https://github.com/frederickespin/osi-plus.git
cd osi-plus
```

### Si recibes el proyecto por archivo ZIP:

```bash
unzip osi-plus.zip
cd osi-plus
```

---

## 📦 Paso 2: Instalar Dependencias

```bash
npm install
```

⏱️ **Esto tomará 2-5 minutos**. npm descargará e instalará todas las librerías necesarias.

---

## 🎯 Paso 3: Iniciar la Aplicación

```bash
npm run dev
```

Verás algo como:

```
  VITE v7.2.4  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

## 🌐 Paso 4: Abrir en el Navegador

Abre tu navegador y ve a: **http://localhost:5173/**

**¡Listo! La aplicación está corriendo** 🎉

---

## 🛠️ Comandos Útiles

```bash
# Desarrollo (con hot-reload)
npm run dev

# Compilar para producción
npm run build

# Vista previa del build
npm run preview

# Revisar código (linter)
npm run lint
```

---

## 🏗️ Estructura Básica

```
osi-plus/
├── src/
│   ├── components/     # Componentes React
│   ├── data/          # Datos y constantes
│   └── App.tsx        # Aplicación principal
├── public/            # Archivos estáticos
└── package.json       # Dependencias
```

---

## 📝 Hacer tu Primer Cambio

1. **Abre el proyecto en tu editor** (recomendado: VS Code)

2. **Edita un archivo**, por ejemplo `src/App.tsx`

3. **Guarda el archivo** - La aplicación se recargará automáticamente

4. **Verifica los cambios** en el navegador

---

## 🆘 ¿Algo no funciona?

### Error: "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "Port 5173 is already in use"
```bash
# Usa otro puerto
npm run dev -- --port 3000
```

### Otros problemas
Consulta la [Guía Completa (CONTRIBUTING.md)](./CONTRIBUTING.md)

---

## 📚 Próximos Pasos

- Lee el [README.md](./README.md) para conocer todas las características
- Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para flujo de trabajo completo
- Explora los componentes en `src/components/`
- Revisa los módulos disponibles en la aplicación

---

## 📞 Soporte

¿Necesitas ayuda? 

- Revisa la documentación
- Contacta al equipo de desarrollo
- Crea un issue en GitHub

---

**¡Feliz desarrollo! 🚀**

International Packers SRL - OSi-plus V7
