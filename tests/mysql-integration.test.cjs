const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { mysqlOptions } = require('../server/config.cjs');
const { openMysql } = require('../database/connections.cjs');
const { mq, mysqlType, createSQL, manifestPath } = require('../database/schema.cjs');
const { initMetadata, putMysql, findMysql, hash, setBaseline, baseline } = require('../database/records.cjs');
const { execute } = require('../database/repository.cjs');
const { installPlayerTriggers } = require('../database/player-triggers.cjs');
const column = (name, type, extra = {}) => {
  const c = { column_name: name, udt_name: type, data_type: type, is_nullable: 'YES', ...extra };
  c.mysqlType = mysqlType(c); return c;
};
const textColumns = list => list.split(',').map(n => column(n, 'text'));
const table = (name, columns) => ({ name, pk: ['id'], columns: [column('id', 'int8', { is_nullable: 'NO' }), ...columns], constraints: [], indexes: [] });
test('MySQL real isolado: tipos, FK, trigger, CRUD, autenticação e proteção de arquivos', { skip: process.env.RUN_MYSQL_INTEGRATION !== '1' }, async () => {
  assert.match(process.env.MYSQL_DATABASE || '', /^estatletico_test_/);
  assert.notEqual(Number(process.env.MYSQL_PORT || 3306), 3306);
  const admin = await mysql.createConnection(mysqlOptions(false));
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${mq(process.env.MYSQL_DATABASE)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs`);
  await admin.end();
  const db = await openMysql();
  const jogadores = table('jogadores', [...textColumns('temporada,nome_completo,nome_guerra,posicao,nacionalidade,numero,foto,observacao'), column('nascimento', 'date'), column('id_jogador', 'int8')]);
  const jogos = table('jogos', [...textColumns('temporada,casa,fora,campeonato,fase,estadio,arbitro,tecnicoGalo,tecnicoAdv,observacao,horario,penaltis'), column('data', 'date'),
    ...['golsCasa','golsFora','publico','adversarioId','gcFavorCount','penaltisCasa','penaltisFora'].map(n => column(n, 'int8')),
    column('renda', 'numeric', { numeric_precision: 20, numeric_scale: 6 }), column('portoesFechados', 'bool'),
    ...['lineupGalo','cartoesGalo','cartoesAdv','gcFavorList'].map(n => column(n, 'jsonb'))]);
  jogos.constraints.push({ type: 'f', name: 'test_adv_fk', columns: ['adversarioId'], refTable: 'adversarios', refColumns: ['id'], onUpdate: 'a', onDelete: 'a' });
  const types = table('test_types', [column('uuid', 'uuid'), column('big', 'int8'), column('data', 'date'), column('stamp', 'timestamptz'), column('clock', 'time'), column('bool', 'bool'), column('json', 'jsonb'), column('array', '_int8', { data_type: 'ARRAY' }), column('bytes', 'bytea'), column('money', 'numeric', { numeric_precision: 30, numeric_scale: 8 }), column('texto', 'text')]);
  const manifest = { ready: true, testFixture: true, tables: [
    table('adversarios', textColumns('clube,estado,pais,escudo')), table('estadios', textColumns('nome,estado,pais,mandante,foto')),
    table('competicoes', textColumns('campeonato,tipo')), table('arbitros', textColumns('nome,federacao,foto')), jogadores, jogos, types
  ], triggers: [{ event_object_table: 'jogadores', action_statement: 'EXECUTE FUNCTION set_id_jogador()' }] };
  let server;
  try {
    for (const t of manifest.tables) await db.query(createSQL(t));
    await initMetadata(db);
    await installPlayerTriggers(db, manifest);
    const row = { id: '1', uuid: '123e4567-e89b-12d3-a456-426614174000', big: '9007199254740993', data: '2026-09-06', stamp: '2026-09-06 12:34:56.123456+00', clock: '23:59:59.123456', bool: 'false', json: '{"n":9007199254740993,"null":null}', array: '["9007199254740993",null]', bytes: '\\x00ffab', money: '12345678901234567890.12345678', texto: "Aspas ' e barras \\ preservadas; çã — teste" };
    await putMysql(db, types, row, Boolean(await findMysql(db, types, row)));
    const stored = await findMysql(db, types, row);
    assert.equal(hash(types, stored), hash(types, row));
    await setBaseline(db, types, row);
    assert.equal((await baseline(db, types, row)).row_hash, hash(types, stored));
    const spec = { table: 'jogadores', action: 'upsert', rows: [{ id: 101, nome_completo: 'Atleta de Teste', nome_guerra: 'Teste', nascimento: '1990-01-01', temporada: '2025', posicao: 'Atacante', id_jogador: 101 }] };
    await execute(db, spec, manifest);
    await execute(db, { ...spec, rows: [{ ...spec.rows[0], id: 102, temporada: '2026', id_jogador: 102 }] }, manifest);
    assert.equal((await findMysql(db, jogadores, { id: 102 })).id_jogador, '101');
    const selected = await execute(db, { table: 'jogadores', action: 'select', columns: 'id,nome_guerra', filters: [{ column: 'nome_guerra', op: 'ilike', value: '%tes%' }], order: { column: 'temporada', ascending: false }, limit: 1 }, manifest);
    assert.equal(selected.data[0].id, 102);
    await assert.rejects(() => execute(db, { table: 'jogos', action: 'upsert', rows: [{ id: 999, adversarioId: 9999999 }] }, manifest), { code: 'ER_NO_REFERENCED_ROW_2' });
    await execute(db, { table: 'adversarios', action: 'upsert', rows: [{ id: 201, clube: 'Clube de Teste', estado: 'MG', pais: 'Brasil', escudo: '' }] }, manifest);
    await execute(db, { table: 'competicoes', action: 'upsert', rows: [{ id: 301, campeonato: 'Campeonato de Teste', tipo: 'Nacional' }] }, manifest);
    await execute(db, { table: 'jogos', action: 'upsert', rows: [{ id: 401, temporada: '2026', data: '2026-09-06', casa: 'Atlético', fora: 'Clube de Teste', adversarioId: 201, campeonato: 'Campeonato de Teste', fase: 'Final', estadio: 'Estádio de Teste', arbitro: 'N/I', tecnicoGalo: 'Técnico de Teste', tecnicoAdv: 'Técnico visitante', golsCasa: 0, golsFora: 0, publico: 100, renda: '1000.000000', portoesFechados: false, lineupGalo: [], cartoesGalo: [], cartoesAdv: [], gcFavorList: [], gcFavorCount: 0, penaltis: 'Não' }] }, manifest);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const testPort = 8017;
    server = spawn(process.execPath, ['server/index.cjs'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATA_SOURCE: 'mysql', PORT: String(testPort), LOCAL_ADMIN_PASSWORD: 'fixture-local-password-only' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API de teste não iniciou')), 10000);
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`API terminou: ${code}`)); });
      server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    const base = `http://127.0.0.1:${testPort}`;
    assert.equal((await fetch(base + '/.env')).status, 404);
    assert.equal((await fetch(base + '/server/config.cjs')).status, 404);
    assert.equal((await fetch(base + '/api/query', { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + '/api/session', { headers: { Origin: 'https://attacker.example' } })).status, 403);
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Estatletico-Local': '1' }, body: JSON.stringify({ email: 'stefanobrunofaria@gmail.com', password: 'fixture-local-password-only' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base + '/api/query', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Estatletico-Local': '1' }, body: JSON.stringify({ table: 'jogadores', action: 'select', columns: '*', filters: [], limit: 10 }) });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).data.length >= 2);
    const write = await fetch(base + '/api/query', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Estatletico-Local': '1' }, body: JSON.stringify(spec) });
    assert.equal(write.status, 200);
    const config = await (await fetch(base + '/runtime-config.js')).text();
    assert.match(config, /mysql/);
    assert.doesNotMatch(config, /fixture-local-password-only|MYSQL_PASSWORD|SUPABASE_DB_URL/);
    // Exercita o JavaScript real e a API real em DOM simulado. Não substitui
    // revisão visual em navegador; Chart.js/canvas são simulados neste teste.
    const { JSDOM, VirtualConsole } = require('jsdom');
    const errors = [];
    const console = new VirtualConsole();
    console.on('error', (...args) => errors.push(args.map(v => v?.message || String(v)).join(' ')));
    console.on('jsdomError', error => { if (!/Not implemented/.test(error.message)) errors.push(error.message); });
    const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), { url: base + '/#cadastros/jogadores', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
    try {
      const w = dom.window;
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.Chart = class { static defaults = { font: {} }; constructor(_ctx, opts) { this.data = opts?.data; this.options = opts?.options; } destroy() {} update() {} };
      w.fetch = (url, options = {}) => fetch(new URL(url, base), { ...options, headers: { ...options.headers, Cookie: cookie } });
      w.EventSource = class { close() {} };
      w.eval(config);
      for (const file of ['player-autofill-utils.js', 'data-provider.js', 'app.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      // JSDOM dispara DOMContentLoaded após os scripts síncronos acima.
      const waitFor = async check => {
        const until = Date.now() + 5000;
        while (!check()) { if (Date.now() > until) throw new Error('DOM não terminou de atualizar: ' + errors.join(';')); await new Promise(r => setTimeout(r, 25)); }
      };
      await waitFor(() => w.document.body.classList.contains('app-ready'));
      await waitFor(() => w.document.querySelector('#tab-content')?.textContent.includes('Teste'));
      for (const page of ['dashboard', 'jogos', 'elenco', 'jogadores-page', 'artilheiros', 'estatisticas', 'curiosidades', 'cartoes', 'adversarios', 'arbitragem', 'equipe-arbitragem', 'comparativo', 'novo-jogo']) {
        w.location.hash = '#' + page;
        await new Promise(r => setTimeout(r, 50));
        assert.ok(w.document.querySelector(`#${page}-section`), `Seção ${page} existe`);
        assert.ok(!w.document.querySelector(`#${page}-section`).classList.contains('hidden'), `Seção ${page} foi ativada`);
      }
      assert.deepEqual(errors, []);
    } finally { dom.window.close(); }
  } finally { if (server) server.kill(); await db.end(); }
});
