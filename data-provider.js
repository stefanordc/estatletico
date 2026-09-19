(function (root) {
    'use strict';
    const config = root.ESTATLETICO_CONFIG;
    if (!config || !['mysql', 'supabase'].includes(config.dataSource)) throw new Error('Inicie o site com npm start ou gere a versão estática com npm run build.');
    let client;
    async function request(route, body) {
        const response = await fetch(`${config.apiUrl || ''}/api/${route}`, {
            method: body === undefined ? 'GET' : 'POST', credentials: 'include',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Estatletico-Local': '1' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Falha na API local');
        return result;
    }
    function query(table) {
        const spec = { table, action: 'select', columns: '*', filters: [] };
        const builder = {
            select(columns = '*') { spec.columns = columns; return this; },
            eq(column, value) { spec.filters.push({ op: 'eq', column, value }); return this; },
            ilike(column, value) { spec.filters.push({ op: 'ilike', column, value }); return this; },
            order(column, options = {}) { spec.order = { column, ascending: options.ascending !== false }; return this; },
            limit(value) { spec.limit = value; return this; },
            range(from, to) { spec.offset = from; spec.limit = to - from + 1; return this; },
            upsert(rows) { spec.action = 'upsert'; spec.rows = rows; return this; },
            delete() { spec.action = 'delete'; return this; },
            then(resolve, reject) {
                return request('query', spec).catch(error => ({ data: null, error: { message: error.message } })).then(resolve, reject);
            }
        };
        return builder;
    }
    root.EstatleticoData = {
        source: config.dataSource,
        cacheKey: `estatletico_cache:${config.dataSource}:${config.cacheNamespace || config.supabaseUrl || 'default'}:${config.apiUrl || location.origin}`,
        createClient(url, key) {
            if (client) return client;
            if (config.dataSource === 'supabase') {
                if (!root.supabase) throw new Error('O script do Supabase não foi carregado.');
                return client = root.supabase.createClient(config.supabaseUrl || url, config.supabaseAnonKey || key);
            }
            const listeners = [];
            async function authCall(route, body) {
                try {
                    const result = await request(route, body);
                    if (body !== undefined) listeners.forEach(fn => fn('SIGNED_IN', result.data?.session || null));
                    return result;
                } catch (error) { return { data: null, error: { message: error.message } }; }
            }
            client = { from: query,
                channel() {
                    const handlers = [];
                    return {
                        on(_kind, filter, callback) { handlers.push({ filter, callback }); return this; },
                        subscribe(callback) {
                            const events = new EventSource(`${config.apiUrl || ''}/api/events`, { withCredentials: true });
                            events.onopen = () => callback?.('SUBSCRIBED');
                            events.onerror = () => callback?.('CHANNEL_ERROR');
                            events.onmessage = event => {
                                const payload = JSON.parse(event.data);
                                for (const h of handlers) if (h.filter.table === payload.table) h.callback(payload);
                            };
                            this.unsubscribe = () => events.close();
                            return this;
                        }
                    };
                }, auth: {
                getSession: () => authCall('session'),
                signInWithPassword: data => authCall('login', data),
                signUp: async () => ({ data: null, error: { message: 'Modo local: use a senha LOCAL_ADMIN_PASSWORD configurada no .env.' } }),
                signOut: () => authCall('logout', {}),
                onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; }
            } };
            return client;
        }
    };
})(window);
