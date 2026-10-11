'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const appSource = () => fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

const sourceBetween = (start, end) => {
  const source = appSource();
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `inicio nao encontrado: ${start}`);
  assert.notEqual(to, -1, `fim nao encontrado: ${end}`);
  return source.slice(from, to);
};

test('autocomplete reaproveita nomes preparados entre teclas sem renormalizar o elenco inteiro', () => {
  const dom = new JSDOM('<input id="fast-club">', { runScripts: 'outside-only' });
  dom.window.__normalizations = 0;
  const source = sourceBetween('const setupAutocomplete = ', 'const openQuickAddModal = ');
  const invalidation = sourceBetween('const markTableDataChanged = ', '// Cache para estatísticas');
  dom.window.eval(`
    const state = { adversarios: Array.from({length: 5000}, (_, i) => ({clube: 'Clube ' + String(i).padStart(4, '0')})) };
    const tableDataVersions = { adversarios: 0 };
    const normalizeString = value => { window.__normalizations++; return String(value || '').toLowerCase(); };
    window._autocompleteFilters = {};
    ${invalidation}
    window.__renameClub = () => { state.adversarios[0].clube = 'Nome atualizado'; markTableDataChanged('adversarios'); };
    ${source}
    setupAutocomplete('fast-club', 'adversarios', 'clube', null, null, false);
  `);
  const input = dom.window.document.getElementById('fast-club');
  input.value = 'cl';
  input.dispatchEvent(new dom.window.Event('input'));
  dom.window.__normalizations = 0;
  input.value = 'clu';
  input.dispatchEvent(new dom.window.Event('input'));
  assert.ok(dom.window.__normalizations < 10, 'nova tecla não deve preparar novamente cinco mil nomes');
  assert.equal(dom.window.document.querySelectorAll('.autocomplete-item').length, 20);
  dom.window.__renameClub();
  input.value = 'Nome atualizado';
  input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(dom.window.document.querySelector('.autocomplete-item').textContent, 'Nome atualizado');
  dom.window.close();
});

test('autocomplete limita o DOM a vinte sugestoes durante a digitacao', () => {
  const dom = new JSDOM('<div><input id="player-filter"></div>', { runScripts: 'outside-only' });
  const players = Array.from({ length: 300 }, (_, index) => ({
    id: index + 1,
    id_jogador: index + 1,
    nome_guerra: `Atleta ${String(index).padStart(3, '0')}`,
    nascimento: '1990-01-01',
    posicao: 'Atacante',
    temporada: '2026'
  }));
  const setupAutocomplete = sourceBetween(
    'const setupAutocomplete = ',
    'const openQuickAddModal = '
  );

  dom.window.eval(`
    const state = { jogadores: ${JSON.stringify(players)} };
    const normalizeString = value => String(value || '').toLowerCase();
    const hydratePlayersForSeason = async () => [];
    const isAdmin = () => false;
    const openQuickAddModal = () => {};
    const getClubCrest = () => '';
    window._autocompleteFilters = {};
    ${setupAutocomplete}
    window.__setupAutocomplete = setupAutocomplete;
  `);

  const input = dom.window.document.getElementById('player-filter');
  dom.window.__setupAutocomplete('player-filter', 'jogadores', 'nome_guerra', null, null, false);
  input.value = 'atleta';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(dom.window.document.querySelectorAll('.autocomplete-item').length, 20);
  dom.window.close();
});

