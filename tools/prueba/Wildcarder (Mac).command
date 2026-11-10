#!/bin/bash
# Doble clic para abrir Wildcarder. Cierra esta ventana para pararlo.
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 server/server.py
fi
echo "Wildcarder necesita Python 3."
echo "Si macOS te ofrece instalar las herramientas de desarrollo, acepta y vuelve a abrir este archivo."
read -n 1 -s -r -p "Pulsa una tecla para cerrar..."
