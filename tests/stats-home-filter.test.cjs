'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('estatísticas coletivas combinam mandante com temporada e campeonato', () => {
    const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = source.indexOf('const renderStatsColetivas = ');
    const end = source.indexOf('    // Bind listeners', start);
    const filter = source.slice(start, end) + '\nreturn filteredJogos; }; globalThis.filterGames = renderStatsColetivas;';
    let selected = '';
    const context = {
        populateFilter: () => {},
        document: { getElementById: id => id === 'stc-filter-estadio' ? null : ({ value: id === 'stc-filter-mandante' ? selected : id.endsWith('-de') ? '2004' : '2004' }) },
        isAtletico: name => ['Atlético', 'Atlético-MG'].includes(name),
        state: {
            statsMultiFilters: { 'col-campeonato': ['Brasileiro'], 'col-tecnico': ['Todos'], 'col-tipo': ['Todos'] },
            competicoes: [],
            jogos: [
                { id: 1, temporada: '2004', campeonato: 'Brasileiro', casa: 'Atlético', fora: 'Cruzeiro' },
                { id: 2, temporada: '2004', campeonato: 'Brasileiro', casa: 'Cruzeiro', fora: 'Atlético-MG' },
                { id: 3, temporada: '2005', campeonato: 'Brasileiro', casa: 'Atlético', fora: 'Cruzeiro' },
                { id: 4, temporada: '2004', campeonato: 'Mineiro', casa: 'Atlético', fora: 'Cruzeiro' }
            ]
        }
    };
    vm.runInNewContext(filter, context);
    assert.deepEqual(Array.from(context.filterGames().map(j => j.id)), [1, 2]);
    selected = 'Atlético';
    assert.deepEqual(Array.from(context.filterGames().map(j => j.id)), [1]);
    selected = 'Adversários';
    assert.deepEqual(Array.from(context.filterGames().map(j => j.id)), [2]);
});
