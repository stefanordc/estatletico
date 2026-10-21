/**
 * Agregação dos rankings do Dashboard por ID global do jogador.
 * Homônimos (ex.: dois Guilhermes) não devem somar juntos.
 */

const getReferenceGlobalId = (reference) => {
    const id = reference?.idJogador ?? reference?.id_jogador;
    return id === undefined || id === null || id === '' ? null : String(id);
};

const addDashboardPlayerStat = (
    map,
    reference,
    season,
    amount,
    {
        getGlobalId = getReferenceGlobalId,
        resolveById = () => null,
        resolveByReference = () => null,
        normalizeName = (value) => String(value || '').trim().toLowerCase()
    } = {}
) => {
    const add = Number.parseInt(amount, 10) || 0;
    if (add <= 0) return map;

    let idJogador = getGlobalId(reference);
    let player = idJogador ? resolveById(idJogador, season) : null;
    if (!idJogador) {
        player = resolveByReference(reference, season);
        idJogador = player?.id_jogador != null ? String(player.id_jogador) : null;
    }

    const displayName = player?.nome_guerra || reference?.jogador || 'Jogador';
    if (!displayName || displayName === 'Adversário') return map;

    const key = idJogador || `nome:${normalizeName(displayName)}`;
    if (!map[key]) {
        map[key] = {
            idJogador,
            nome: displayName,
            count: 0,
            player: player || null
        };
    }
    map[key].count += add;
    if (!map[key].player && player) map[key].player = player;
    if (player?.nome_guerra) map[key].nome = player.nome_guerra;
    return map;
};

const buildDashboardPlayerRankMaps = (jogos, helpers = {}) => {
    const artilheirosMap = {};
    const amarelosMap = {};
    const vermelhosMap = {};

    (jogos || []).forEach(jogo => {
        (jogo.lineupGalo || []).forEach(entry => {
            addDashboardPlayerStat(artilheirosMap, entry, jogo.temporada, entry.golsCount, helpers);
        });
        (jogo.cartoesGalo || []).forEach(card => {
            if (!card?.jogador || card.jogador === 'Adversário') return;
            addDashboardPlayerStat(amarelosMap, card, jogo.temporada, card.amarelo, helpers);
            addDashboardPlayerStat(vermelhosMap, card, jogo.temporada, card.red, helpers);
        });
    });

    return { artilheirosMap, amarelosMap, vermelhosMap };
};

if (typeof module !== 'undefined') {
    module.exports = {
        getReferenceGlobalId,
        addDashboardPlayerStat,
        buildDashboardPlayerRankMaps
    };
}
