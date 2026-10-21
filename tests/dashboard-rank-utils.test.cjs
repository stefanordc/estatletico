'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardPlayerRankMaps } = require('../dashboard-rank-utils.js');

const playersById = {
    101: { id_jogador: 101, nome_guerra: 'Guilherme', temporada: '2003' },
    202: { id_jogador: 202, nome_guerra: 'Guilherme', temporada: '2018' },
    303: { id_jogador: 303, nome_guerra: 'Hulk', temporada: '2023' }
};

const helpers = {
    getGlobalId: (reference) => {
        const id = reference?.idJogador ?? reference?.id_jogador;
        return id == null || id === '' ? null : String(id);
    },
    resolveById: (id) => playersById[String(id)] || null,
    resolveByReference: () => null,
    normalizeName: (value) => String(value || '').trim().toLowerCase()
};

test('dashboard separa gols de homônimos pelo id_jogador', () => {
    const { artilheirosMap } = buildDashboardPlayerRankMaps([
        {
            temporada: '2003',
            lineupGalo: [
                { idJogador: 101, jogador: 'Guilherme', golsCount: 20 },
                { idJogador: 303, jogador: 'Hulk', golsCount: 2 }
            ]
        },
        {
            temporada: '2018',
            lineupGalo: [
                { idJogador: 202, jogador: 'Guilherme', golsCount: 35 }
            ]
        }
    ], helpers);

    assert.equal(Object.keys(artilheirosMap).length, 3);
    assert.equal(artilheirosMap['101'].count, 20);
    assert.equal(artilheirosMap['202'].count, 35);
    assert.equal(artilheirosMap['303'].count, 2);
    assert.notEqual(
        (artilheirosMap['101'].count + artilheirosMap['202'].count),
        artilheirosMap['101'].count
    );
});

test('dashboard agrega cartões amarelos e vermelhos por id_jogador', () => {
    const { amarelosMap, vermelhosMap } = buildDashboardPlayerRankMaps([
        {
            temporada: '2018',
            cartoesGalo: [
                { idJogador: 202, jogador: 'Guilherme', amarelo: 2, red: 1 },
                { idJogador: 101, jogador: 'Guilherme', amarelo: 3, red: 0 }
            ]
        },
        {
            temporada: '2019',
            cartoesGalo: [
                { idJogador: 202, jogador: 'Guilherme Arana', amarelo: 1, red: 1 }
            ]
        }
    ], helpers);

    assert.equal(amarelosMap['202'].count, 3);
    assert.equal(amarelosMap['101'].count, 3);
    assert.equal(vermelhosMap['202'].count, 2);
    assert.equal(vermelhosMap['101'], undefined);
});

test('sem id, resolve pelo cadastro da temporada quando há match único', () => {
    const helpersWithLookup = {
        ...helpers,
        getGlobalId: () => null,
        resolveByReference: (reference, season) => {
            if (reference?.jogador === 'Guilherme' && season === '2003') return playersById[101];
            if (reference?.jogador === 'Guilherme' && season === '2018') return playersById[202];
            return null;
        }
    };

    const { artilheirosMap } = buildDashboardPlayerRankMaps([
        { temporada: '2003', lineupGalo: [{ jogador: 'Guilherme', golsCount: 10 }] },
        { temporada: '2018', lineupGalo: [{ jogador: 'Guilherme', golsCount: 7 }] }
    ], helpersWithLookup);

    assert.equal(artilheirosMap['101'].count, 10);
    assert.equal(artilheirosMap['202'].count, 7);
});
