const normalizePlayerLookupName = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const selectMostRecentPlayer = players => [...players].sort((a, b) => {
    const seasonA = Number(a.temporada) || 0;
    const seasonB = Number(b.temporada) || 0;
    if (seasonA !== seasonB) return seasonB - seasonA;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
})[0];

const getPlayerAutofillValues = player => player ? ({
    nome_guerra: player.nome_guerra || '',
    posicao: player.posicao || '',
    nacionalidade: player.nacionalidade || '',
    nascimento: player.nascimento || '',
    foto: player.foto || ''
}) : null;

const shouldApplyAutofillValue = ({ candidate, currentValue = '', dirty = false, autoFilled = false }) =>
    Boolean(candidate) && !dirty && (!currentValue || autoFilled);

const getGamePlayerGlobalId = reference => {
    const id = reference?.idJogador ?? reference?.id_jogador;
    return id === undefined || id === null || id === '' ? null : String(id);
};

if (typeof module !== 'undefined') {
    module.exports = { normalizePlayerLookupName, selectMostRecentPlayer, getPlayerAutofillValues, shouldApplyAutofillValue, getGamePlayerGlobalId };
}
