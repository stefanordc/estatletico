const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function setup(admin = false) {
    const dom = new JSDOM(`<button id="settings-users-tab"></button><button id="settings-account-tab"></button><div id="settings-account-panel"></div><div id="settings-users-panel" class="hidden"><table><tbody id="settings-users-body"></tbody></table></div><form id="settings-account-form"><input id="settings-name"><input id="settings-email" type="email"><input id="settings-password"><input id="settings-password-confirm"><button id="settings-save"></button></form><p id="settings-message"></p>`, { runScripts: 'outside-only' });
    const user = { id: 'id', email: admin ? 'stefanobrunofaria@gmail.com' : 'user@example.com', user_metadata: { name: 'Nome' } };
    const calls = [];
    const client = { auth: { updateUser: async attributes => { calls.push(attributes); return { data: { user: { ...user, user_metadata: attributes.data } }, error: null }; } }, rpc: async (name, args) => { calls.push({ name, args }); return { data: [{ nome: '<script>Nome</script>', email: 'user@example.com', created_at: '2026-01-01T12:00:00Z', last_sign_in_at: null }], error: null }; } };
    dom.window.eval(fs.readFileSync('settings.js', 'utf8'));
    dom.window.EstatleticoSettings.init({ client, getUser: () => user, isAdmin: () => admin, onUserUpdated: () => {}, source: 'supabase' });
    dom.window.EstatleticoSettings.render();
    return { dom, calls, client };
}

test('usuário comum não vê usuários nem faz consulta administrativa', async () => {
    const { dom, calls } = setup();
    assert.equal(dom.window.document.getElementById('settings-users-tab').classList.contains('hidden'), true);
    await dom.window.EstatleticoSettings.showTab('users');
    assert.equal(calls.length, 0);
    dom.window.close();
});

test('admin consulta usuários e exibe valores como texto, com último acesso ausente', async () => {
    const { dom, calls } = setup(true);
    await dom.window.EstatleticoSettings.showTab('users');
    assert.equal(calls[0].name, 'estatletico_list_users');
    const body = dom.window.document.getElementById('settings-users-body');
    assert.equal(body.querySelector('script'), null);
    assert.match(body.textContent, /Nunca acessou/);
    dom.window.close();
});

test('atualiza nome e e-mail sem enviar senha em branco; rejeita confirmação diferente', async () => {
    const { dom, calls } = setup();
    const doc = dom.window.document;
    doc.getElementById('settings-name').value = 'Novo nome';
    doc.getElementById('settings-email').value = 'novo@example.com';
    await dom.window.EstatleticoSettings.save();
    assert.equal(calls[0].data.name, 'Novo nome');
    assert.equal(calls[0].email, 'novo@example.com');
    assert.equal(calls[0].password, undefined);
    doc.getElementById('settings-password').value = '12345678';
    doc.getElementById('settings-password-confirm').value = '87654321';
    await dom.window.EstatleticoSettings.save();
    assert.equal(calls.length, 1);
    assert.match(doc.getElementById('settings-message').textContent, /não coincidem/);
    dom.window.close();
});

test('renderização em segundo plano preserva alterações ainda não salvas', () => {
    const { dom } = setup();
    const doc = dom.window.document;
    doc.getElementById('settings-name').value = 'Editando';
    doc.getElementById('settings-email').value = 'editando@example.com';
    doc.getElementById('settings-password').value = 'SenhaNova123';
    dom.window.EstatleticoSettings.render();
    assert.equal(doc.getElementById('settings-name').value, 'Editando');
    assert.equal(doc.getElementById('settings-email').value, 'editando@example.com');
    assert.equal(doc.getElementById('settings-password').value, 'SenhaNova123');
    dom.window.close();
});

test('lista todos os usuários quando há mais de uma página', async () => {
    const { dom, calls, client } = setup(true);
    client.rpc = async (name, args) => {
        calls.push(args.page_offset);
        return { data: Array.from({ length: args.page_offset === 0 ? 500 : 2 }, (_, index) => ({ nome: `Usuário ${args.page_offset + index}`, email: 'user@example.com', created_at: '2026-01-01T12:00:00Z' })), error: null };
    };
    await dom.window.EstatleticoSettings.showTab('users');
    assert.deepEqual(calls, [0, 500]);
    assert.equal(dom.window.document.querySelectorAll('#settings-users-body tr').length, 502);
    dom.window.close();
});

test('envia senha confirmada e limpa os campos após sucesso', async () => {
    const { dom, calls } = setup();
    dom.window.document.getElementById('settings-password').value = 'SenhaNova123';
    dom.window.document.getElementById('settings-password-confirm').value = 'SenhaNova123';
    await dom.window.EstatleticoSettings.save();
    assert.equal(calls[0].password, 'SenhaNova123');
    assert.equal(dom.window.document.getElementById('settings-password').value, '');
    assert.equal(dom.window.document.getElementById('settings-password-confirm').value, '');
    dom.window.close();
});

test('Configurações é o último item do menu e o módulo carrega antes do app', () => {
    const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'));
    const items = dom.window.document.querySelectorAll('.nav-item');
    assert.equal(items[items.length - 1].dataset.page, 'configuracoes');
    const scripts = Array.from(dom.window.document.scripts, script => script.getAttribute('src'));
    assert.ok(scripts.indexOf('settings.js') < scripts.indexOf('app.js'));
    dom.window.close();
});

test('admin seleciona usuário e mês para consultar acessos por página', async () => {
    const { dom, calls, client } = setup(true);
    const doc = dom.window.document;
    const panel = doc.createElement('div');
    panel.id = 'settings-access-panel';
    panel.innerHTML = '<h3 id="settings-access-title"></h3><input type="month" id="settings-access-month" value="2026-09"><table><tbody id="settings-access-body"></tbody></table>';
    doc.body.appendChild(panel);
    client.rpc = async (name, args) => { calls.push({ name, args }); return { data: [{ page: 'cartoes', accesses: 7 }], error: null }; };
    await dom.window.EstatleticoSettings.showTab('users');
    await dom.window.EstatleticoSettings.showAccesses({ id: 'target', nome: 'Usuário' });
    const call = calls.find(item => item.name === 'estatletico_user_page_accesses');
    assert.equal(call.args.target_user, 'target');
    assert.equal(call.args.selected_month, '2026-09-01');
    assert.match(doc.getElementById('settings-access-body').textContent, /Cartões7/);
    dom.window.close();
});