test('autocomplete interrompe o filtro encadeado depois de vinte resultados', () => {
  const dom = new JSDOM('<div><input id="club-filter"></div>', { runScripts: 'outside-only' });
  const clubs = Array.from({ length: 300 }, (_, index) => ({
    id: index + 1,
    clube: `Clube ${String(index).padStart(3, '0')}`,
    estado: 'MG',
    pais: 'Brasil'
  }));
  const setupAutocomplete = sourceBetween('const setupAutocomplete = ', 'const openQuickAddModal = ');

  dom.window.eval(`
    const state = { adversarios: ${JSON.stringify(clubs)} };
    const normalizeString = value => String(value || '').toLowerCase();
    const hydratePlayersForSeason = async () => [];
    const isAdmin = () => false;
    const openQuickAddModal = () => {};
    const getClubCrest = () => '';
    window._autocompleteFilters = {};
    ${setupAutocomplete}
    window.__setupAutocomplete = setupAutocomplete;
  `);

  dom.window.__filterCalls = 0;
  dom.window.__setupAutocomplete(
    'club-filter',
    'adversarios',
    'clube',
    () => { dom.window.__filterCalls += 1; return true; },
    null,
    false
  );
  const input = dom.window.document.getElementById('club-filter');
  input.value = 'clube';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(dom.window.__filterCalls, 20);
  assert.equal(dom.window.document.querySelectorAll('.autocomplete-item').length, 20);
  dom.window.close();
});

