const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
    const source = fs.readFileSync('app.js', 'utf8');
    const block = source.slice(source.indexOf('const aggregateRefereeCards ='), source.indexOf('const renderCartoes ='));
    const context = { window: {}, getGamePlayerGlobalId: c => c.idJogador ? String(c.idJogador) : null };
    vm.createContext(context);
    vm.runInContext(block + ';this.aggregate = aggregateRefereeCards;', context);
    return context.aggregate;
}

test('ranking soma somente cartões do Atlético e respeita temporada', () => {
    const aggregate = load();
    assert.equal(typeof aggregate, 'function');
    const games = [
        { arbitro: 'A', temporada: '2025', cartoesGalo: [{ idJogador: 1, jogador: 'Hulk', amarelo: '2', red: '1' }], cartoesAdv: [{ amarelo: 10 }] },
        { arbitro: 'A', temporada: '2025', cartoesGalo: [{ idJogador: 1, jogador: 'Hulk', amarelo: 1 }, { idJogador: 2, jogador: 'Hulk', red: 1 }] },
        { arbitro: 'B', temporada: '2024', cartoesGalo: [{ amarelo: 20 }] }
    ];
    const ranking = aggregate(games, '2025');
    assert.equal(ranking.length, 1);
    assert.equal(ranking[0].yellow, 3);
    assert.equal(ranking[0].red, 2);
    assert.equal(ranking[0].total, 5);
    assert.equal(ranking[0].players.length, 2);
    assert.equal(ranking[0].players[0].yellow, 3);
    assert.equal(ranking[0].players[0].red, 1);
    assert.equal(ranking[0].players[0].games.length, 2);
    assert.equal(ranking[0].players[0].games[0].yellow, 2);
    assert.equal(aggregate(games)[0].nome, 'B');
});

test('ignora cartões zerados e jogos sem árbitro', () => {
    const aggregate = load();
    assert.equal(typeof aggregate, 'function');
    assert.equal(aggregate([{ arbitro: 'A', cartoesGalo: [{ amarelo: 0, red: 0 }] }, { cartoesGalo: [{ red: 1 }] }]).length, 0);
});

test('combina campeonato, adversário, árbitro e jogador contando apenas seus cartões', () => {
    const aggregate = load();
    const games = [
        { arbitro: 'Árbitro A', temporada: '2025', campeonato: 'Copa', casa: 'Atlético-MG', fora: 'Cruzeiro', cartoesGalo: [{ idJogador: 1, jogador: 'Hulk', amarelo: 2 }, { idJogador: 2, jogador: 'Outro', red: 3 }] },
        { arbitro: 'Árbitro A', temporada: '2025', campeonato: 'Liga', casa: 'Cruzeiro', fora: 'Atlético', cartoesGalo: [{ idJogador: 1, jogador: 'Hulk', amarelo: 10 }] }
    ];
    const ranking = aggregate(games, '2025', { campeonato: 'Copa', adversario: 'cruze', arbitro: 'arbitro a', jogador: 'hulk' });
    assert.equal(ranking[0].total, 2);
    assert.equal(ranking[0].players.length, 1);
    assert.equal(ranking[0].players[0].games.length, 1);
    assert.equal(ranking[0].players[0].games[0].game.campeonato, 'Copa');
    assert.equal(aggregate(games, '', { adversario: 'Flamengo' }).length, 0);
    assert.equal(aggregate(games, '2025', { jogadorId: '2' })[0].total, 3);
});

