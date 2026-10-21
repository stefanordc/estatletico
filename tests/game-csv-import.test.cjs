const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseGameCsv,
    parseBrazilianDateToIso,
    expandPlayerSubstitutionChain,
    parseMandoCell,
    resolveGameCsvAgainstCatalogs,
    findUniquePlayerForSeason,
    findRegisteredCoachName
} = require('../game-csv-import.js');

const SAMPLE_CSV_LEGACY = `Data\tMandante\tGols do mandante\tGols do visitante\tVisitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tEduardo\tJogador\t1\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tAlessandro\tJogador\t1\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tJuninho\tJogador\t0\t0\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tAlex Mineiro\tJogador\t1\t1\tLevir Culpi
27/06/2004\tAtlético\t0\t1\tAtlético PR\tMineirão\t5973\t60089,00\tEdílson Soares da Silva\tPaulo Bonamigo\tTécnico\t\t\tLevir Culpi`;

const SAMPLE_CSV = `Data\tCampeonato\tAdversário\tMando\tGols do mandante\tGols do visitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tVelloso\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tCicinho\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tNeguete\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tAlessandro\tJogador\t0\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tKim\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tCelso Roth\tTécnico\t\t\tJosé Ângelo`;

const SAMPLE_CSV_MANDO_CASA = `Data\tCampeonato\tAdversário\tMando\tGols do mandante\tGols do visitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
13/12/2003\tCampeonato Brasileiro\tGoiás\tCasa\t3\t2\tIpatingão\t7454\t37270,00\tEdílson Soares da Silva\tVelloso\tJogador\t1\t0\tCuca
13/12/2003\tCampeonato Brasileiro\tGoiás\tCasa\t3\t2\tIpatingão\t7454\t37270,00\tEdílson Soares da Silva\tProcópio Cardoso\tTécnico\t\t\tCuca`;

test('converte data brasileira para ISO', () => {
    assert.equal(parseBrazilianDateToIso('27/06/2004'), '2004-06-27');
    assert.equal(parseBrazilianDateToIso('09/02/2003'), '2003-02-09');
    assert.equal(parseBrazilianDateToIso('2004-06-27'), '2004-06-27');
});

test('parseia CSV com Campeonato, Adversário e Mando', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.match.format, 'adversario');
    assert.equal(parsed.match.dataIso, '2003-02-09');
    assert.equal(parsed.match.temporada, '2003');
    assert.equal(parsed.match.campeonato, 'Mineiro');
    assert.equal(parsed.match.adversario, 'Tupi');
    assert.equal(parsed.match.mando, 'Casa');
    assert.equal(parsed.match.mandoResolved, 'casa');
    assert.equal(parsed.match.golsMandante, 1);
    assert.equal(parsed.match.golsVisitante, 1);
    assert.equal(parsed.match.estadio, 'Mario Helênio');
    assert.equal(parsed.match.publico, 18449);
    assert.equal(parsed.match.renda, 80872);
    assert.equal(parsed.match.arbitro, 'Alício Pena Junior');
    assert.equal(parsed.players.length, 5);
    assert.equal(parsed.players[3].titular, false);
    assert.equal(parsed.coaches.length, 1);
    assert.equal(parsed.coaches[0].tecnicoAtletico, 'Celso Roth');
    assert.equal(parsed.coaches[0].tecnicoAdversario, 'José Ângelo');
});

test('Mando Casa coloca Atlético em Casa mesmo se o estádio for do adversário', () => {
    const parsed = parseGameCsv(SAMPLE_CSV_MANDO_CASA);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Campeonato Brasileiro' }],
        adversarios: [{ id: 1, clube: 'Atlético' }, { id: 2, clube: 'Goiás' }],
        estadios: [{ id: 9, nome: 'Ipatingão', estado: 'MG', pais: 'Brasil', mandante: 'Goiás' }],
        arbitros: [{ nome: 'Edílson Soares da Silva', federacao: 'MG' }],
        jogadores: [
            { id: 1, id_jogador: 11, nome_guerra: 'Velloso', posicao: 'Goleiro', temporada: '2003' }
        ],
        tecnicosAdversarios: ['Cuca'],
        tecnicosAtletico: ['Procópio Cardoso']
    });

    assert.equal(parsed.match.mandoResolved, 'casa');
    assert.equal(resolved.filled.Mando, 'Casa');
    assert.equal(resolved.match.orientationSource, 'mando');
    assert.equal(resolved.match.mandanteFromStadium, false);
    assert.equal(resolved.match.mandanteResolved, 'Atlético');
    assert.equal(resolved.match.visitanteResolved, 'Goiás');
    assert.equal(resolved.match.golsMandante, 3);
    assert.equal(resolved.match.golsVisitante, 2);
    assert.equal(resolved.filled.Adversário, 'Goiás');
    assert.equal(resolved.tecnicoAdversario, 'Cuca');
});