test('agendador agrupa digitacao rapida e executa apenas o ultimo render', () => {
  const schedulerSource = sourceBetween(
    'const inputRenderTimers = ',
    'const showToast = '
  );
  const timers = [];
  const context = {
    Map,
    setTimeout: callback => {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: timer => { timer.cancelled = true; }
  };
  vm.runInNewContext(`${schedulerSource}\nglobalThis.__scheduleInputRender = scheduleInputRender;`, context);

  const calls = [];
  context.__scheduleInputRender('players', () => calls.push('primeiro'));
  context.__scheduleInputRender('players', () => calls.push('ultimo'));

  assert.deepEqual(calls, []);
  assert.equal(timers.length, 2);
  assert.equal(timers[0].cancelled, true);
  timers[1].callback();
  assert.deepEqual(calls, ['ultimo']);
});

test('agendador cancela renders pendentes ao trocar de pagina', () => {
  const schedulerSource = sourceBetween(
    'const inputRenderTimers = ',
    'const showToast = '
  );
  const timers = [];
  const context = {
    Map,
    setTimeout: callback => {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: timer => { timer.cancelled = true; }
  };
  vm.runInNewContext(`${schedulerSource}\nglobalThis.__cancelScheduledInputRenders = cancelScheduledInputRenders;`, context);

  assert.equal(typeof context.__cancelScheduledInputRenders, 'function');
  vm.runInNewContext(`scheduleInputRender('old-page', () => { globalThis.__rendered = true; });`, context);
  context.__cancelScheduledInputRenders();
  timers[0].callback();

  assert.equal(timers[0].cancelled, true);
  assert.notEqual(context.__rendered, true);
});

test('autocompletes compartilham um unico listener externo de clique', () => {
  const dom = new JSDOM('<div><input id="first"></div><div><input id="second"></div>', { runScripts: 'outside-only' });
  const setupAutocomplete = sourceBetween('const setupAutocomplete = ', 'const openQuickAddModal = ');
  const originalAddEventListener = dom.window.document.addEventListener.bind(dom.window.document);
  let clickListeners = 0;
  dom.window.document.addEventListener = (type, listener, options) => {
    if (type === 'click') clickListeners += 1;
    return originalAddEventListener(type, listener, options);
  };
  dom.window.eval(`
    const state = { adversarios: [] };
    const normalizeString = value => String(value || '').toLowerCase();
    const hydratePlayersForSeason = async () => [];
    const isAdmin = () => false;
    const openQuickAddModal = () => {};
    const getClubCrest = () => '';
    window._autocompleteFilters = {};
    ${setupAutocomplete}
    window.__setupAutocomplete = setupAutocomplete;
  `);

  dom.window.__setupAutocomplete('first', 'adversarios', 'clube', null, null, false);
  dom.window.__setupAutocomplete('second', 'adversarios', 'clube', null, null, false);

  assert.equal(clickListeners, 1);
  dom.window.close();
});

test('autocomplete nao forca leitura de layout durante a digitacao', () => {
  const dom = new JSDOM('<div><input id="club-filter"></div>', { runScripts: 'outside-only' });
  const setupAutocomplete = sourceBetween('const setupAutocomplete = ', 'const openQuickAddModal = ');
  const input = dom.window.document.getElementById('club-filter');
  let layoutReads = 0;
  Object.defineProperty(input, 'offsetWidth', {
    configurable: true,
    get: () => { layoutReads += 1; return 200; }
  });
  dom.window.eval(`
    const state = { adversarios: [{ clube: 'Rival' }] };
    const normalizeString = value => String(value || '').toLowerCase();
    const hydratePlayersForSeason = async () => [];
    const isAdmin = () => false;
    const openQuickAddModal = () => {};
    const getClubCrest = () => '';
    window._autocompleteFilters = {};
    ${setupAutocomplete}
    window.__setupAutocomplete = setupAutocomplete;
  `);

  dom.window.__setupAutocomplete('club-filter', 'adversarios', 'clube', null, null, false);
  input.value = 'riv';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(layoutReads, 0);
  dom.window.close();
});

test('lista de autocomplete nao reinicia animacao a cada tecla', () => {
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  const rule = css.match(/\.autocomplete-results\s*\{[^}]*\}/)?.[0];
  assert.ok(rule, 'regra do autocomplete deve existir');
  assert.doesNotMatch(rule, /\banimation\s*:/);
});

test('filtro de jogadores nao recalcula estatisticas enquanto o usuario digita', () => {
  const dom = new JSDOM(`
    <input id="jogadores-filter-temp-de">
    <input id="jogadores-filter-temp-ate">
    <input id="jogadores-filter-nome">
    <div id="jogadores-pos-tabs"></div>
    <div id="jogadores-grid-container"></div>
    <div id="jogadores-pagination"></div>
  `, { runScripts: 'outside-only' });
  const schedulerSource = sourceBetween('const inputRenderTimers = ', 'const showToast = ');
  const rendererSource = sourceBetween('const renderJogadoresPage = ', 'const renderPlayerCareerDetail = ');
  const timers = [];
  dom.window.__gameTraversals = 0;
  dom.window.setTimeout = callback => {
    const timer = { callback, cancelled: false };
    timers.push(timer);
    return timer;
  };
  dom.window.clearTimeout = timer => { timer.cancelled = true; };
  dom.window.eval(`
    const state = {
      jogadoresFilterDe: '', jogadoresFilterAte: '', jogadoresFilterNome: '',
      jogadoresCurrentPage: 1, jogadoresCurrentPos: 'Geral',
      jogos: { forEach: () => { window.__gameTraversals += 1; } }
    };
    const DEFAULT_PLAYER_PHOTO = '';
    const normalizeString = value => String(value || '').toLowerCase();
    const getGamePlayerGlobalId = () => null;
    const getPlayerByGlobalId = () => null;
    ${schedulerSource}
    ${rendererSource}
    window.__renderJogadoresPage = renderJogadoresPage;
  `);

  dom.window.__renderJogadoresPage();
  assert.equal(dom.window.__gameTraversals, 1);

  const nameInput = dom.window.document.getElementById('jogadores-filter-nome');
  for (const value of ['h', 'hu', 'hul']) {
    nameInput.value = value;
    nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }

  assert.equal(dom.window.__gameTraversals, 1);
  assert.equal(timers.length, 3);
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].cancelled, true);
  timers[2].callback();
  assert.equal(dom.window.__gameTraversals, 2);
  dom.window.close();
});

