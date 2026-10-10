(function (root) {
    'use strict';
    let dependencies;
    let activeTab = 'account';
    let requestVersion = 0;
    let saving = false;
    let loadedUserId = null;
    const el = id => document.getElementById(id);
    const message = (text, error = false) => {
        el('settings-message').textContent = text;
        el('settings-message').classList.toggle('error', error);
    };
    const formatDate = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nunca acessou';
    function syncPermissions() {
        const admin = Boolean(dependencies?.isAdmin());
        if (!dependencies?.getUser()) {
            loadedUserId = null;
            ['name', 'email', 'password', 'password-confirm'].forEach(field => {
                if (el(`settings-${field}`)) el(`settings-${field}`).value = '';
            });
        }
        el('settings-users-tab')?.classList.toggle('hidden', !admin);
        if (!admin) {
            requestVersion++;
            el('settings-users-body')?.replaceChildren();
            activeTab = 'account';
        }
        el('settings-account-panel')?.classList.toggle('hidden', activeTab !== 'account');
        el('settings-users-panel')?.classList.toggle('hidden', activeTab !== 'users' || !admin);
        ['account', 'users'].forEach(tab => {
            el(`settings-${tab}-tab`)?.classList.toggle('active', activeTab === tab);
            el(`settings-${tab}-tab`)?.setAttribute('aria-selected', String(activeTab === tab));
        });
    }
    async function showTab(tab) {
        if (!dependencies || (tab === 'users' && !dependencies.isAdmin())) return;
        activeTab = tab;
        syncPermissions();
        if (tab !== 'users') { requestVersion++; return; }
        const version = ++requestVersion;
        const body = el('settings-users-body');
        body.textContent = 'Carregando usuários…';
        try {
            if (dependencies.source !== 'supabase') throw new Error('A lista de usuários está disponível no site conectado ao Supabase.');
            const users = [];
            for (let offset = 0; ; offset += 500) {
                const { data, error } = await dependencies.client.rpc('estatletico_list_users', { page_offset: offset, page_size: 500 });
                if (error) throw error;
                if (version !== requestVersion || !dependencies.isAdmin()) return;
                users.push(...(data || []));
                if (!data || data.length < 500) break;
            }
            body.replaceChildren();
            users.forEach(user => {
                const row = document.createElement('tr');
                [user.nome || 'Não informado', user.email || '-', formatDate(user.created_at), formatDate(user.last_sign_in_at)].forEach(value => {
                    const cell = document.createElement('td');
                    cell.textContent = value;
                    row.appendChild(cell);
                });
                body.appendChild(row);
            });
            if (!users.length) body.textContent = 'Nenhum usuário cadastrado.';
        } catch (error) {
            if (version === requestVersion && dependencies.isAdmin()) body.textContent = `Não foi possível carregar os usuários: ${error.message || 'tente novamente.'}`;
        }
    }
    function render() {
        if (!dependencies) return;
        syncPermissions();
        const user = dependencies.getUser();
        if (loadedUserId !== user?.id) {
            loadedUserId = user?.id;
            el('settings-name').value = user?.user_metadata?.name || user?.user_metadata?.full_name || '';
            el('settings-email').value = user?.email || '';
            el('settings-password').value = '';
            el('settings-password-confirm').value = '';
            message(dependencies.source === 'supabase' ? '' : 'A alteração da conta está disponível no site conectado ao Supabase.');
        }
        el('settings-save').disabled = saving || dependencies.source !== 'supabase';
        if (activeTab === 'users') void showTab('users');
    }
    async function save() {
        if (saving || !dependencies?.getUser()) return;
        const name = el('settings-name').value.trim();
        const email = el('settings-email').value.trim().toLowerCase();
        const password = el('settings-password').value;
        const confirmation = el('settings-password-confirm').value;
        if (!name) { message('Informe seu nome.', true); return; }
        if (!email || !el('settings-email').checkValidity()) { message('Informe um e-mail válido.', true); return; }
        if (password !== confirmation) { message('As senhas não coincidem.', true); return; }
        if (password && password.length < 6) { message('A senha precisa ter pelo menos 6 caracteres.', true); return; }
        if (dependencies.source !== 'supabase') { message('A alteração da conta está disponível no site conectado ao Supabase.', true); return; }
        const emailChanged = email !== dependencies.getUser().email;
        const userId = dependencies.getUser().id;
        const attributes = { data: { name } };
        if (emailChanged) attributes.email = email;
        if (password) attributes.password = password;
        saving = true;
        el('settings-save').disabled = true;
        message('Salvando…');
        try {
            const { data, error } = await dependencies.client.auth.updateUser(attributes);
            if (error) throw error;
            if (dependencies.getUser()?.id !== userId) return;
            if (data?.user) dependencies.onUserUpdated(data.user);
            el('settings-password').value = '';
            el('settings-password-confirm').value = '';
            message(emailChanged ? 'Dados salvos. Confira seus e-mails para confirmar a alteração do endereço de acesso.' : 'Dados de acesso atualizados.');
        } catch (error) {
            if (dependencies.getUser()?.id === userId) message(error.message || 'Não foi possível salvar. Tente novamente.', true);
        } finally {
            saving = false;
            el('settings-save').disabled = false;
            syncPermissions();
        }
    }
    root.EstatleticoSettings = {
        init(options) {
            dependencies = options;
            el('settings-account-form').addEventListener('submit', event => { event.preventDefault(); void save(); });
            el('settings-account-tab').addEventListener('click', () => void showTab('account'));
            el('settings-users-tab').addEventListener('click', () => void showTab('users'));
        }, render, save, showTab, syncPermissions
    };
})(window);
