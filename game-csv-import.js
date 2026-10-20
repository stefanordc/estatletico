/**
 * Parser e matching do CSV de importação de jogos do Estatlético.
 * Aceita TSV (colar do Excel/Sheets) e CSV com ; ou ,.
 */

const GAME_CSV_HEADERS = [
    'Data',
    'Mandante',
    'Gols do mandante',
    'Gols do visitante',
    'Visitante',
    'Estádio',
    'Público',
    'Renda',
    'Árbitro',
    'Jogador',
    'Função',
    'Titular',
    'Gols',
    'Técnico adversário'
];

const MATCH_UNIQUE_FIELDS = [
    'data',
    'mandante',
    'golsMandante',
    'golsVisitante',
    'visitante',
    'estadio',
    'publico',
    'renda',
    'arbitro',
    'tecnicoAdversario'
];

const normalizeImportText = (str) => {
    if (str === undefined || str === null) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
};

const detectDelimiter = (headerLine) => {
    if (headerLine.includes('\t')) return '\t';
    if (headerLine.split(';').length >= headerLine.split(',').length) return ';';
    return ',';
};

const splitCsvLine = (line, delimiter) => {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === delimiter && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    cells.push(current.trim());
    return cells;
};

const normalizeHeaderName = (header) => normalizeImportText(header)
    .replace(/^gols do mandante$/, 'gols do mandante')
    .replace(/^gols do visitante$/, 'gols do visitante')
    .replace(/^tecnico adversario$/, 'tecnico adversario')
    .replace(/^estadio$/, 'estadio')
    .replace(/^arbitro$/, 'arbitro');

const HEADER_ALIASES = {
    data: 'data',
    mandante: 'mandante',
    'gols do mandante': 'golsMandante',
    'gols do visitante': 'golsVisitante',
    visitante: 'visitante',
    estadio: 'estadio',
    publico: 'publico',
    renda: 'renda',
    arbitro: 'arbitro',
    jogador: 'jogador',
    funcao: 'funcao',
    titular: 'titular',
    gols: 'gols',
    'tecnico adversario': 'tecnicoAdversario'
};

const parseBrazilianDateToIso = (value) => {
    const raw = String(value || '').trim();
    const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (br) {
        const day = br[1].padStart(2, '0');
        const month = br[2].padStart(2, '0');
        const year = br[3];
        return `${year}-${month}-${day}`;
    }
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return raw;
    return '';
};

const seasonFromIsoDate = (isoDate) => {
    const match = String(isoDate || '').match(/^(\d{4})-/);
    return match ? match[1] : '';
};

const parseIntegerCell = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const digits = raw.replace(/[^\d-]/g, '');
    if (digits === '' || digits === '-') return null;
    const num = Number.parseInt(digits, 10);
    return Number.isNaN(num) ? null : num;
};

const parseRendaCell = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    let clean = raw.replace('R$', '').replace(/\s/g, '');
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }
    const num = Number.parseFloat(clean);
    return Number.isNaN(num) ? null : num;
};

const parseTitularCell = (value) => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === '1' || raw === 'true' || raw === 'sim' || raw === 's') return true;
    if (raw === '0' || raw === 'false' || raw === 'nao' || raw === 'não' || raw === 'n') return false;
    return null;
};

const isCoachRole = (funcao) => {
    const norm = normalizeImportText(funcao);
    return norm === 'tecnico' || norm === 'treinador';
};