test('autocomplete seleciona jogador por identidade e filtra o ranking', () => {
    const { JSDOM } = require('jsdom');
    const html = fs.readFileSync('index.html', 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const source = fs.readFileSync('app.js', 'utf8');
    const auto = source.slice(source.indexOf('const setupAutocomplete ='), source.indexOf('const openQuickAddModal ='));
    const cards = source.slice(source.indexOf('const aggregateRefereeCards ='), source.indexOf('const renderCartoes ='));
    const clear = source.slice(source.indexOf('window.clearCartoesFilters ='), source.indexOf('window.clearArbitragemFilters ='));
    dom.window.eval(`
        const state = { arbitros: [{ nome: 'A' }], adversarios: [{ clube: 'Cruzeiro' }], jogadores: [{ id_jogador: 1, nome_guerra: 'Hulk' }], jogos: [{ arbitro: 'A', temporada: '2025', campeonato: 'Copa', casa: 'Atlético', fora: 'Cruzeiro', cartoesGalo: [{ idJogador: 1, jogador: 'Hulk', amarelo: 2 }, { idJogador: 2, jogador: 'Outro', red: 3 }] }] };
        const getGamePlayerGlobalId = c => String(c.idJogador);
        const getPlayerByGlobalId = () => null;
        const normalizeString = value => String(value || '').toLowerCase();
        const populateFilter = () => {};
        const scheduleInputRender = (page, callback) => callback();
        const renderCartoes = () => renderRefereeCards();
        window._autocompleteFilters = {};
        ${auto} ${cards} ${clear}
        setupRefereeCardFilters();
    `);
    const input = dom.window.document.getElementById('cart-ref-filter-jogador');
    input.value = 'Hul';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.document.querySelector('.autocomplete-item').click();
    assert.equal(input.value, 'Hulk');
    assert.equal(input.dataset.playerId, '1');
    assert.equal(dom.window.document.querySelector('#cartoes-referees-table tbody tr td:last-child').textContent, '2');
    dom.window.document.getElementById('cart-ref-filter-campeonato').innerHTML = '<option value="Copa">Copa</option><option value="">Todos</option>';
    dom.window.clearCartoesFilters();
    assert.equal(dom.window.document.getElementById('cart-ref-filter-campeonato').value, '');
    assert.equal(input.value, '');
    assert.equal(input.dataset.playerId, undefined);
    input.value = '';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(input.dataset.playerId, undefined);
    assert.equal(dom.window.document.querySelector('#cartoes-referees-table tbody tr td:last-child').textContent, '5');
    dom.window.close();
});

test('cliques abrem jogadores do árbitro, ordenam vermelhos e fecham o detalhe', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<select id="cart-filter-temporada"><option value="2025">2025</option></select><table id="cartoes-referees-table"><tbody></tbody></table>', { runScripts: 'outside-only' });
    const source = fs.readFileSync('app.js', 'utf8');
    dom.window.eval(`const state = { arbitros: [{ nome: 'A', foto: 'arbitro.jpg' }], jogos: [{ arbitro: 'A', temporada: '2025', cartoesGalo: [{ idJogador: 1, jogador: 'Um', amarelo: 5 }, { idJogador: 2, jogador: 'Dois', red: 2 }] }] }; const getGamePlayerGlobalId = c => String(c.idJogador); const getPlayerByGlobalId = () => ({ foto: 'jogador.jpg' }); ${source.slice(source.indexOf('const aggregateRefereeCards ='), source.indexOf('const renderCartoes ='))}; window.renderRanking = renderRefereeCards; renderRefereeCards();`);
    const button = dom.window.document.querySelector('.referee-name-button');
    button.click();
    assert.equal(dom.window.document.querySelector('#cartoes-referees-table > tbody > tr img').getAttribute('src'), 'arbitro.jpg');
    assert.equal(dom.window.document.querySelector('.referee-players-table img').getAttribute('src'), 'jogador.jpg');
    assert.match(dom.window.document.querySelector('.referee-players-table tbody tr').textContent, /Um/);
    dom.window.document.querySelector('.referee-players-table tbody tr').click();
    const matches = dom.window.document.querySelector('.player-card-games');
    assert.ok(matches, 'clicar no jogador abre seus jogos');
    assert.equal(matches.querySelectorAll('th').length, 8);
    assert.equal(matches.querySelector('tbody tr td:nth-child(7)').textContent, '5');
    assert.equal(matches.querySelector('tbody tr td:nth-child(8)').textContent, '0');
    dom.window.renderRanking();
    assert.ok(dom.window.document.querySelector('.player-card-games'), 'detalhe permanece aberto ao carregar fotos');
    dom.window.document.querySelector('.referee-players-table tbody tr').click();
    assert.equal(dom.window.document.querySelector('.player-card-games'), null);
    dom.window.document.querySelector('[data-sort="red"]').click();
    assert.match(dom.window.document.querySelector('.referee-players-table tbody tr').textContent, /Dois/);
    dom.window.renderRanking();
    assert.match(dom.window.document.querySelector('.referee-players-table tbody tr').textContent, /Dois/);
    dom.window.document.querySelector('.referee-name-button').click();
    assert.equal(dom.window.document.querySelector('.referee-card-detail'), null);
    const refereeRow = dom.window.document.querySelector('#cartoes-referees-table > tbody > tr');
    for (const cell of refereeRow.querySelectorAll('td')) {
        cell.click();
        assert.ok(dom.window.document.querySelector('.referee-card-detail'), 'qualquer coluna deve abrir os detalhes');
        cell.click();
        assert.equal(dom.window.document.querySelector('.referee-card-detail'), null);
    }
    dom.window.close();
});

