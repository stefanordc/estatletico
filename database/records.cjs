'use strict';
const crypto = require('node:crypto');
const JSONbig = require('json-bigint')({ useNativeBigInt: true });
const { mq, pq, mysqlName, mysqlColumn } = require('./schema.cjs');
const isJSON = c => c.data_type === 'ARRAY' || ['json', 'jsonb'].includes(c.udt_name);
function stable(value) {
  if (value === null || typeof value !== 'object') return JSONbig.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}
function canonical(c, v) {
  if (v === null || v === undefined) return null;
  if (isJSON(c)) return stable(typeof v === 'string' ? JSONbig.parse(v) : v);
  if (c.udt_name === 'bool') return v === true || v === 1 || v === '1' || v === 't' || v === 'true' ? 'true' : 'false';
  if (c.udt_name === 'bytea') return Buffer.isBuffer(v) ? v.toString('hex') : String(v).replace(/^\\x/, '');
  if (['timestamp', 'timestamptz', 'time'].includes(c.udt_name)) return String(v).replace('T', ' ').replace(/(?:Z|\+00(?::00)?)$/, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  if (c.udt_name === 'numeric') return String(v).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (['float4', 'float8'].includes(c.udt_name)) return Number(v).toString();
  return String(v);
}
function hash(t, row) {
  return crypto.createHash('sha256').update(stable(Object.fromEntries(t.columns.map(c => [c.column_name, canonical(c, row[c.column_name])])))).digest('hex');
}
const key = (t, row) => stable(t.pk.map(n => String(row[n])));
function toMysql(c, value) {
  if (value === null || value === undefined) return null;
  if (isJSON(c)) return typeof value === 'string' ? value : JSONbig.stringify(value);
  if (c.udt_name === 'bool') return canonical(c, value) === 'true' ? 1 : 0;
  if (c.udt_name === 'bytea') return Buffer.isBuffer(value) ? value : Buffer.from(String(value).replace(/^\\x/, ''), 'hex');
  if (['timestamp', 'timestamptz'].includes(c.udt_name)) {
    const text = String(value).replace('T', ' ').replace(/(?:Z|\+00(?::00)?)$/, '');
    if (!/^\d{4}-\d\d-\d\d /.test(text) || Number(text.slice(0, 4)) < 1000) throw new Error(`Timestamp fora da faixa MySQL: ${c.column_name}`);
    return text;
  }
  return value;
}
function toPg(c, value) {
  if (value === null || value === undefined) return null;
  if (c.data_type === 'ARRAY') {
    const convert = v => Array.isArray(v) ? v.map(convert) : v && typeof v === 'object' && typeof v.toFixed === 'function' ? v.toString() : v;
    return convert(typeof value === 'string' ? JSONbig.parse(value) : value);
  }
  if (c.udt_name === 'bool') return canonical(c, value) === 'true';
  if (c.udt_name === 'timestamptz') return String(value).replace(' ', 'T') + 'Z';
  return value;
}
function projection(t) {
  return t.columns.map(c => `${c.data_type === 'ARRAY' ? `to_json(${pq(c.column_name)})` : pq(c.column_name)}::text AS ${pq(c.column_name)}`).join(',');
}
async function findMysql(db, t, row, lock = false) {
  const stored = (await db.query(`SELECT * FROM ${mq(t.name)} WHERE ${t.pk.map(n => `${mq(mysqlColumn(t, n))}=?`).join(' AND ')}${lock ? ' FOR UPDATE' : ''}`, t.pk.map(n => row[n])))[0][0];
  return stored && fromMysql(t, stored);
}
function fromMysql(t, row) {
  return Object.fromEntries(t.columns.map(c => [c.column_name, row[mysqlName(c)]]));
}
function mysqlProjection(t) {
  return t.columns.map(c => `${mq(mysqlName(c))} AS ${mq(c.column_name)}`).join(',');
}
async function putMysql(db, t, row, exists) {
  const cols = t.columns.filter(c => Object.hasOwn(row, c.column_name));
  const values = cols.map(c => toMysql(c, row[c.column_name]));
  if (exists) {
    const nonPK = cols.filter(c => !t.pk.includes(c.column_name));
    if (!nonPK.length) return;
    await db.query(`UPDATE ${mq(t.name)} SET ${nonPK.map(c => `${mq(mysqlName(c))}=?`)} WHERE ${t.pk.map(n => `${mq(mysqlColumn(t, n))}=?`).join(' AND ')}`,
      [...nonPK.map(c => toMysql(c, row[c.column_name])), ...t.pk.map(n => row[n])]);
  } else await db.query(`INSERT INTO ${mq(t.name)} (${cols.map(c => mq(mysqlName(c)))}) VALUES (${cols.map(() => '?')})`, values);
}
async function initMetadata(db) {
  await db.query('CREATE TABLE IF NOT EXISTS _estatletico_baseline (table_name VARCHAR(64) NOT NULL, record_key VARCHAR(700) NOT NULL, row_hash CHAR(64) NOT NULL, remote_hash CHAR(64) NOT NULL, PRIMARY KEY(table_name,record_key)) ENGINE=InnoDB');
}
async function baseline(db, t, row) {
  return (await db.query('SELECT row_hash, remote_hash FROM _estatletico_baseline WHERE table_name=? AND record_key=?', [t.name, key(t, row)]))[0][0];
}
async function setBaseline(db, t, row, rowHash, remoteHash) {
  const localHash = rowHash || hash(t, row);
  await db.query('INSERT INTO _estatletico_baseline(table_name,record_key,row_hash,remote_hash) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE row_hash=VALUES(row_hash),remote_hash=VALUES(remote_hash)', [t.name, key(t, row), localHash, remoteHash || localHash]);
}
function classify(localHash, remoteHash, baseHash, baseRemoteHash = baseHash) {
  if (localHash === remoteHash) return 'equal';
  if (baseHash && localHash === baseHash) return 'remoteOnly';
  if (!remoteHash) return baseHash ? 'conflict' : 'new';
  if (!baseHash || remoteHash !== baseRemoteHash) return 'conflict';
  return 'changed';
}
module.exports = { isJSON, stable, canonical, hash, key, toMysql, toPg, projection, mysqlProjection, fromMysql, findMysql, putMysql, initMetadata, baseline, setBaseline, classify };
