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
    assert.equal(aggregate(games)[0].nome, 'B');
});

test('ignora cartões zerados e jogos sem árbitro', () => {
    const aggregate = load();
    assert.equal(typeof aggregate, 'function');
    assert.equal(aggregate([{ arbitro: 'A', cartoesGalo: [{ amarelo: 0, red: 0 }] }, { cartoesGalo: [{ red: 1 }] }]).length, 0);
});

test('cliques abrem jogadores do árbitro, ordenam vermelhos e fecham o detalhe', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<select id="cart-filter-temporada"><option value="2025">2025</option></select><table id="cartoes-referees-table"><tbody></tbody></table>', { runScripts: 'outside-only' });
    const source = fs.readFileSync('app.js', 'utf8');
    dom.window.eval(`const state = { jogos: [{ arbitro: 'A', temporada: '2025', cartoesGalo: [{ idJogador: 1, jogador: 'Um', amarelo: 5 }, { idJogador: 2, jogador: 'Dois', red: 2 }] }] }; const getGamePlayerGlobalId = c => String(c.idJogador); const getPlayerByGlobalId = () => null; ${source.slice(source.indexOf('const aggregateRefereeCards ='), source.indexOf('const renderCartoes ='))}; renderRefereeCards();`);
    const button = dom.window.document.querySelector('.referee-name-button');
    button.click();
    assert.match(dom.window.document.querySelector('.referee-players-table tbody tr').textContent, /Um/);
    dom.window.document.querySelector('[data-sort="red"]').click();
    assert.match(dom.window.document.querySelector('.referee-players-table tbody tr').textContent, /Dois/);
    button.click();
    assert.equal(dom.window.document.querySelector('.referee-card-detail'), null);
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
