#!/bin/sh
# Une los archivos de src/ en index.html y mapas-mentales.html
cd "$(dirname "$0")"
cat src/1-head.html src/2-body.html src/3-core.js src/4-interact.js src/5-ui.js src/6-app.js > index.html
cp index.html mapas-mentales.html
echo "Generados index.html y mapas-mentales.html"
