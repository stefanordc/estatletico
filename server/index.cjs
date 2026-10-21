'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, source, port, publicConfig } = require('./config.cjs');
const { openMysql, lock, unlock } = require('../database/connections.cjs');
const { readManifest } = require('../database/schema.cjs');
const { execute } = require('../database/repository.cjs');
const assets = new Set(['index.html', 'app.js', 'settings.js', 'page-visits.js', 'data-provider.js', 'data-sync-utils.js', 'player-autofill-utils.js', 'dashboard-rank-utils.js', 'game-csv-import.js', 'style.css', 'favicon.svg', 'favicon.png.png']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const email = 'stefanobrunofaria@gmail.com';
const sessions = new Map(), streams = new Set();
const origin = `http://127.0.0.1:${port}`;
const origins = new Set([origin, `http://localhost:${port}`]);
const password = process.env.LOCAL_ADMIN_PASSWORD;
if (source === 'mysql' && (!password || password.length < 12)) throw new Error('Defina LOCAL_ADMIN_PASSWORD com pelo menos 12 caracteres no .env.');
const salt = crypto.randomBytes(32);
const passwordHash = source === 'mysql' ? crypto.scryptSync(password, salt, 64) : null;
let failedLogins = 0, blockedUntil = 0;
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  if (req.headers['content-type'] !== 'application/json' || req.headers['x-estatletico-local'] !== '1') throw new Error('Requisição inválida.');
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw new Error('Lote excede 32 MB.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function session(req) {
  const token = /(?:^|;\s*)estatletico_local=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const entry = token && sessions.get(token);
  if (!entry || entry.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return { token, user: { id: 'local-admin', email }, expires_at: Math.floor(entry.expires / 1000) };
}
const server = http.createServer(async (req, res) => {
  try {
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return json(res, 403, { error: { message: 'Host não permitido.' } });
    if (req.headers.origin && !origins.has(req.headers.origin)) return json(res, 403, { error: { message: 'Use o site local na mesma origem da API.' } });
    const url = new URL(req.url, origin);
    if (url.pathname === '/runtime-config.js') {
      res.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' });
      return res.end(`window.ESTATLETICO_CONFIG = ${JSON.stringify(publicConfig())};`);
    }
    if (!url.pathname.startsWith('/api/')) {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (req.method !== 'GET' || !assets.has(file)) return json(res, 404, { error: { message: 'Não encontrado.' } });
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(path.join(root, file)).pipe(res);
    }
    if (source !== 'mysql') return json(res, 409, { error: { message: 'API MySQL desativada por DATA_SOURCE.' } });
    if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { data: { session: session(req) }, error: null });
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (Date.now() < blockedUntil) return json(res, 429, { error: { message: 'Aguarde um minuto antes de tentar novamente.' } });
      const credentials = await body(req);
      const valid = typeof credentials.password === 'string' && credentials.password.length <= 1024 && crypto.timingSafeEqual(crypto.scryptSync(credentials.password, salt, 64), passwordHash);
      if (!valid || String(credentials.email).trim().toLowerCase() !== email) {
        if (++failedLogins >= 5) { blockedUntil = Date.now() + 60000; failedLogins = 0; }
        return json(res, 401, { error: { message: 'Use o e-mail do administrador e a senha local definida no .env.' } });
      }
      failedLogins = 0;
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { expires: Date.now() + 8 * 3600000 });
      res.setHeader('Set-Cookie', `estatletico_local=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return json(res, 200, { data: { session: { user: { id: 'local-admin', email } } }, error: null });
    }
    const auth = session(req);
    if (!auth) return json(res, 401, { error: { message: 'Entre com a senha local.' } });
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      await body(req); sessions.delete(auth.token);
      for (const stream of streams) if (stream.token === auth.token) { stream.res.end(); streams.delete(stream); }
      res.setHeader('Set-Cookie', 'estatletico_local=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, 200, { data: { session: null }, error: null });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      const stream = { res, token: auth.token }; streams.add(stream);
      const timer = setInterval(() => {
        if (!session(req)) return res.end();
        res.write(': heartbeat\n\n');
      }, 30000);
      req.on('close', () => { clearInterval(timer); streams.delete(stream); });
      return;
    }
    if (url.pathname === '/api/query' && req.method === 'POST') {
      const spec = await body(req), manifest = readManifest();
      if (!manifest.ready) throw new Error('Cópia incompleta. Execute npm run db:copy.');
      const db = await openMysql();
      let result;
      try {
        if (spec.action !== 'select') { await lock(db); await db.beginTransaction(); }
        result = await execute(db, spec, manifest);
        if (spec.action !== 'select') await db.commit();
      } catch (error) { await db.rollback().catch(() => {}); throw error; }
      finally { if (spec.action !== 'select') await unlock(db).catch(() => {}); await db.end(); }
      for (const event of result.events) for (const stream of streams) if (sessions.get(stream.token)?.expires > Date.now()) stream.res.write(`data: ${JSON.stringify(event)}\n\n`);
      return json(res, 200, { data: result.data, error: null });
    }
    json(res, 404, { error: { message: 'Rota não encontrada.' } });
  } catch (error) {
    console.error('API:', error.code || error.message);
    if (!res.headersSent) json(res, 400, { error: { message: error.code ? `Falha no banco (${error.code}). Consulte o terminal.` : error.message } });
    else res.end();
  }
});
(async () => {
  if (source === 'mysql') {
    if (!readManifest().ready) throw new Error('Cópia incompleta. Execute npm run db:copy antes de iniciar.');
    const db = await openMysql();
    try { await db.query('SELECT 1'); } finally { await db.end(); }
  }
  server.listen(port, '127.0.0.1', () => console.log(`Estatlético: ${origin} — DATA_SOURCE=${source}`));
})().catch(error => { console.error('Inicialização interrompida:', error.code || error.message); process.exitCode = 1; });
