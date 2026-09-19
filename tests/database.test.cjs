const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { classify, hash, toMysql, toPg } = require('../database/records.cjs');
const { mysqlType, createSQL } = require('../database/schema.cjs');
const { validate } = require('../database/repository.cjs');
const column = (name, type, extra = {}) => ({ column_name: name, udt_name: type, data_type: type, is_nullable: 'YES', ...extra });
const t = { name: 'jogos', pk: ['id'], columns: [column('id', 'int8'), column('ativo', 'bool'), column('dados', 'jsonb'), column('data', 'timestamptz'), column('valor', 'numeric')], constraints: [], indexes: [] };
test('sincronização detecta novos, edições, conflitos, remoção remota e alterações só na origem', () => {
  assert.equal(classify('a', undefined, undefined), 'new');
  assert.equal(classify('b', 'a', 'a'), 'changed');
  assert.equal(classify('a', 'a', 'a'), 'equal');
  assert.equal(classify('b', 'c', 'a'), 'conflict');
  assert.equal(classify('a', 'b', 'a'), 'remoteOnly');
  assert.equal(classify('b', undefined, 'a'), 'conflict');
  assert.equal(classify('a', 'b', undefined), 'conflict');
  assert.equal(classify('b', 'server-time', 'a', 'server-time'), 'changed');
});
test('hash preserva bigint, precisão JSON, booleanos, NULL e microssegundos em UTC', () => {
  const pg = { id: '9007199254740993', ativo: 'true', dados: '{"b":9007199254740993,"a":null}', data: '2026-01-01 12:00:00.123456+00', valor: '1234.5000' };
  const my = { ...pg, ativo: 1, dados: '{"a":null,"b":9007199254740993}', data: '2026-01-01 12:00:00.123456', valor: '1234.50' };
  assert.equal(hash(t, pg), hash(t, my));
  assert.notEqual(hash(t, pg), hash(t, { ...my, dados: '{"a":null,"b":9007199254740992}' }));
  assert.notEqual(hash(t, pg), hash(t, { ...my, data: '2026-01-01 12:00:00.123457' }));
  assert.equal(toMysql(column('data', 'timestamptz'), pg.data), my.data);
  assert.equal(toPg(column('data', 'timestamptz'), my.data), '2026-01-01T12:00:00.123456Z');
  assert.equal(toMysql(column('b', 'bool'), 'false'), 0);
  assert.equal(toMysql(column('b', 'bool'), null), null);
});
test('conversão exige tipos exatos, mapeia arrays/UUID/identity e falha em tipos desconhecidos', () => {
  assert.equal(mysqlType(column('a', '_int8', { data_type: 'ARRAY' })), 'JSON');
  assert.equal(mysqlType(column('a', 'uuid')), 'CHAR(36)');
  assert.equal(mysqlType(column('a', 'numeric', { numeric_precision: 20, numeric_scale: 6 })), 'DECIMAL(20,6)');
  assert.throws(() => mysqlType(column('a', 'numeric')), /limites/);
  assert.throws(() => mysqlType(column('a', 'geography')), /não suportado/);
  const sql = createSQL({ ...t, columns: [{ ...t.columns[0], mysqlType: 'BIGINT', auto: true }] });
  assert.match(sql, /AUTO_INCREMENT/);
  assert.match(sql, /PRIMARY KEY/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|DELETE/);
});
test('API rejeita injeções, exclusões em massa, colunas desconhecidas e limites inválidos', () => {
  const manifest = { tables: [t] };
  const good = { table: 'jogos', action: 'select', columns: 'id', filters: [{ op: 'eq', column: 'id', value: "1' OR 1=1" }] };
  const compiled = validate(good, manifest);
  assert.ok(!compiled.sql.includes("1' OR"));
  assert.equal(compiled.values[0], "1' OR 1=1");
  assert.throws(() => validate({ ...good, table: 'auth.users' }, manifest));
  assert.throws(() => validate({ ...good, columns: 'id; DROP TABLE jogos' }, manifest));
  assert.throws(() => validate({ ...good, limit: 1001 }, manifest));
  assert.throws(() => validate({ ...good, action: 'delete', filters: [] }, manifest));
  assert.throws(() => validate({ ...good, action: 'upsert', rows: [{ id: 1, password: 'x' }] }, manifest));
});
test('provider mysql nunca inicializa Supabase e mantém filtros e paginação', async () => {
  const calls = [];
  const window = { ESTATLETICO_CONFIG: { dataSource: 'mysql', apiUrl: '' }, supabase: { createClient() { throw new Error('Supabase acessado!'); } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data-provider.js'), 'utf8'), { window, location: { origin: 'http://127.0.0.1:8000' }, fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ data: [], error: null }) };
  } });
  const client = window.EstatleticoData.createClient('remote', 'secret');
  await client.from('jogos').select('id').eq('id', 3).range(20, 29);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, '/api/query');
  assert.equal(request.offset, 20);
  assert.equal(request.limit, 10);
  assert.equal(request.filters[0].value, 3);
  assert.match(window.EstatleticoData.cacheKey, /mysql/);
});
test('provider supabase preserva cliente original e nenhuma API MySQL é chamada', () => {
  const original = {};
  const window = { ESTATLETICO_CONFIG: { dataSource: 'supabase' }, supabase: { createClient: () => original } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data-provider.js'), 'utf8'), { window, location: { origin: 'https://site.example' }, fetch() { throw new Error('API local acessada'); } });
  assert.equal(window.EstatleticoData.createClient('url', 'key'), original);
});
