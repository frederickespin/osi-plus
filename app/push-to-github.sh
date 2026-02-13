#!/bin/bash
# Script para subir OSi-plus V7 a GitHub
# Repositorio: https://github.com/frederickespin/osi-plus.git

echo "=========================================="
echo "OSi-plus V7 - Subir a GitHub"
echo "=========================================="
echo ""
echo "Repositorio destino:"
echo "https://github.com/frederickespin/osi-plus.git"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: No se encontró package.json"
    echo "Ejecuta este script desde la carpeta raíz del proyecto"
    exit 1
fi

echo "✓ Directorio del proyecto verificado"
echo ""

# Inicializar git si no existe
if [ ! -d ".git" ]; then
    echo "→ Inicializando repositorio git..."
    git init
    git add .
    git commit -m "OSi-plus V7 - Initial commit
    
- ERP system for International Packers SRL
- 25+ modules for different roles
- Corporate design system
- Role-based navigation
- Mobile-responsive workflows"
    echo "✓ Repositorio git inicializado"
else
    echo "✓ Repositorio git ya existe"
fi

echo ""

# Configurar remote
echo "→ Configurando remote origin..."
git remote remove origin 2>/dev/null
git remote add origin https://github.com/frederickespin/osi-plus.git

if [ $? -eq 0 ]; then
    echo "✓ Remote configurado"
else
    echo "❌ Error al configurar remote"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Configuración completada!"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo ""
echo "1. Crea el repositorio en GitHub:"
echo "   https://github.com/new"
echo ""
echo "   - Nombre del repositorio: osi-plus"
echo "   - Descripción: OSi-plus V7 - ERP System"
echo "   - NO marques 'Add a README file'"
echo "   - Clic en 'Create repository'"
echo ""
echo "2. Luego ejecuta:"
echo "   git push -u origin main"
echo ""
echo "3. Si pide autenticación:"
echo "   - Usuario: frederickespin"
echo "   - Contraseña: Usa un Personal Access Token"
echo "   - Crea token en: https://github.com/settings/tokens"
echo ""
echo "=========================================="
