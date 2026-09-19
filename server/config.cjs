'use strict';
// O arquivo local do projeto é a fonte de configuração da contingência.
// Isso evita uma variável MYSQL_PASSWORD antiga no Windows substituir a
// conexão validada no Workbench.
require('dotenv').config({ quiet: true, override: true });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = process.env.DATA_SOURCE || 'mysql';
if (!['mysql', 'supabase'].includes(source)) throw new Error('DATA_SOURCE deve ser mysql ou supabase');
const tables = ['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'];
const port = Number(process.env.PORT || 8000);
function mysqlOptions(database = true) {
  return { host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    ...(database ? { database: process.env.MYSQL_DATABASE || 'estatletico' } : {}),
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true, supportBigNumbers: true,
    bigNumberStrings: true, jsonStrings: true, multipleStatements: false };
}
function pgOptions() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('Configure SUPABASE_DB_URL no .env; nenhuma cópia foi executada.');
  const url = new URL(process.env.SUPABASE_DB_URL);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true, ...(process.env.SUPABASE_SSL_CA ? { ca: fs.readFileSync(process.env.SUPABASE_SSL_CA, 'utf8') } : {}) } };
}
function publicConfig() {
  const databaseIdentity = source === 'mysql' ? [process.env.MYSQL_HOST || '127.0.0.1', process.env.MYSQL_PORT || '3306', process.env.MYSQL_DATABASE || 'estatletico'].join(':') : process.env.SUPABASE_URL || 'original';
  return { dataSource: source, apiUrl: process.env.PUBLIC_API_URL || '',
    cacheNamespace: crypto.createHash('sha256').update(databaseIdentity).digest('hex').slice(0, 16),
    supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' };
}
function sourceFingerprint() {
  if (!process.env.SUPABASE_DB_URL) return null;
  const url = new URL(process.env.SUPABASE_DB_URL);
  const ref = /^db\.([^.]+)\.supabase\.co$/.exec(url.hostname)?.[1]
    || /^postgres\.([^.]+)$/.exec(decodeURIComponent(url.username))?.[1];
  return crypto.createHash('sha256').update(ref ? `supabase:${ref}:${url.pathname}` : `${url.hostname}:${url.port}:${url.username}:${url.pathname}`).digest('hex');
}
module.exports = { root, source, tables, port, mysqlOptions, pgOptions, publicConfig, sourceFingerprint };