test('filtro de equipe de arbitragem adia a varredura pesada durante a digitacao', () => {
  const filterIds = [
    'temporada', 'ano-de', 'ano-ate', 'campeonato', 'adversario',
    'nacionalidade', 'arbitro', 'assistente', 'var'
  ];
  const filters = filterIds.map(id => id === 'temporada'
    ? `<select id="ea-filter-${id}"><option value=""></option></select>`
    : `<input id="ea-filter-${id}">`).join('');
  const dom = new JSDOM(`${filters}<div id="equipe-arbitragem-grid-container"></div>`, { runScripts: 'outside-only' });
  const schedulerSource = sourceBetween('const inputRenderTimers = ', 'const showToast = ');
  const rendererSource = sourceBetween('const renderEquipeArbitragem = ', 'window.showEquipeArbitragemDetail = ');
  const timers = [];
  dom.window.__gameTraversals = 0;
  dom.window.setTimeout = callback => {
    const timer = { callback, cancelled: false };
    timers.push(timer);
    return timer;
  };
  dom.window.clearTimeout = timer => { timer.cancelled = true; };
  dom.window.eval(`
    const jogos = [];
    jogos.forEach = callback => { window.__gameTraversals += 1; return Array.prototype.forEach.call(jogos, callback); };
    const state = { jogos, arbitros: [] };
    const updateEquipeArbitragemFilters = () => {};
    const populateFilter = () => {};
    const setupAutocomplete = () => {};
    const normalizeString = value => String(value || '').toLowerCase();
    ${schedulerSource}
    ${rendererSource}
    window.__renderEquipeArbitragem = renderEquipeArbitragem;
  `);

  dom.window.__renderEquipeArbitragem();
  assert.equal(dom.window.__gameTraversals, 1);
  const input = dom.window.document.getElementById('ea-filter-arbitro');
  input.value = 'a';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(dom.window.__gameTraversals, 1);
  assert.equal(timers.length, 1);
  timers[0].callback();
  assert.equal(dom.window.__gameTraversals, 2);
  dom.window.close();
});

test('dashboard agenda filtros digitaveis sem render sincrono', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const id of ['dash-filter-temp-de', 'dash-filter-temp-ate', 'dash-top-limit']) {
    const markup = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(markup, `input ${id} deve existir`);
    const dom = new JSDOM(markup, { runScripts: 'dangerously' });
    let renders = 0;
    let schedules = 0;
    dom.window.renderDashboard = () => { renders += 1; };
    dom.window.scheduleInputRender = (_key, render) => { schedules += 1; void render; };

    dom.window.document.getElementById(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    assert.equal(renders, 0, `${id} nao deve renderizar durante a tecla`);
    assert.equal(schedules, 1, `${id} deve agendar um render`);
    dom.window.close();
  }
});

