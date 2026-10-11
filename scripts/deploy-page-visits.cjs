'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openPg } = require('../database/connections.cjs');
(async () => {
    const db = await openPg();
    try {
        await db.query(fs.readFileSync(path.join(__dirname, '../supabase_page_visits.sql'), 'utf8'));
        const users = (await db.query("select id, lower(email) = 'stefanobrunofaria@gmail.com' as admin from auth.users")).rows;
        for (const user of users) {
            await db.query('begin');
            try {
                await db.query('set local role authenticated');
                await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user.id]);
                const eventId = crypto.randomUUID();
                await db.query('select public.estatletico_record_visit($1, $2)', ['dashboard', eventId]);
                await db.query('select public.estatletico_record_visit($1, $2)', ['dashboard', eventId]);
                console.log('Registro autenticado e repetição idempotente validados.');
                const result = await db.query("select * from public.estatletico_user_page_accesses($1, (now() at time zone 'America/Sao_Paulo')::date)", [user.id]);
                if (!user.admin) throw new Error('Usuário comum conseguiu consultar o relatório.');
                if (!result.rows.some(row => row.page === 'dashboard' && Number(row.accesses) >= 1)) throw new Error('Relatório não contou o acesso.');
                console.log('Relatório administrativo validado.');
            } catch (error) {
                if (user.admin || error.code !== '42501') throw error;
                console.log('Relatório bloqueado para usuário comum.');
            } finally { await db.query('rollback'); }
        }
        const privileges = (await db.query("select has_table_privilege('authenticated','public.estatletico_page_visits','select') as can_read, has_column_privilege('authenticated','public.estatletico_page_visits','user_id','insert') as can_impersonate, has_column_privilege('authenticated','public.estatletico_page_visits','visited_at','insert') as can_change_date, has_function_privilege('anon','public.estatletico_user_page_accesses(uuid,date)','execute') as anon_report")).rows[0];
        if (Object.values(privileges).some(Boolean)) throw new Error('Privilégios de histórico incorretos.');
        console.log('Leitura direta, falsificação de usuário/data e consulta anônima bloqueadas.');
        console.log('Histórico implantado. Os registros de teste foram revertidos.');
    } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