test('clique no jogo mostra amarelo e vermelho, ignora cartão zerado e permite fechar', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<table><tbody><tr id="referee"><td>A</td></tr></tbody></table>', { runScripts: 'outside-only' });
    const source = fs.readFileSync('app.js', 'utf8');
    const helpers = source.slice(source.indexOf('const cardText ='), source.indexOf('window.changeCartoesTab'));
    const handler = source.slice(source.indexOf('window.showArbitragemJogos ='), source.indexOf('// EQUIPE DE ARBITRAGEM FUNCTIONS'));
    dom.window.eval(`const state = { arbTab: 'arbitro', jogos: [{ arbitro: 'A', data: '2025-01-01', campeonato: 'Brasileiro', casa: 'Atlético', fora: 'Outro', golsCasa: 1, golsFora: 0, cartoesGalo: [{ jogador: 'Um', amarelo: 2, red: 1 }, { jogador: 'Sem cartão', amarelo: 0 }] }] }; const getGamePlayerGlobalId = () => null; const formatPublico = () => '-'; ${helpers} ${handler}`);
    dom.window.showArbitragemJogos('A', { currentTarget: dom.window.document.getElementById('referee') });
    const game = dom.window.document.querySelector('.referee-game');
    game.click();
    const detail = dom.window.document.querySelector('.game-card-detail');
    assert.match(detail.textContent, /Amarelo \(2\)/);
    assert.match(detail.textContent, /Vermelho \(1\)/);
    assert.doesNotMatch(detail.textContent, /Sem cartão/);
    game.click();
    assert.equal(dom.window.document.querySelector('.game-card-detail'), null);
    dom.window.close();
});

test('temporadas dos árbitros independem dos filtros de time e posição dos jogadores', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<select id="cart-filter-temporada"><option value="">Todas</option></select><select id="cart-filter-time"><option value="Adversário">Adversário</option></select><select id="cart-filter-posicao"><option value="Goleiro">Goleiro</option></select>', { runScripts: 'outside-only' });
    const source = fs.readFileSync('app.js', 'utf8');
    const block = source.slice(source.indexOf('const updateCartoesFilters ='), source.indexOf('const toggleCartoesDetail ='));
    dom.window.eval(`const state = { cartoesTab: 'arbitros', jogos: [{ temporada: '2025', arbitro: 'A', cartoesGalo: [{ jogador: 'Um', amarelo: 1 }], cartoesAdv: [] }] }; const populateFilter = (id, values) => { window.seasons = values; }; ${block}; updateCartoesFilters();`);
    assert.deepEqual(Array.from(dom.window.seasons), ['2025']);
    dom.window.close();
});