test('filtro encadeado de arbitragem nao varre todos os jogos por sugestao', () => {
  const filterIds = [
    'temporada', 'nacionalidade', 'arbitro', 'adversario', 'estadio',
    'campeonato', 'tipo', 'ano-de', 'ano-ate'
  ];
  const filters = filterIds.map(id => `<input id="arb-filter-${id}">`).join('');
  const dom = new JSDOM(filters, { runScripts: 'outside-only' });
  const updaterSource = sourceBetween('const updateArbitragemFilters = ', 'const renderArbitragem = ');
  const games = Array.from({ length: 200 }, (_, index) => ({
    temporada: '2026', data: '2026-01-01', campeonato: 'Liga',
    casa: 'Atlético', fora: `Clube ${index}`, estadio: 'Arena',
    arbitro: `Árbitro ${index % 20}`, assistente1: '', assistente2: '', varArbitro: ''
  }));
  let gameScans = 0;
  games.filter = function filter(callback) {
    gameScans += 1;
    return Array.prototype.filter.call(this, callback);
  };
  const capturedFilters = {};

  dom.window.state = {
    isUpdating: false,
    arbTab: 'arbitro',
    jogos: games,
    competicoes: [{ campeonato: 'Liga', tipo: 'Oficial' }],
    arbitros: Array.from({ length: 20 }, (_, index) => ({ nome: `Árbitro ${index}`, federacao: 'Brasil' })),
    adversarios: [],
    estadios: []
  };
  dom.window.__capturedFilters = capturedFilters;
  dom.window.eval(`
    const state = window.state;
    const normalizeString = value => String(value || '').toLowerCase();
    const populateFilter = () => {};
    const scheduleInputRender = () => {};
    const renderArbitragem = () => {};
    const setupAutocomplete = (id, _source, _field, filterFn) => { window.__capturedFilters[id] = filterFn; };
    ${updaterSource}
    window.__updateArbitragemFilters = updateArbitragemFilters;
  `);

  dom.window.__updateArbitragemFilters();
  const scansAfterSetup = gameScans;
  dom.window.document.getElementById('arb-filter-arbitro').value = 'Ár';
  dom.window.__updateArbitragemFilters();
  assert.equal(
    capturedFilters['arb-filter-arbitro']({ nome: 'Árbitro 1' }),
    true,
    'o texto parcial do proprio campo nao deve eliminar suas sugestoes'
  );
  const scansBeforeSuggestions = gameScans;
  for (let index = 0; index < 20; index += 1) {
    capturedFilters['arb-filter-arbitro']({ nome: `Árbitro ${index}` });
  }

  assert.ok(gameScans > scansAfterSetup, 'a atualizacao do filtro deve reconstruir os indices');
  assert.equal(gameScans, scansBeforeSuggestions, 'as sugestoes devem consultar um indice pronto');
  dom.window.close();
});

test('filtro encadeado de jogos nao varre partidas por sugestao', () => {
  const filterIds = [
    'temporada', 'campeonato', 'casa', 'fora', 'estadio',
    'arbitro', 'assistente', 'var', 'publico-max'
  ];
  const filters = filterIds.map(id => `<input id="filter-${id}">`).join('');
  const dom = new JSDOM(`${filters}<button id="btn-clear-filters"></button><table><tbody id="table-body-jogos"></tbody></table>`, { runScripts: 'outside-only' });
  const rendererSource = sourceBetween('const renderJogos = ', 'window.showJogoDetail = ');
  const games = Array.from({ length: 200 }, (_, index) => ({
    id: index + 1, temporada: '2026', data: '2026-01-01', campeonato: 'Liga',
    casa: 'Atlético', fora: `Clube ${index}`, estadio: 'Arena',
    arbitro: `Árbitro ${index % 20}`, assistente1: 'Assistente 1', assistente2: 'Assistente 2',
    varArbitro: 'VAR', golsCasa: 1, golsFora: 0, publico: 1000, renda: 10000
  }));
  let gameSearches = 0;
  games.some = function some(callback) {
    gameSearches += 1;
    return Array.prototype.some.call(this, callback);
  };
  const capturedFilters = {};
  dom.window.state = { jogos: games, currentPage: 1, rowsPerPage: 20 };
  dom.window.__capturedFilters = capturedFilters;
  dom.window.eval(`
    const state = window.state;
    const sortInternal = values => values;
    const setupAutocomplete = (id, _source, _field, filterFn) => { window.__capturedFilters[id] = filterFn; };
    const scheduleInputRender = () => {};
    const formatPublico = String;
    const formatRenda = String;
    const formatCurrency = String;
    const isAdmin = () => false;
    ${rendererSource}
    window.__renderJogos = renderJogos;
  `);

  dom.window.__renderJogos();
  const searchesAfterRender = gameSearches;
  for (let index = 0; index < 20; index += 1) {
    capturedFilters['filter-arbitro']({ nome: `Árbitro ${index}` });
  }

  assert.equal(gameSearches, searchesAfterRender, 'as sugestoes devem consultar valores precomputados');
  dom.window.close();
});

