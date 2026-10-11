(function (root) {
    'use strict';
    let dependencies;
    let lastEntry = null;
    root.EstatleticoVisits = {
        init(options) { dependencies = options; },
        reset() { lastEntry = null; },
        async record(page) {
            const user = dependencies?.getUser();
            if (!user || dependencies.source !== 'supabase') return;
            const entry = `${user.id}:${page}`;
            if (entry === lastEntry) return;
            lastEntry = entry;
            const args = { page_name: page, visit_id: crypto.randomUUID() };
            try {
                const result = await dependencies.client.rpc('estatletico_record_visit', args);
                if (result.error) throw result.error;
            } catch (error) {
                console.warn('Não foi possível registrar o acesso à página.', error.message);
            }
        }
    };
})(window);