test('Mando Fora coloca Atlético em Fora', () => {
    const csv = SAMPLE_CSV_MANDO_CASA.replaceAll('\tCasa\t', '\tFora\t');
    const parsed = parseGameCsv(csv);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Campeonato Brasileiro' }],
        adversarios: [{ clube: 'Atlético' }, { clube: 'Goiás' }],
        estadios: [{ nome: 'Ipatingão', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(parsed.match.mandoResolved, 'fora');
    assert.equal(resolved.filled.Mando, 'Fora');
    assert.equal(resolved.match.orientationSource, 'mando');
    assert.equal(resolved.match.mandanteResolved, 'Goiás');
    assert.equal(resolved.match.visitanteResolved, 'Atlético');
});

test('sem Mando, casa/fora ainda usam o mandante do estádio', () => {
    const csv = `Data\tCampeonato\tAdversário\tGols do mandante\tGols do visitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
09/02/2003\tMineiro\tTupi\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tVelloso\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tCelso Roth\tTécnico\t\t\tJosé Ângelo`;
    const parsed = parseGameCsv(csv);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Mineiro' }],
        adversarios: [{ clube: 'Atlético' }, { clube: 'Tupi' }],
        estadios: [{ nome: 'Mario Helênio', mandante: 'Tupi' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.match.orientationSource, 'stadium');
    assert.equal(resolved.match.mandanteResolved, 'Tupi');
    assert.equal(resolved.match.visitanteResolved, 'Atlético');
});

test('parseMandoCell reconhece Casa e Fora', () => {
    assert.equal(parseMandoCell('Casa'), 'casa');
    assert.equal(parseMandoCell('fora'), 'fora');
    assert.equal(parseMandoCell(''), null);
    assert.equal(parseMandoCell('neutro'), null);
});

test('ainda parseia e resolve o formato legado Mandante/Visitante', () => {
    const parsed = parseGameCsv(SAMPLE_CSV_LEGACY);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.match.format, 'legacy');
    assert.equal(parsed.match.mandante, 'Atlético');
    assert.equal(parsed.match.visitante, 'Atlético PR');

    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [],
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

test('casa Atlético PR com cadastro Atlético-PR no formato legado', () => {
    const parsed = parseGameCsv(SAMPLE_CSV_LEGACY);
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

test('no formato legado ignora mandante do estádio e usa o adversário do CSV', () => {
    const parsed = parseGameCsv(SAMPLE_CSV_LEGACY);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ id: 1, clube: 'Atlético' }, { id: 2, clube: 'Atlético-PR' }],
        estadios: [{ id: 9, nome: 'Mineirão', estado: 'MG', pais: 'Brasil', mandante: 'Cruzeiro' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.match.mandanteFromStadium, false);
    assert.equal(resolved.match.mandanteResolved, 'Atlético');
    assert.equal(resolved.match.visitanteResolved, 'Atlético-PR');
    assert.equal(resolved.match.adversarioResolved, 'Atlético-PR');
    assert.equal(resolved.match.estadioId, 9);
});

test('quando o Atlético é visitante no CSV legado, o mandante extraído é o adversário', () => {
    const csv = SAMPLE_CSV_LEGACY
        .replaceAll('Atlético\t0\t1\tAtlético PR', 'Cruzeiro\t1\t0\tAtlético')
        .replaceAll('Mineirão', 'Mineirão');
    const parsed = parseGameCsv(csv);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        adversarios: [{ clube: 'Atlético' }, { clube: 'Cruzeiro' }],
        estadios: [{ nome: 'Mineirão', estado: 'MG', pais: 'Brasil', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.match.mandanteResolved, 'Cruzeiro');
    assert.equal(resolved.match.visitanteResolved, 'Atlético');
    assert.equal(resolved.match.adversarioResolved, 'Cruzeiro');
});

test('campeonato ausente no cadastro vai para missing', () => {
    const parsed = parseGameCsv(SAMPLE_CSV);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Brasileirão' }],
        adversarios: [{ clube: 'Atlético' }, { clube: 'Tupi' }],
        estadios: [{ nome: 'Mario Helênio', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });
    assert.equal(resolved.match.campeonatoResolved, undefined);
    assert.ok(resolved.missing.some(item => item.campo === 'Campeonato' && item.valor === 'Mineiro'));
});

test('casa Campeonato Mineiro com cadastro Mineiro', () => {
    const csv = SAMPLE_CSV.replaceAll('\tMineiro\tTupi\t', '\tCampeonato Mineiro\tTupi\t');
    const parsed = parseGameCsv(csv);
    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Mineiro' }],
        adversarios: [{ clube: 'Atlético' }, { clube: 'Tupi' }],
        estadios: [{ nome: 'Mario Helênio', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });
    assert.equal(resolved.match.campeonatoResolved, 'Mineiro');
    assert.equal(resolved.filled.Campeonato, 'Mineiro');
});

test('expande titular (sub1) (sub2) em cadeia de substituições', () => {
    const chain = expandPlayerSubstitutionChain('Kim (Gutierrez) (Marquinhos)', {
        titular: true,
        gols: 1,
        lineNumber: 4
    });
    assert.equal(chain.length, 3);
    assert.deepEqual(chain.map(p => p.jogador), ['Kim', 'Gutierrez', 'Marquinhos']);
    assert.equal(chain[0].titular, true);
    assert.equal(chain[0].substituido, true);
    assert.equal(chain[0].gols, 1);
    assert.equal(chain[1].titular, false);
    assert.equal(chain[1].substituido, true);
    assert.equal(chain[1].gols, 0);
    assert.equal(chain[2].titular, false);
    assert.equal(chain[2].substituido, false);
});

test('expande forma truncada Gutierrez) (Marquinhos em dois reservas', () => {
    const chain = expandPlayerSubstitutionChain('Gutierrez) (Marquinhos', {
        titular: false,
        gols: 0,
        lineNumber: 8
    });
    assert.equal(chain.length, 2);
    assert.equal(chain[0].jogador, 'Gutierrez');
    assert.equal(chain[0].titular, false);
    assert.equal(chain[0].substituido, true);
    assert.equal(chain[1].jogador, 'Marquinhos');
    assert.equal(chain[1].titular, false);
    assert.equal(chain[1].substituido, false);
});

test('CSV com cadeia de substituições resolve jogadores separados', () => {
    const csv = `Data\tCampeonato\tAdversário\tMando\tGols do mandante\tGols do visitante\tEstádio\tPúblico\tRenda\tÁrbitro\tJogador\tFunção\tTitular\tGols\tTécnico adversário
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tNem\tJogador\t1\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tGutierrez) (Marquinhos\tJogador\t0\t0\tJosé Ângelo
09/02/2003\tMineiro\tTupi\tCasa\t1\t1\tMario Helênio\t18449\t80872,00\tAlício Pena Junior\tCelso Roth\tTécnico\t\t\tJosé Ângelo`;
    const parsed = parseGameCsv(csv);
    assert.equal(parsed.players.length, 3);
    assert.deepEqual(parsed.players.map(p => p.jogador), ['Nem', 'Gutierrez', 'Marquinhos']);

    const resolved = resolveGameCsvAgainstCatalogs(parsed, {
        competicoes: [{ campeonato: 'Mineiro' }],
        adversarios: [{ clube: 'Atlético' }, { clube: 'Tupi' }],
        estadios: [{ nome: 'Mario Helênio', mandante: 'Atlético' }],
        arbitros: [],
        jogadores: [
            { id: 1, id_jogador: 11, nome_guerra: 'Nem', posicao: 'Zagueiro', temporada: '2003' },
            { id: 2, id_jogador: 22, nome_guerra: 'Gutierrez', posicao: 'Meia', temporada: '2003' },
            { id: 3, id_jogador: 33, nome_guerra: 'Marquinhos', posicao: 'Atacante', temporada: '2003' }
        ],
        tecnicosAdversarios: [],
        tecnicosAtletico: []
    });

    assert.equal(resolved.players.length, 3);
    assert.equal(resolved.players[0].titular, true);
    assert.equal(resolved.players[1].titular, false);
    assert.equal(resolved.players[1].substituido, true);
    assert.equal(resolved.players[2].titular, false);
    assert.equal(resolved.players[2].substituido, false);
    assert.equal(resolved.skippedPlayers.length, 0);
    assert.ok(!resolved.missing.some(item => String(item.valor).includes('Gutierrez)')));
});