test('filtro de equipe preserva sugestoes ao pausar em adversario parcial', () => {
  const filterIds = [
    'temporada', 'campeonato', 'adversario', 'nacionalidade',
    'arbitro', 'assistente', 'var', 'ano-de', 'ano-ate'
  ];
  const filters = filterIds.map(id => `<input id="ea-filter-${id}">`).join('');
  const dom = new JSDOM(filters, { runScripts: 'outside-only' });
  const updaterSource = sourceBetween('const updateEquipeArbitragemFilters = ', 'const renderEquipeArbitragem = ');
  const capturedFilters = {};
  dom.window.state = {
    isUpdating: false,
    jogos: [{
      temporada: '2026', data: '2026-01-01', campeonato: 'Liga',
      casa: 'Atlético', fora: 'Rival', arbitro: 'Principal',
      assistente1: 'Assistente 1', assistente2: 'Assistente 2', varArbitro: 'VAR'
    }],
    arbitros: [{ nome: 'Principal', federacao: 'Brasil' }]
  };
  dom.window.__capturedFilters = capturedFilters;
  dom.window.eval(`
    const state = window.state;
    const normalizeString = value => String(value || '').toLowerCase();
    const populateFilter = () => {};
    const scheduleInputRender = () => {};
    const renderEquipeArbitragem = () => {};
    const setupAutocomplete = (id, _source, _field, filterFn) => { window.__capturedFilters[id] = filterFn; };
    ${updaterSource}
    window.__updateEquipeArbitragemFilters = updateEquipeArbitragemFilters;
  `);

  dom.window.document.getElementById('ea-filter-adversario').value = 'Riv';
  dom.window.__updateEquipeArbitragemFilters();

  assert.equal(
    capturedFilters['ea-filter-adversario']({ clube: 'Rival' }),
    true,
    'o proprio texto parcial nao deve restringir o indice de sugestoes'
  );
  dom.window.close();
});

test('render de arbitragem agrupa jogos em uma unica passagem', () => {
  const filterIds = [
    'temporada', 'nacionalidade', 'arbitro', 'adversario', 'estadio',
    'campeonato', 'tipo', 'ano-de', 'ano-ate'
  ];
  const filters = filterIds.map(id => `<input id="arb-filter-${id}">`).join('');
  const dom = new JSDOM(`${filters}<table><tbody id="table-body-arbitragem"></tbody></table>`, { runScripts: 'outside-only' });
  const rendererSource = sourceBetween('const renderArbitragem = ', 'window.showArbitragemJogos = ');
  const games = Array.from({ length: 300 }, (_, index) => ({
    temporada: '2026', data: '2026-01-01', campeonato: 'Liga',
    casa: 'Atlético', fora: 'Rival', estadio: 'Arena',
    arbitro: `Árbitro ${index % 100}`, assistente1: '', assistente2: '', varArbitro: '',
    golsCasa: 1, golsFora: 0, cartoesGalo: [], cartoesAdv: []
  }));
  let gameFilters = 0;
  games.filter = function filter(callback) {
    gameFilters += 1;
    return Array.prototype.filter.call(this, callback);
  };
  dom.window.state = {
    arbTab: 'arbitro', jogos: games,
    arbitros: Array.from({ length: 100 }, (_, index) => ({ nome: `Árbitro ${index}`, federacao: 'Brasil', foto: '' })),
    competicoes: [{ campeonato: 'Liga', tipo: 'Oficial' }],
    sortConfig: {}
  };
  dom.window.eval(`
    const state = window.state;
    const updateArbitragemFilters = () => {};
    const normalizeString = value => String(value || '').toLowerCase();
    const scheduleInputRender = () => {};
    const sortInternal = values => values;
    ${rendererSource}
    window.__renderArbitragem = renderArbitragem;
  `);

  dom.window.__renderArbitragem();

  assert.ok(gameFilters <= 1, `esperada no maximo uma filtragem dos jogos, recebeu ${gameFilters}`);
  assert.equal(dom.window.document.querySelectorAll('#table-body-arbitragem tr').length, 100);
  dom.window.close();
});

