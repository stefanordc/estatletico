/**
 * Parser e matching do CSV de importação de jogos do Estatlético.
 * Aceita TSV (colar do Excel/Sheets) e CSV com ; ou ,.
 *
 * Formato atual:
 * Data, Campeonato, Adversário, Mando, Gols do mandante, Gols do visitante,
 * Estádio, Público, Renda, Árbitro, Jogador, Função, Titular, Gols, Técnico adversário
 *
 * Mando = Casa | Fora (posição do Atlético no jogo).
 *
 * Formato legado (ainda aceito):
 * Data, Mandante, Gols do mandante, Gols do visitante, Visitante, ...
 */

const GAME_CSV_HEADERS = [
    'Data',
    'Campeonato',
    'Adversário',
    'Mando',
    'Gols do mandante',
    'Gols do visitante',
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
    'campeonato',
    'adversario',
    'mando',
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

const normalizeHeaderName = (header) => normalizeImportText(header);

const HEADER_ALIASES = {
    data: 'data',
    campeonato: 'campeonato',
    adversario: 'adversario',
    mando: 'mando',
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

/** Normaliza Mando do CSV: 'casa' | 'fora' | null */
const parseMandoCell = (value) => {
    const norm = normalizeImportText(value);
    if (!norm) return null;
    if (norm === 'casa' || norm === 'home' || norm === 'mandante' || norm === 'c') return 'casa';
    if (norm === 'fora' || norm === 'away' || norm === 'visitante' || norm === 'f') return 'fora';
    return null;
};

const isCoachRole = (funcao) => {
    const norm = normalizeImportText(funcao);
    return norm === 'tecnico' || norm === 'treinador';
};

const normalizeClubLookup = (str) => normalizeImportText(str).replace(/[-\s]+/g, ' ');

const isAtleticoClub = (name) => {
    const norm = normalizeClubLookup(name);
    return norm === 'atletico' || norm === 'atletico mg' || norm === 'atletico mineiro';
};

/**
 * Expande célula de jogador com cadeia de substituições entre parênteses.
 *
 * "Titular (Sub1) (Sub2)" = titular saiu, Sub1 entrou e também saiu, Sub2 entrou.
 * "Gutierrez) (Marquinhos" = forma truncada da extração com os dois que entraram.
 */
const expandPlayerSubstitutionChain = (rawName, { titular = null, gols = 0, funcao = '', lineNumber } = {}) => {
    const text = String(rawName || '').trim();
    if (!text) return [];

    const makeEntry = (jogador, opts = {}) => ({
        jogador,
        funcao: String(funcao || '').trim(),
        titular: opts.titular ?? null,
        gols: opts.gols ?? 0,
        substituido: Boolean(opts.substituido),
        lineNumber,
        fromChain: Boolean(opts.fromChain)
    });

    const parenSubs = [...text.matchAll(/\(([^)]+)\)/g)]
        .map(match => String(match[1] || '').trim())
        .filter(Boolean);

    let base = '';
    let subs = [];

    if (parenSubs.length >= 2) {
        base = text.replace(/\([^)]*\)/g, '').replace(/[()]/g, '').trim();
        subs = parenSubs;
    } else {
        // Extração truncada: "Gutierrez) (Marquinhos" ou "Gutierrez) (Marquinhos)"
        const broken = text.match(/^([^()\n\t]+?)\)\s*\(([^)\n\t]+)\)?\s*$/);
        if (broken) {
            const first = broken[1].trim();
            const second = broken[2].trim();
            if (first && second) {
                subs = [first, second];
            }
        }
    }

    if (subs.length < 2) {
        return [makeEntry(text, { titular, gols, fromChain: false })];
    }

    const chain = [];
    if (base) {
        chain.push(makeEntry(base, {
            titular: titular === null ? true : titular,
            gols,
            substituido: true,
            fromChain: true
        }));
    }
    subs.forEach((subName, index) => {
        const isLast = index === subs.length - 1;
        chain.push(makeEntry(subName, {
            titular: false,
            gols: base || index > 0 ? 0 : gols,
            substituido: !isLast,
            fromChain: true
        }));
    });
    return chain;
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

    const hasAdversarioFormat = columnIndex.adversario !== undefined;
    const hasLegacyTeams = columnIndex.mandante !== undefined && columnIndex.visitante !== undefined;
    const required = ['data', 'jogador', 'funcao'];
    const missing = required.filter(key => columnIndex[key] === undefined);
    if (!hasAdversarioFormat && !hasLegacyTeams) {
        missing.push('Adversário (ou Mandante/Visitante)');
    }
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
            campeonato: get('campeonato'),
            adversario: get('adversario'),
            mando: get('mando'),
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
        campeonato: first.campeonato,
        adversario: first.adversario,
        mando: first.mando,
        mandoResolved: parseMandoCell(first.mando),
        mandante: first.mandante,
        golsMandante: parseIntegerCell(first.golsMandante) ?? 0,
        golsVisitante: parseIntegerCell(first.golsVisitante) ?? 0,
        visitante: first.visitante,
        estadio: first.estadio,
        publico: parseIntegerCell(first.publico),
        renda: parseRendaCell(first.renda),
        arbitro: first.arbitro,
        tecnicoAdversario: first.tecnicoAdversario,
        format: hasAdversarioFormat ? 'adversario' : 'legacy'
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
        const expanded = expandPlayerSubstitutionChain(name, {
            titular: parseTitularCell(row.titular),
            gols: parseIntegerCell(row.gols) ?? 0,
            funcao: row.funcao,
            lineNumber: row.lineNumber
        });
        players.push(...expanded);
    });

    return { ok: true, error: null, rows, match, players, coaches, delimiter };
};

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

    tryFill('Campeonato', parsed.match.campeonato, (value) => {
        const candidates = [value];
        const stripped = String(value || '').replace(/^campeonato\s+/i, '').trim();
        if (stripped && normalizeImportText(stripped) !== normalizeImportText(value)) {
            candidates.push(stripped);
        }
        if (stripped) candidates.push(`Campeonato ${stripped}`);

        let competition = null;
        for (const candidate of candidates) {
            competition = findUniqueByNormalizedName(catalogs.competicoes, 'campeonato', candidate);
            if (competition) break;
        }
        if (!competition) return null;
        resolved.match.campeonatoResolved = competition.campeonato;
        return competition.campeonato;
    });

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

    const atleticoClub = findUniqueByNormalizedName(catalogs.adversarios, 'clube', 'Atlético', { clubStyle: true });
    const atleticoName = atleticoClub?.clube || 'Atlético';

    if (parsed.match.format === 'adversario' || (!parsed.match.mandante && parsed.match.adversario)) {
        // Formato novo: Adversário + Mando (Casa/Fora do Atlético).
        // Sem Mando, cai no fallback pelo mandante do estádio.
        let opponentClub = null;
        tryFill('Adversário', parsed.match.adversario, (value) => {
            if (isAtleticoClub(value)) return null;
            opponentClub = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
            if (!opponentClub) return null;
            resolved.match.adversarioResolved = opponentClub.clube;
            return opponentClub.clube;
        });

        const opponentName = opponentClub?.clube || '';
        const mando = parsed.match.mandoResolved || parseMandoCell(parsed.match.mando);
        resolved.match.mandoResolved = mando;

        let atleticoIsHome;
        let orientationSource = 'stadium';
        if (mando === 'casa') {
            atleticoIsHome = true;
            orientationSource = 'mando';
            resolved.filled.Mando = 'Casa';
        } else if (mando === 'fora') {
            atleticoIsHome = false;
            orientationSource = 'mando';
            resolved.filled.Mando = 'Fora';
        } else {
            if (String(parsed.match.mando || '').trim()) {
                missing.push({ campo: 'Mando', valor: parsed.match.mando });
            }
            const stadiumHome = String(stadium?.mandante || '').trim();
            atleticoIsHome = isAtleticoClub(stadiumHome) || (!stadiumHome && !opponentName);
            orientationSource = 'stadium';
        }

        if (atleticoIsHome) {
            resolved.match.mandanteResolved = atleticoName;
            resolved.match.mandanteId = atleticoClub?.id;
            if (opponentName) {
                resolved.match.visitanteResolved = opponentName;
                resolved.match.visitanteId = opponentClub.id;
            }
        } else {
            if (opponentName) {
                resolved.match.mandanteResolved = opponentName;
                resolved.match.mandanteId = opponentClub.id;
            }
            resolved.match.visitanteResolved = atleticoName;
            resolved.match.visitanteId = atleticoClub?.id;
        }
        resolved.match.mandanteFromStadium = orientationSource === 'stadium';
        resolved.match.orientationSource = orientationSource;
        if (opponentName) resolved.filled['Adversário'] = opponentName;
    } else {
        // Formato legado: Mandante + Visitante do CSV.
        let homeClub = null;
        let awayClub = null;
        tryFill('Mandante', parsed.match.mandante, (value) => {
            if (isAtleticoClub(value)) {
                homeClub = atleticoClub || { clube: atleticoName, id: atleticoClub?.id };
                resolved.match.mandanteResolved = atleticoName;
                resolved.match.mandanteId = atleticoClub?.id;
                return atleticoName;
            }
            homeClub = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
            if (!homeClub) return null;
            resolved.match.mandanteResolved = homeClub.clube;
            resolved.match.mandanteId = homeClub.id;
            return homeClub.clube;
        });

        tryFill('Visitante', parsed.match.visitante, (value) => {
            if (isAtleticoClub(value)) {
                awayClub = atleticoClub || { clube: atleticoName, id: atleticoClub?.id };
                resolved.match.visitanteResolved = atleticoName;
                resolved.match.visitanteId = atleticoClub?.id;
                return atleticoName;
            }
            awayClub = findUniqueByNormalizedName(catalogs.adversarios, 'clube', value, { clubStyle: true });
            if (!awayClub) return null;
            resolved.match.visitanteResolved = awayClub.clube;
            resolved.match.visitanteId = awayClub.id;
            return awayClub.clube;
        });

        const opponentFromCsv = isAtleticoClub(parsed.match.mandante)
            ? (awayClub?.clube || resolved.match.visitanteResolved || '')
            : (homeClub?.clube || resolved.match.mandanteResolved || '');
        if (opponentFromCsv && !isAtleticoClub(opponentFromCsv)) {
            resolved.match.adversarioResolved = opponentFromCsv;
            resolved.filled['Adversário'] = opponentFromCsv;
        }
        resolved.match.mandanteFromStadium = false;
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
            substituido: Boolean(playerRow.substituido),
            golsCount: playerRow.gols || 0
        });
    });

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
        expandPlayerSubstitutionChain,
        parseMandoCell,
        findUniqueByNormalizedName,
        findUniquePlayerForSeason,
        findRegisteredCoachName,
        resolveGameCsvAgainstCatalogs,
        isAtleticoClub
    };
}