const parseGameCsv = (text) => {
    const source = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!source) {
        return { ok: false, error: 'Cole o CSV do jogo antes de continuar.', rows: [], match: null, players: [], coaches: [] };
    }

    const lines = source.split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim() !== '');
    if (lines.length < 2) {
        return { ok: false, error: 'O CSV precisa ter o cabeçalho e pelo menos uma linha de dados.', rows: [], match: null, players: [], coaches: [] };
    }

    const delimiter = detectDelimiter(lines[0]);
    const headerCells = splitCsvLine(lines[0], delimiter).map(normalizeHeaderName);
    const columnIndex = {};
    headerCells.forEach((header, index) => {
        const key = HEADER_ALIASES[header];
        if (key && columnIndex[key] === undefined) columnIndex[key] = index;
    });

    const required = ['data', 'mandante', 'visitante', 'jogador', 'funcao'];
    const missing = required.filter(key => columnIndex[key] === undefined);
    if (missing.length) {
        return {
            ok: false,
            error: `Cabeçalho incompleto. Colunas obrigatórias ausentes: ${missing.join(', ')}.`,
            rows: [],
            match: null,
            players: [],
            coaches: []
        };
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i], delimiter);
        const get = (key) => {
            const idx = columnIndex[key];
            return idx === undefined ? '' : (cells[idx] ?? '');
        };
        rows.push({
            data: get('data'),
            mandante: get('mandante'),
            golsMandante: get('golsMandante'),
            golsVisitante: get('golsVisitante'),
            visitante: get('visitante'),
            estadio: get('estadio'),
            publico: get('publico'),
            renda: get('renda'),
            arbitro: get('arbitro'),
            jogador: get('jogador'),
            funcao: get('funcao'),
            titular: get('titular'),
            gols: get('gols'),
            tecnicoAdversario: get('tecnicoAdversario'),
            lineNumber: i + 1
        });
    }

    const first = rows[0];
    const match = {
        data: first.data,
        dataIso: parseBrazilianDateToIso(first.data),
        temporada: seasonFromIsoDate(parseBrazilianDateToIso(first.data)),
        mandante: first.mandante,
        golsMandante: parseIntegerCell(first.golsMandante) ?? 0,
        golsVisitante: parseIntegerCell(first.golsVisitante) ?? 0,
        visitante: first.visitante,
        estadio: first.estadio,
        publico: parseIntegerCell(first.publico),
        renda: parseRendaCell(first.renda),
        arbitro: first.arbitro,
        tecnicoAdversario: first.tecnicoAdversario
    };

    const players = [];
    const coaches = [];
    rows.forEach(row => {
        if (isCoachRole(row.funcao)) {
            coaches.push({
                tecnicoAtletico: String(row.jogador || '').trim(),
                tecnicoAdversario: String(row.tecnicoAdversario || match.tecnicoAdversario || '').trim(),
                lineNumber: row.lineNumber
            });
            return;
        }
        const name = String(row.jogador || '').trim();
        if (!name) return;
        players.push({
            jogador: name,
            funcao: String(row.funcao || '').trim(),
            titular: parseTitularCell(row.titular),
            gols: parseIntegerCell(row.gols) ?? 0,
            lineNumber: row.lineNumber
        });
    });

    return { ok: true, error: null, rows, match, players, coaches, delimiter };
};

const normalizeClubLookup = (str) => normalizeImportText(str).replace(/[-\s]+/g, ' ');

const findUniqueByNormalizedName = (list, field, rawName, { clubStyle = false } = {}) => {
    const normalize = clubStyle ? normalizeClubLookup : normalizeImportText;
    const target = normalize(rawName);
    if (!target) return null;
    const matches = (list || []).filter(item => normalize(item?.[field]) === target);
    return matches.length === 1 ? matches[0] : null;
};

const findUniquePlayerForSeason = (jogadores, name, season) => {
    const target = normalizeImportText(name);
    const seasonStr = String(season || '').trim();
    if (!target || !seasonStr) return null;
    const matches = (jogadores || []).filter(p =>
        String(p.temporada || '').trim() === seasonStr
        && p.posicao !== 'Técnico'
        && normalizeImportText(p.nome_guerra) === target
    );
    return matches.length === 1 ? matches[0] : null;
};

const findRegisteredCoachName = (knownNames, rawName) => {
    const target = normalizeImportText(rawName);
    if (!target) return null;
    const matches = [...new Set((knownNames || []).filter(Boolean))]
        .filter(name => normalizeImportText(name) === target);
    return matches.length === 1 ? matches[0] : null;
};

