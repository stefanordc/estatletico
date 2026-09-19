'use strict';
const { Client } = require('pg');
const mysql = require('mysql2/promise');
const { pgOptions, mysqlOptions } = require('../server/config.cjs');
async function openPg() {
  const db = new Client(pgOptions());
  await db.connect();
  await db.query("SET TIME ZONE 'UTC'");
  await db.query("SET DateStyle='ISO, YMD'");
  await db.query("SET bytea_output='hex'");
  return db;
}
async function openMysql() {
  const db = await mysql.createConnection(mysqlOptions());
  await db.query("SET time_zone='+00:00'");
  await db.query("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,NO_BACKSLASH_ESCAPES'");
  // Prepared statements: não depender de escapes textuais, especialmente com
  // NO_BACKSLASH_ESCAPES e fotos/JSON contendo aspas e barras.
  const rawQuery = db.query.bind(db);
  db.query = (sql, values) => Array.isArray(values) && values.length ? db.execute(sql, values) : rawQuery(sql);
  return db;
}
async function lock(db) {
  const [rows] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(),':estatletico'),10) AS acquired");
  if (Number(rows[0].acquired) !== 1) throw new Error('Outro processo está alterando/sincronizando o MySQL. Tente novamente após concluir.');
}
async function unlock(db) { await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':estatletico'))"); }
function batchSize() {
  const size = Number(process.env.MIGRATION_BATCH_SIZE || 100);
  if (!Number.isInteger(size) || size < 1 || size > 1000) throw new Error('MIGRATION_BATCH_SIZE deve estar entre 1 e 1000');
  return size;
}
module.exports = { openPg, openMysql, lock, unlock, batchSize };