test('equipe de arbitragem usa indice de profissionais por nome', () => {
  const filterIds = [
    'temporada', 'ano-de', 'ano-ate', 'campeonato', 'adversario',
    'nacionalidade', 'arbitro', 'assistente', 'var'
  ];
  const filters = filterIds.map(id => id === 'temporada'
    ? `<select id="ea-filter-${id}"><option value=""></option><option value="2026">2026</option></select>`
    : `<input id="ea-filter-${id}">`).join('');
  const dom = new JSDOM(`${filters}<div id="equipe-arbitragem-grid-container"></div>`, { runScripts: 'outside-only' });
  const rendererSource = sourceBetween('const renderEquipeArbitragem = ', 'window.showEquipeArbitragemDetail = ');
  const referees = [
    { nome: 'Principal', federacao: 'Brasil', foto: '' },
    { nome: 'Assistente 1', federacao: 'Brasil', foto: '' },
    { nome: 'Assistente 2', federacao: 'Brasil', foto: '' },
    { nome: 'VAR', federacao: 'Brasil', foto: '' }
  ];
  let linearFinds = 0;
  referees.find = function find(callback) {
    linearFinds += 1;
    return Array.prototype.find.call(this, callback);
  };
  dom.window.state = {
    jogos: [{
      temporada: '2026', data: '2026-01-01', campeonato: 'Liga',
      casa: 'Atlético', fora: 'Rival', arbitro: 'Principal',
      assistente1: 'Assistente 1', assistente2: 'Assistente 2', varArbitro: 'VAR'
    }],
    arbitros: referees
  };
  dom.window.eval(`
    const state = window.state;
    const updateEquipeArbitragemFilters = () => {};
    const normalizeString = value => String(value || '').toLowerCase();
    const scheduleInputRender = () => {};
    ${rendererSource}
    window.__renderEquipeArbitragem = renderEquipeArbitragem;
  `);

  dom.window.__renderEquipeArbitragem();

  assert.equal(linearFinds, 0, 'cada jogo deve consultar um mapa, nao refazer Array.find');
  assert.equal(dom.window.document.querySelectorAll('.artilheiro-card').length, 4);
  dom.window.close();
});

test('busca global de jogador reutiliza indice entre chamadas', () => {
  const lookupSource = sourceBetween('let playerGlobalIndex = ', 'const getAdversarioDoJogo = ');
  const players = Array.from({ length: 1000 }, (_, index) => ({
    id_jogador: index % 100,
    temporada: String(2020 + (index % 7)),
    nome_guerra: `Atleta ${index}`
  }));
  let filters = 0;
  players.filter = function filter(callback) {
    filters += 1;
    return Array.prototype.filter.call(this, callback);
  };
  const context = { state: { jogadores: players } };
  vm.runInNewContext(`${lookupSource}\nglobalThis.__getPlayerByGlobalId = getPlayerByGlobalId;`, context);

  for (let index = 1; index < 100; index += 1) {
    assert.ok(context.__getPlayerByGlobalId(index, 2026));
  }

  assert.ok(filters <= 1, `o cadastro nao deve ser refiltrado por jogador: ${filters} filtragens`);
});

