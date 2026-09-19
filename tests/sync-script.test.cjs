const test = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../database/records.cjs');
test('script completo: dry-run não escreve; execução real insere/atualiza, pula conflitos e é repetível', async () => {
  const t = { name: 'jogos', pk: ['id'], columns: [{ column_name: 'id', udt_name: 'int8' }, { column_name: 'nome', udt_name: 'text' }] };
  const local = [{ id: '1', nome: 'Novo' }, { id: '2', nome: 'Editado local' }, { id: '3', nome: 'Igual' }, { id: '4', nome: 'Conflito local' }, { id: '5', nome: 'Original' }];
  const remote = new Map([['2', { id: '2', nome: 'Original' }], ['3', local[2]], ['4', { id: '4', nome: 'Editado remoto' }], ['5', { id: '5', nome: 'Editado remoto' }]]);
  const baselines = new Map(['2', '3', '4', '5'].map(id => {
    const h = hash(t, id === '3' ? local[2] : { id, nome: 'Original' });
    return [id, { row_hash: h, remote_hash: h }];
  }));
  const log = [], myWrites = [], pgWrites = [];
  const db = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, end: async () => {}, query: async (sql, values = []) => {
    log.push(sql);
    if (sql.startsWith('SET TRANSACTION')) return [[]];
    if (sql.startsWith('SELECT `id` AS `id`,`nome` AS `nome`')) return [values[1] ? [] : local];
    if (sql.startsWith('SELECT row_hash')) return [[baselines.get(JSON.parse(values[1])[0])].filter(Boolean)];
    if (sql.startsWith('SELECT COUNT')) return [[{ total: baselines.size }]];
    if (sql.startsWith('INSERT INTO _estatletico_baseline')) {
      myWrites.push(sql); baselines.set(JSON.parse(values[1])[0], { row_hash: values[2], remote_hash: values[3] }); return [[]];
    }
    throw new Error('MySQL inesperado: ' + sql);
  } };
  const pg = { end: async () => {}, query: async (sql, values = []) => {
    log.push(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|LOCK TABLE|SET LOCAL)/.test(sql)) return { rows: [] };
    if (sql.startsWith('SELECT')) return { rows: values.map(value => remote.get(String(value))).filter(Boolean) };
    if (sql.startsWith('INSERT')) { pgWrites.push(sql); const stored = { id: String(values[0]), nome: values[1] }; remote.set(String(values[0]), stored); return { rows: [stored] }; }
    throw new Error('PG inesperado: ' + sql);
  } };
  const connections = require('../database/connections.cjs'), schema = require('../database/schema.cjs');
  const oldConnections = { ...connections }, oldRead = schema.readManifest, oldArgv = process.argv, oldExit = process.exitCode;
  try {
    Object.assign(connections, { openPg: async () => pg, openMysql: async () => db, lock: async () => {}, batchSize: () => 100 });
    schema.readManifest = () => ({ ready: true, tables: [t] });
    const { main } = require('../scripts/sync-mysql-to-supabase.cjs');
    process.argv = ['node', 'sync', '--dry-run'];
    await main();
    assert.equal(myWrites.length, 0);
    assert.equal(pgWrites.length, 0);
    assert.ok(log.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
    assert.ok(!log.some(sql => /^(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)/.test(sql)));
    process.argv = ['node', 'sync', '--yes'];
    await main();
    assert.equal(pgWrites.length, 2);
    assert.ok(pgWrites.every(sql => sql.includes('ON CONFLICT ("id") DO UPDATE')));
    assert.equal(remote.get('1').nome, 'Novo');
    assert.equal(remote.get('2').nome, 'Editado local');
    assert.equal(remote.get('4').nome, 'Editado remoto');
    assert.equal(remote.get('5').nome, 'Editado remoto');
    await main();
    assert.equal(pgWrites.length, 2, 'Reexecução não duplica nem regrava registros iguais');
    assert.ok(!log.some(sql => /^(DELETE|DROP|TRUNCATE)/.test(sql)));
  } finally { Object.assign(connections, oldConnections); schema.readManifest = oldRead; process.argv = oldArgv; process.exitCode = oldExit; }
});
