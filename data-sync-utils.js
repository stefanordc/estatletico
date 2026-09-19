(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.EstatleticoSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const DAY = 24 * 60 * 60 * 1000;
    const CACHE_MAX_AGE = 30 * DAY;
    const CORE_SELECTS = Object.freeze({
        adversarios: 'id,clube,estado,pais',
        arbitros: 'id,nome,nascimento,federacao',
        competicoes: 'id,campeonato,tipo,divisao',
        estadios: 'id,nome,cidade,estado,pais,capacidade,mandante',
        jogadores: 'id,nome_completo,nome_guerra,posicao,temporada,nacionalidade,status,pe_dominante,data_nascimento,altura,peso,num_camisa,info_extra,foraDoElenco,nascimento,numero,observacao,id_jogador',
        jogos: 'id,temporada,data,rodada,campeonato,estadio,estadioEstado,estadioPais,casa,fora,golsCasa,golsFora,vencedor,arbitro,arbitroIdade,arbitroFederacao,assistente1,assistente2,varArbitro,publico,renda,ticketMedio,tecnicoGalo,tecnicoAdv,penaltis,penaltisCasa,penaltisFora,observacao,cartoesGalo,cartoesAdv,lineupGalo,gcfavorcount,gcfavorlist,gccontracount,gccontralist,gcFavorList,gcContraList,portoesFechados,gcFavorCount,gcContraCount,adversarioId'
    });
    const MEDIA_COLUMN = Object.freeze({ adversarios: 'escudo', arbitros: 'foto', estadios: 'foto', jogadores: 'foto' });
    const mediaKey = (table, id) => `${table}:${id}`;
    const sortById = rows => [...rows].sort((left, right) => Number(left.id) - Number(right.id));
    const needsFullReload = (sync, now = Date.now()) => !sync || !Number.isFinite(Number(sync.revision)) || !Number.isFinite(Number(sync.savedAt)) || now - Number(sync.savedAt) > CACHE_MAX_AGE;
    async function applyRevisionPage(state, currentRevision, revisions, resolve) {
        const next = Object.fromEntries(Object.entries(state).map(([table, rows]) => [table, [...rows]]));
        const invalidated = new Set();
        let revision = Number(currentRevision) || 0;
        for (const change of revisions) {
            const changeRevision = Number(change.revision);
            if (!Number.isFinite(changeRevision) || changeRevision <= revision) continue;
            const table = change.table_name;
            if (!Array.isArray(next[table])) { revision = changeRevision; continue; }
            const id = String(change.row_id);
            if (change.operation === 'DELETE') {
                next[table] = next[table].filter(row => String(row.id) !== id);
            } else {
                const row = await resolve(table, id);
                next[table] = next[table].filter(item => String(item.id) !== id);
                if (row) next[table].push(row);
            }
            if (MEDIA_COLUMN[table]) invalidated.add(mediaKey(table, id));
            next[table] = sortById(next[table]);
            revision = changeRevision;
        }
        return { state: next, revision, invalidatedMedia: [...invalidated] };
    }
    return { CORE_SELECTS, MEDIA_COLUMN, CACHE_MAX_AGE, mediaKey, sortById, needsFullReload, applyRevisionPage };
});
