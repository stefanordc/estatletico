'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { openPg } = require('../database/connections.cjs');

(async () => {
    const db = await openPg();
    try {
        await db.query(fs.readFileSync(path.join(__dirname, '../supabase_account_settings.sql'), 'utf8'));
        const { rows: users } = await db.query("select id, lower(email) = 'stefanobrunofaria@gmail.com' as admin from auth.users order by id");
        for (const user of users) {
            await db.query('begin');
            try {
                await db.query('set local role authenticated');
                await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user.id]);
                const result = await db.query('select count(*)::int as count from public.estatletico_list_users(0, 500)');
                if (!user.admin) throw new Error('Falha de segurança: usuário comum acessou a listagem.');
                if (result.rows[0].count !== Math.min(users.length, 500)) throw new Error('Página administrativa incompleta.');
                console.log('Consulta administrativa validada.');
            } catch (error) {
                if (user.admin || error.code !== '42501') throw error;
                console.log('Acesso de usuário comum bloqueado pelo banco.');
            } finally { await db.query('rollback'); }
        }
        const { rows } = await db.query("select has_function_privilege('anon', 'public.estatletico_list_users(integer,integer)', 'execute') as anon_allowed, p.prosecdef from pg_proc p where p.oid = 'public.estatletico_list_users(integer,integer)'::regprocedure");
        if (rows[0].anon_allowed || rows[0].prosecdef) throw new Error('Privilégios incorretos na função pública.');
        console.log('Configurações implantadas; função pública sem privilégios elevados e acesso anônimo bloqueado.');
    } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
