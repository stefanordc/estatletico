'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root, source, publicConfig } = require('../server/config.cjs');
const assets = ['index.html', 'style.css', 'app.js', 'settings.js', 'page-visits.js', 'player-autofill-utils.js', 'game-csv-import.js', 'data-provider.js', 'data-sync-utils.js', 'favicon.svg', 'favicon.png.png'];
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(root, 'dist', file));
fs.writeFileSync(path.join(root, 'dist/runtime-config.js'), `window.ESTATLETICO_CONFIG = ${JSON.stringify(publicConfig())};\n`);
console.log(`Build estático: dist/ (DATA_SOURCE=${source}). Modo MySQL: prefira npm start e http://127.0.0.1:8000.`);