test('cards filtrados de jogadores aparecem sem animacao escalonada', () => {
  const dom = new JSDOM(`
    <input id="jogadores-filter-temp-de">
    <input id="jogadores-filter-temp-ate">
    <input id="jogadores-filter-nome">
    <div id="jogadores-pos-tabs"></div>
    <div id="jogadores-grid-container"></div>
    <div id="jogadores-pagination"></div>
  `, { runScripts: 'outside-only' });
  const schedulerSource = sourceBetween('const inputRenderTimers = ', 'const showToast = ');
  const rendererSource = sourceBetween('const renderJogadoresPage = ', 'const renderPlayerCareerDetail = ');
  dom.window.eval(`
    const state = {
      jogadoresFilterDe: '', jogadoresFilterAte: '', jogadoresFilterNome: '',
      jogadoresCurrentPage: 1, jogadoresCurrentPos: 'Geral',
      jogos: [{
        temporada: '2026', casa: 'Atlético', fora: 'Rival', golsCasa: 1, golsFora: 0,
        lineupGalo: [{ idJogador: 7, jogador: 'Hulk', golsCount: 1 }]
      }]
    };
    const DEFAULT_PLAYER_PHOTO = '';
    const normalizeString = value => String(value || '').toLowerCase();
    const getGamePlayerGlobalId = reference => reference.idJogador;
    const getPlayerByGlobalId = () => ({ nome_guerra: 'Hulk', foto: '', posicao: 'Atacante' });
    ${schedulerSource}
    ${rendererSource}
    window.__renderJogadoresPage = renderJogadoresPage;
  `);

  dom.window.__renderJogadoresPage();
  const card = dom.window.document.querySelector('.player-card');

  assert.ok(card);
  assert.equal(card.style.animation, '');
  assert.equal(card.style.animationDelay, '');
  dom.window.close();
});

test('temporada do novo jogo adia a reconstrucao completa da escalacao', () => {
  const dom = new JSDOM(`
    <input id="game-temporada">
    <input id="game-data">
    <table><tbody id="lineup-galo-body"></tbody></table>
  `, { runScripts: 'outside-only' });
  const listenerSource = sourceBetween(
    '    // Sync the year in game-data when temporada changes',
    "    setupAutocomplete('game-assistente1'"
  );
  let scheduledRender = null;
  dom.window.__rowAdds = 0;
  dom.window.__scheduled = 0;
  dom.window.scheduleInputRender = (_key, render) => {
    dom.window.__scheduled += 1;
    scheduledRender = render;
  };
  dom.window.eval(`
    const state = { editingJogoId: null };
    const scheduleInputRender = window.scheduleInputRender;
    const addLineupRow = () => { window.__rowAdds += 1; };
    ${listenerSource}
  `);

  const season = dom.window.document.getElementById('game-temporada');
  season.value = '2026';
  season.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(dom.window.__rowAdds, 0, 'a tecla nao deve criar dezesseis linhas sincronamente');
  assert.equal(dom.window.__scheduled, 1);
  scheduledRender();
  assert.equal(dom.window.__rowAdds, 16);
  dom.window.close();
});

test('comparativo nao acumula recalculos ao voltar para a pagina', () => {
  const inputs = [1, 2, 3, 4, 5].map(index => `
    <select id="comp-t${index}"><option value=""></option></select>
    <input id="comp-tec${index}" class="comp-inp">
    <input id="comp-jog${index}" class="comp-inp">
  `).join('');
  const dom = new JSDOM(`${inputs}<div id="comparativo-content-container"></div>`, { runScripts: 'outside-only' });
  const rendererSource = sourceBetween('const renderComparativo = ', 'window.clearComparativoFilters = ');
  dom.window.__schedules = 0;
  dom.window.__legacyTimers = 0;
  dom.window.setTimeout = () => { dom.window.__legacyTimers += 1; return 1; };
  dom.window.eval(`
    const state = { jogos: [], jogadores: [], jogadoresComparativo: [], tecnicosList: [] };
    const populateFilter = () => {};
    const setupAutocomplete = () => {};
    const renderComparativoCharts = () => {};
    const scheduleInputRender = () => { window.__schedules += 1; };
    ${rendererSource}
    window.__renderComparativo = renderComparativo;
  `);

  dom.window.__renderComparativo();
  dom.window.__renderComparativo();
  dom.window.document.getElementById('comp-tec1').dispatchEvent(new dom.window.Event('blur'));

  assert.equal(dom.window.__legacyTimers, 0, 'o comparativo deve usar o agendador compartilhado');
  assert.equal(dom.window.__schedules, 1, 'duas visitas nao devem duplicar o listener');
  dom.window.close();
});
