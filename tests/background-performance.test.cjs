'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

test('reconciliação de jogos não carrega fotos nem busca atletas já identificados', () => {
    let lookups = 0;
    const player = { id_jogador: 'michel-global' };
    Object.defineProperty(player, 'foto', { get() { throw new Error('foto não deve ser carregada em segundo plano'); } });
    const context = {
        console: { log() {} },
        state: { jogos: [{ temporada: '2004', adversarioId: 'adv', lineupGalo: [{ jogador: 'Michel' }, { idJogador: 'outro' }], cartoesGalo: [{ idJogador: 'outro' }], cartoesAdv: [] }] },
        getPlayerFromGameReference: () => { lookups++; return player; },
        getAdversarioDoJogo: () => null
    };
    const start = source.indexOf('const enrichJogos = ');
    const end = source.indexOf('const persistResolvedGameReferences = ', start);
    vm.runInNewContext(source.slice(start, end) + '\nenrichJogos();', context);
    assert.equal(lookups, 1);
    assert.equal(context.state.jogos[0].lineupGalo[0].idJogador, 'michel-global');
    assert.equal(context.state.jogos[0].lineupGalo[1].idJogador, 'outro');
});

test('formatadores reutilizam instâncias ao digitar e mantêm os valores brasileiros', () => {
    let constructions = 0;
    const context = { Intl: { NumberFormat: function(...args) { constructions++; return new Intl.NumberFormat(...args); } }, parseCurrency: value => Number(value) };
    const start = source.indexOf('const currencyFormatter = ');
    const end = source.indexOf('const renderTableLegend = ', start);
    vm.runInNewContext(source.slice(start, end) + '\nglobalThis.formatters = { formatCurrency, formatPublico, formatRenda };', context);
    for (let i = 0; i < 100; i++) {
        assert.equal(context.formatters.formatPublico(8867), '8.867');
        assert.equal(context.formatters.formatRenda(90257.5), '90.257,50');
        assert.equal(context.formatters.formatCurrency(10.18).replace(/\s/g, ' '), 'R$ 10,18');
    }
    assert.equal(constructions, 3);
});