const resolveGameCsvAgainstCatalogs = (parsed, catalogs = {}) => {
    const missing = [];
    const resolved = {
        match: { ...parsed.match },
        filled: {},
        players: [],
        skippedPlayers: [],
        tecnicoAtletico: null,
        tecnicoAdversario: null
    };

    const tryFill = (label, rawValue, finder) => {
        const value = String(rawValue || '').trim();
        if (!value) return;
        const found = finder(value);
        if (found) {
            resolved.filled[label] = found;
        } else {
            missing.push({ campo: label, valor: value });
        }
    };

    const isAtleticoClub = (name) => {
        const norm = normalizeClubLookup(name);
        return norm === 'atletico' || norm === 'atletico mg' || norm === 'atletico mineiro';
    };

    let stadium = null;
    tryFill('Estádio', parsed.match.estadio, (value) => {
        stadium = findUniqueByNormalizedName(catalogs.estadios, 'nome', value);
        if (!stadium) return null;
        resolved.match.estadioResolved = stadium.nome;
        resolved.match.estadioId = stadium.id;
        resolved.match.estadioEstado = stadium.estado || '';
        resolved.match.estadioPais = stadium.pais || '';
        resolved.match.estadioMandante = stadium.mandante || '';
        return stadium.nome;
    });

    // Se o estádio já tem clube mandante cadastrado, ele prevalece sobre o CSV.
    // Resolvemos o nome exato no cadastro de adversários para o save gravar o ID correto.
    const stadiumHome = String(stadium?.mandante || '').trim();
    if (stadiumHome) {
        const homeClub = findUniqueByNormalizedName(catalogs.adversarios, 'clube', stadiumHome, { clubStyle: true });
        const homeName = homeClub?.clube || stadiumHome;
        resolved.match.mandanteResolved = homeName;
        resolved.match.mandanteFromStadium = true;
        resolved.filled.Mandante = homeName;
        if (homeClub?.id != null) resolved.match.mandanteId = homeClub.id;

        if (isAtleticoClub(homeName)) {
            tryFill('Visitante', parsed.match.visitante, (value) => {
                const club = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
                if (!club) return null;
                resolved.match.visitanteResolved = club.clube;
                resolved.match.visitanteId = club.id;
                return club.clube;
            });
        } else {
            const atletico = findUniqueByNormalizedName(catalogs.adversarios, 'clube', 'Atlético', { clubStyle: true });
            resolved.match.visitanteResolved = atletico?.clube || 'Atlético';
            resolved.match.visitanteId = atletico?.id;
            resolved.filled.Visitante = resolved.match.visitanteResolved;
        }
    } else {
        tryFill('Mandante', parsed.match.mandante, (value) => {
            const club = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
            if (!club) return null;
            resolved.match.mandanteResolved = club.clube;
            resolved.match.mandanteId = club.id;
            return club.clube;
        });

        tryFill('Visitante', parsed.match.visitante, (value) => {
            const club = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
            if (!club) return null;
            resolved.match.visitanteResolved = club.clube;
            resolved.match.visitanteId = club.id;
            return club.clube;
        });
    }

    tryFill('Árbitro', parsed.match.arbitro, (value) => {
        const referee = findUniqueByNormalizedName(catalogs.arbitros, 'nome', value);
        if (!referee) return null;
        resolved.match.arbitroResolved = referee.nome;
        resolved.match.arbitroId = referee.id;
        resolved.match.arbitroFederacao = referee.federacao || '';
        return referee.nome;
    });

    const coachRow = parsed.coaches[0] || null;
    const tecnicoAdvRaw = coachRow?.tecnicoAdversario || parsed.match.tecnicoAdversario;
    tryFill('Técnico adversário', tecnicoAdvRaw, (value) => {
        const name = findRegisteredCoachName(catalogs.tecnicosAdversarios, value);
        if (!name) return null;
        resolved.tecnicoAdversario = name;
        return name;
    });

    const tecnicoAtleRaw = coachRow?.tecnicoAtletico || '';
    if (tecnicoAtleRaw) {
        tryFill('Técnico do Atlético', tecnicoAtleRaw, (value) => {
            const byGames = findRegisteredCoachName(catalogs.tecnicosAtletico, value);
            if (byGames) {
                resolved.tecnicoAtletico = byGames;
                return byGames;
            }
            const byRoster = (catalogs.jogadores || []).filter(p =>
                p.posicao === 'Técnico' && normalizeImportText(p.nome_guerra) === normalizeImportText(value)
            );
            if (byRoster.length === 1) {
                resolved.tecnicoAtletico = byRoster[0].nome_guerra;
                return byRoster[0].nome_guerra;
            }
            return null;
        });
    }

    parsed.players.forEach(playerRow => {
        const player = findUniquePlayerForSeason(
            catalogs.jogadores,
            playerRow.jogador,
            parsed.match.temporada
        );
        if (!player) {
            resolved.skippedPlayers.push(playerRow);
            missing.push({ campo: 'Jogador', valor: playerRow.jogador });
            return;
        }
        resolved.players.push({
            ...playerRow,
            player,
            jogador: player.nome_guerra,
            posicao: player.posicao,
            id: player.id,
            idJogador: player.id_jogador || null,
            titular: playerRow.titular === null ? true : playerRow.titular,
            golsCount: playerRow.gols || 0
        });
    });

    // Remove duplicatas de "não encontrado" mantendo a primeira ocorrência
    const seenMissing = new Set();
    resolved.missing = missing.filter(item => {
        const key = `${normalizeImportText(item.campo)}|${normalizeImportText(item.valor)}`;
        if (seenMissing.has(key)) return false;
        seenMissing.add(key);
        return true;
    });

    return resolved;
};

if (typeof module !== 'undefined') {
    module.exports = {
        GAME_CSV_HEADERS,
        MATCH_UNIQUE_FIELDS,
        normalizeImportText,
        parseGameCsv,
        parseBrazilianDateToIso,
        seasonFromIsoDate,
        findUniqueByNormalizedName,
        findUniquePlayerForSeason,
        findRegisteredCoachName,
        resolveGameCsvAgainstCatalogs
    };
}
