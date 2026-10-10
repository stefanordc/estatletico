const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('gráficos comparativos desenham valores das barras visíveis e ignoram séries ocultas', () => {
    const source = fs.readFileSync('app.js', 'utf8');
    const block = source.slice(source.indexOf('const renderComparativoCharts ='), source.indexOf('// ESTATESTICAS FUNCTIONS'));
    const charts = [];
    const context = { compChartGM: null, compChartGS: null, document: { getElementById: () => ({ getContext: () => ({}) }) }, Chart: function (_ctx, config) { charts.push(config); } };
    vm.createContext(context);
    vm.runInContext(block + ';renderComparativoCharts([{ data: [11, 0] }, { data: [5] }], [{ data: [3] }]);', context);
    const labels = [];
    const chart = { ctx: { save() {}, restore() {}, fillText: (...args) => labels.push(args) }, data: charts[0].data, chartArea: { top: 0 }, isDatasetVisible: index => index === 0, getDatasetMeta: () => ({ data: [{ x: 20, y: 40 }, { x: 50, y: 100 }] }) };
    assert.ok(charts[0].plugins?.length);
    charts[0].plugins[0].afterDatasetsDraw(chart);
    assert.deepEqual(labels.map(args => args[0]), ['11', '0']);
    assert.ok(charts[1].plugins?.length);
});
