#!/bin/bash
# Script de configuración para GitHub - OSi-plus V7

echo "=========================================="
echo "Configuración de GitHub para OSi-plus V7"
echo "=========================================="
echo ""

# Verificar si se proporcionó el nombre de usuario de GitHub
if [ -z "$1" ]; then
    echo "Uso: ./github-setup.sh <tu-usuario-github> [nombre-repo]"
    echo ""
    echo "Ejemplo:"
    echo "  ./github-setup.sh miusuario osi-plus-v7"
    echo ""
    exit 1
fi

GITHUB_USER=$1
REPO_NAME=${2:-"osi-plus-v7"}

echo "Configurando repositorio remoto..."
echo "Usuario GitHub: $GITHUB_USER"
echo "Nombre del repo: $REPO_NAME"
echo ""

# Configurar el remote origin
git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"

if [ $? -eq 0 ]; then
    echo "✓ Remote 'origin' configurado correctamente"
    echo ""
    echo "=========================================="
    echo "Próximos pasos:"
    echo "=========================================="
    echo ""
    echo "1. Crea el repositorio en GitHub:"
    echo "   https://github.com/new"
    echo ""
    echo "   - Nombre: $REPO_NAME"
    echo "   - Descripción: OSi-plus V7 - ERP System for International Packers SRL"
    echo "   - Público o Privado (según prefieras)"
    echo "   - NO inicializar con README (ya existe)"
    echo ""
    echo "2. Luego ejecuta:"
    echo "   git push -u origin main"
    echo ""
    echo "=========================================="
else
    echo "✗ Error al configurar el remote"
    exit 1
fi
