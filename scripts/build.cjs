'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, source, publicConfig } = require('../server/config.cjs');
const assets = ['index.html', 'style.css', 'app.js', 'settings.js', 'page-visits.js', 'player-autofill-utils.js', 'dashboard-rank-utils.js', 'game-csv-import.js', 'data-provider.js', 'data-sync-utils.js', 'favicon.svg', 'favicon.png.png'];
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(dist, file));
fs.writeFileSync(path.join(dist, 'runtime-config.js'), `window.ESTATLETICO_CONFIG = ${JSON.stringify(publicConfig())};\n`);

// Cache-bust de scripts/CSS no HTML publicado para o Netlify não servir JS antigo.
const hashed = ['style.css', 'app.js', 'settings.js', 'page-visits.js', 'player-autofill-utils.js', 'dashboard-rank-utils.js', 'game-csv-import.js', 'runtime-config.js', 'data-provider.js', 'data-sync-utils.js'];
const versions = Object.fromEntries(hashed.map(file => {
    const body = fs.readFileSync(path.join(dist, file));
    return [file, crypto.createHash('sha1').update(body).digest('hex').slice(0, 10)];
}));
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const [file, ver] of Object.entries(versions)) {
    html = html.replaceAll(`src="${file}"`, `src="${file}?v=${ver}"`);
    html = html.replaceAll(`href="${file}"`, `href="${file}?v=${ver}"`);
}
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log(`Build estático: dist/ (DATA_SOURCE=${source}). Modo MySQL: prefira npm start e http://127.0.0.1:8000.`);
