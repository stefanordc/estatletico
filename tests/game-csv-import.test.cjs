const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseGameCsv,
    parseBrazilianDateToIso,
    resolveGameCsvAgainstCatalogs,
    findUniquePlayerForSeason,
    findRegisteredCoachName
} = require('../game-csv-import.js');

const SAMPLE_CSV = `Data\tMandante\tGols do mandante\tGols do visitante\tVisitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tEduardo\tJogador\t1\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tAlessandro\tJogador\t1\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tJuninho\tJogador\t0\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tAlex Mineiro\tJogador\t1\t1\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tPaulo Bonamigo\tTécnico\t\t\tLevir Culpi`;

test('converte data brasileira para ISO', () => {
    assert.equal(parseBrazilianDateToIso('27/06/2004'), '2004-06-27');
    assert.equal(parseBrazilianDateToIso('2004-06-27'), '2004-06-27');
});

test('parseia CSV TSV e deduplica dados do jogo', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.match.dataIso, '2004-06-27');
    assert.equal(parsed.match.temporada, '2004');
    assert.equal(parsed.match.mandante, 'Atlético');
    assert.equal(parsed.match.visitante, 'Atlético PR');
    assert.equal(parsed.match.golsMandante, 0);
    assert.equal(parsed.match.golsVisitante, 1);
    assert.equal(parsed.match.estadio, 'Mineirão');
    assert.equal(parsed.match.publico, 5973);
    assert.equal(parsed.match.renda, 60089);
    assert.equal(parsed.match.arbitro, 'Edílson Soares da Silva');
    assert.equal(parsed.players.length, 4);
    assert.equal(parsed.players[2].titular, false);
    assert.equal(parsed.players[3].gols, 1);
    assert.equal(parsed.coaches.length, 1);
    assert.equal(parsed.coaches[0].tecnicoAtletico, 'Paulo Bonamigo');
    assert.equal(parsed.coaches[0].tecnicoAdversario, 'Levir Culpi');
});

test('resolve somente entidades já cadastradas e salta jogadores desconhecidos', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ clube: 'Atlético' }, { clube: 'Atlético-PR' }],
        estadios: [{ nome: 'Mineirão', estado: 'MG', pais: 'Brasil' }],
        arbitros: [{ nome: 'Edílson Soares da Silva', federacao: 'MG' }],
        jogadores: [
            { id: 1, id_jogador: 11, nome_guerra: 'Eduardo', posicao: 'Zagueiro', temporada: '2004' },
            { id: 2, id_jogador: 22, nome_guerra: 'Alessandro', posicao: 'Lateral', temporada: '2004' },
            { id: 3, id_jogador: 33, nome_guerra: 'Alex Mineiro', posicao: 'Atacante', temporada: '2004' }
        ],
        tecnicosAdversarios: ['Levir Culpi'],
        tecnicosAtletico: ['Paulo Bonamigo']
    });

    assert.equal(resolved.filled.Mandante, 'Atlético');
    assert.equal(resolved.filled.Estádio, 'Mineirão');
    assert.equal(resolved.filled.Árbitro, 'Edílson Soares da Silva');
    assert.equal(resolved.tecnicoAdversario, 'Levir Culpi');
    assert.equal(resolved.tecnicoAtletico, 'Paulo Bonamigo');
    assert.equal(resolved.players.length, 3);
    assert.equal(resolved.players[2].titular, true);
    assert.equal(resolved.players[2].golsCount, 1);
    assert.equal(resolved.skippedPlayers.length, 1);
    assert.equal(resolved.skippedPlayers[0].jogador, 'Juninho');
    assert.equal(resolved.filled.Visitante, 'Atlético-PR');
    assert.ok(resolved.missing.some(item => item.campo === 'Jogador' && item.valor === 'Juninho'));
});

test('casa Atlético PR com cadastro Atlético-PR', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ clube: 'Atlético' }, { clube: 'Atlético-PR' }],
        estadios: [],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });
    assert.equal(resolved.filled.Visitante, 'Atlético-PR');
});

test('jogador só casa com nome único na temporada', () => {
    const players = [
        { id: 1, nome_guerra: 'Renato', posicao: 'Meia', temporada: '2004' },
        { id: 2, nome_guerra: 'Renato', posicao: 'Atacante', temporada: '2004' }
    ];
    assert.equal(findUniquePlayerForSeason(players, 'Renato', '2004'), null);
    assert.equal(findUniquePlayerForSeason([players[0]], 'renato', '2004')?.id, 1);
});

test('técnico adversário só preenche se já existir no histórico', () => {
    assert.equal(findRegisteredCoachName(['Levir Culpi', 'Muricy Ramalho'], 'levir culpi'), 'Levir Culpi');
    assert.equal(findRegisteredCoachName(['Muricy Ramalho'], 'Levir Culpi'), null);
});

test('mandante do estádio prevalece sobre o mandante do CSV', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ clube: 'Atlético' }, { clube: 'Atlético-PR' }],
        estadios: [{ nome: 'Mineirão', estado: 'MG', pais: 'Brasil', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.match.mandanteFromStadium, true);
    assert.equal(resolved.match.mandanteResolved, 'Atlético');
    assert.equal(resolved.filled.Mandante, 'Atlético');
    assert.equal(resolved.match.visitanteResolved, 'Atlético-PR');
});

test('estádio com mandante adversário coloca Atlético como visitante', () => {
    const parsed = parseGameCsv(SAMPLE_CSV.replaceAll('Mineirão', 'Arena da Baixada'));
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ clube: 'Atlético' }, { clube: 'Atlético-PR' }],
        estadios: [{ nome: 'Arena da Baixada', estado: 'PR', pais: 'Brasil', mandante: 'Atlético-PR' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.match.mandanteResolved, 'Atlético-PR');
    assert.equal(resolved.match.visitanteResolved, 'Atlético');
});
