'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('tabela por temporada soma campeonatos e respeita o filtro de mandante', () => {
    const dom = new JSDOM('<input id="stc-filter-temporada-de"><input id="stc-filter-temporada-ate"><select id="stc-filter-mandante"><option value="">Todos</option><option>Atlético</option></select><div id="content"></div>', { runScripts: 'outside-only' });
    const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = source.indexOf('const renderStatsColetivas = ');
    const end = source.indexOf('let goalsMarkedChart = ', start);
    dom.window.eval(`
        const state = { sortConfig: {}, competicoes: [], statsMultiFilters: { 'col-campeonato': ['Todos'], 'col-tecnico': ['Todos'], 'col-tipo': ['Todos'] }, jogos: [
            { temporada: '2004', campeonato: 'Mineiro', casa: 'Atlético', fora: 'Cruzeiro', golsCasa: 2, golsFora: 0, cartoesGalo: [{ amarelo: 2, red: 1 }] },
            { temporada: '2004', campeonato: 'Brasileiro', casa: 'Cruzeiro', fora: 'Atlético', golsCasa: 1, golsFora: 1 },
            { temporada: '2005', campeonato: 'Mineiro', casa: 'Atlético', fora: 'Cruzeiro', golsCasa: 0, golsFora: 1 }
        ] };
        const isAtletico = team => team === 'Atlético';
        const initMultiSelect = () => {};
        const renderTableLegend = () => '';
        const renderGoalDistributionCharts = games => { window.chartGames = games.length; };
        const sortInternal = (rows) => rows.sort((a, b) => a[state.sortConfig.column] - b[state.sortConfig.column]);
        ${source.slice(start, end)}
        window.render = () => renderStatsColetivas(document.getElementById('content'));
        window.sortBy = column => { state.sortConfig = { tableId: 'table-stats-temporadas', column, direction: 'asc' }; window.render(); };
    `);
    dom.window.render();
    const tables = dom.window.document.querySelectorAll('table');
    assert.equal(tables[0].id, 'table-stats-temporadas');
    assert.equal(tables[1].id, 'table-stats-coletivas');
    const season = Array.from(tables[0].querySelectorAll('tbody tr')).find(row => row.cells[0].textContent === '2004');
    assert.deepEqual(Array.from(season.cells).slice(0, 10).map(cell => cell.textContent), ['2004', '4', '2', '1', '1', '0', '3', '1', '2', '66.67%']);
    assert.equal(season.cells[14].textContent, '2');
    assert.equal(season.cells[15].textContent, '1');
    assert.equal(tables[0].tBodies[0].lastElementChild.textContent, tables[1].tBodies[0].lastElementChild.textContent);
    for (const column of ['sg', 'mgm']) {
        dom.window.sortBy(column);
        assert.equal(dom.window.document.querySelector('#table-stats-temporadas tbody tr').cells[0].textContent, '2005');
    }
    dom.window.sortBy('mgs');
    assert.equal(dom.window.document.querySelector('#table-stats-temporadas tbody tr').cells[0].textContent, '2004');
    dom.window.document.getElementById('stc-filter-mandante').value = 'Atlético';
    dom.window.render();
    assert.equal(dom.window.chartGames, 2);
    assert.equal(dom.window.document.querySelector('#table-stats-temporadas tbody tr:nth-child(2)').cells[2].textContent, '1');
    dom.window.close();
});
