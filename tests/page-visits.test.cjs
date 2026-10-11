const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('conta entradas distintas e não conta atualizações da mesma página', async () => {
    const calls = [];
    let user = { id: 'user' };
    const context = { window: {}, crypto: { randomUUID: () => `event-${calls.length}` }, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('page-visits.js', 'utf8'), context);
    const visits = context.window.EstatleticoVisits;
    visits.init({ source: 'supabase', getUser: () => user, client: { rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } } });
    await visits.record('dashboard');
    await visits.record('dashboard');
    await visits.record('cartoes');
    await visits.record('dashboard');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].args.page_name, 'dashboard');
    user = null;
    visits.reset();
    await visits.record('dashboard');
    assert.equal(calls.length, 3);
});
