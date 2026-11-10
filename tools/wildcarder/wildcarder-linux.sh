#!/bin/sh
# Abre Wildcarder. Cierra la terminal o pulsa Ctrl+C para pararlo.
cd "$(dirname "$0")" && exec python3 server/server.py "$@"
