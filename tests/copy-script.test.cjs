const test = require('node:test');
const assert = require('node:assert/strict');
if (process.env.RUN_MYSQL_INTEGRATION === '1' && /^estatletico_test_/.test(process.env.MYSQL_DATABASE || '')) process.env.MYSQL_DATABASE += '_copy';
const mysql = require('mysql2/promise');
const config = require('../server/config.cjs');
const schema = require('../database/schema.cjs');
const connections = require('../database/connections.cjs');
const { findMysql } = require('../database/records.cjs');
test('cópia completa em MySQL isolado: origem somente leitura, reexecução sem duplicar, conflito local preservado', { skip: process.env.RUN_MYSQL_INTEGRATION !== '1' }, async () => {
  assert.match(process.env.MYSQL_DATABASE || '', /^estatletico_test_/);
  assert.notEqual(Number(process.env.MYSQL_PORT), 3306);
  const admin = await mysql.createConnection(config.mysqlOptions(false));
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${schema.mq(process.env.MYSQL_DATABASE)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs`);
  await admin.end();
  const tables = config.tables.map(name => ({ name, pk: ['id'], columns: [
    { column_name: 'id', udt_name: 'int8', mysqlType: 'BIGINT', is_nullable: 'NO' },
    { column_name: 'nome', udt_name: 'text', mysqlType: 'LONGTEXT', is_nullable: 'YES' }
  ], indexes: [], constraints: [] }));
  const source = new Map(tables.map(t => [t.name, [{ id: '1', nome: 'Dado original' }, { id: '2', nome: null }]]));
  const log = [];
  let cursor, fetched;
  const pg = { end: async () => {}, query: async sql => {
    log.push(sql);
    if (/^(BEGIN|ROLLBACK|CLOSE)/.test(sql)) return { rows: [] };
    if (sql.startsWith('SELECT count')) return { rows: [{ count: '2' }] };
    if (sql.startsWith('DECLARE')) { cursor = /FROM public\."([^"]+)"/.exec(sql)[1]; fetched = false; return { rows: [] }; }
    if (sql.startsWith('FETCH')) { const rows = fetched ? [] : source.get(cursor); fetched = true; return { rows }; }
    throw new Error('Origem recebeu comando inesperado: ' + sql);
  } };
  const originalPg = connections.openPg, originalDiscover = schema.discover, args = process.argv;
  let db;
  try {
    connections.openPg = async () => pg;
    schema.discover = async () => ({ version: 1, tables: structuredClone(tables), views: [], materializedViews: [], routines: [], triggers: [], warnings: [] });
    process.argv = ['node', 'copy'];
    const { main } = require('../scripts/copy-supabase-to-mysql.cjs');
    await main();
    db = await connections.openMysql();
    await db.query('UPDATE jogos SET nome=? WHERE id=?', ['Alteração local preservada', '1']);
    await main();
    assert.equal((await findMysql(db, tables.find(t => t.name === 'jogos'), { id: '1' })).nome, 'Alteração local preservada');
    for (const t of tables) assert.equal(Number((await db.query(`SELECT count(*) AS total FROM ${schema.mq(t.name)}`))[0][0].total), 2);
    assert.ok(log.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
    assert.ok(!log.some(sql => /^(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)/.test(sql)));
    assert.equal(schema.readManifest().ready, true);
  } finally { connections.openPg = originalPg; schema.discover = originalDiscover; process.argv = args; if (db) await db.end(); }
});
