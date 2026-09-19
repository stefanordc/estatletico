const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizePlayerLookupName,
    selectMostRecentPlayer,
    getPlayerAutofillValues,
    shouldApplyAutofillValue,
    getGamePlayerGlobalId
} = require('../player-autofill-utils.js');

test('normaliza nome para correspondência exata sem caixa, acentos e espaços extras', () => {
    assert.equal(
        normalizePlayerLookupName('  Willián   Lanes de Lima  '),
        normalizePlayerLookupName('willian lanes de lima')
    );
});

test('seleciona o cadastro da temporada mais recente para nomes iguais', () => {
    const player = selectMostRecentPlayer([
        { id: 10, temporada: '2006', nome_guerra: 'Lima' },
        { id: 11, temporada: '2012', nome_guerra: 'Lima' },
        { id: 12, temporada: '2007', nome_guerra: 'Lima' }
    ]);
    assert.equal(player.id, 11);
});

test('retorna somente os campos permitidos para autopreenchimento', () => {
    const values = getPlayerAutofillValues({
        nome_guerra: 'Lima',
        posicao: 'Zagueiro',
        nacionalidade: 'Brasil',
        nascimento: '1984-06-10',
        foto: 'data:image/jpeg;base64,foto',
        temporada: '2012',
        numero: '3',
        observacao: 'Não deve ser copiada'
    });

    assert.deepEqual(values, {
        nome_guerra: 'Lima',
        posicao: 'Zagueiro',
        nacionalidade: 'Brasil',
        nascimento: '1984-06-10',
        foto: 'data:image/jpeg;base64,foto'
    });
});

test('não retorna valores para jogador não encontrado', () => {
    assert.equal(getPlayerAutofillValues(null), null);
});

test('autopreenchimento não sobrescreve campo digitado e pode atualizar campo preenchido automaticamente', () => {
    assert.equal(shouldApplyAutofillValue({ candidate: 'Atacante', currentValue: '', dirty: false }), true);
    assert.equal(shouldApplyAutofillValue({ candidate: 'Atacante', currentValue: 'Zagueiro', dirty: true }), false);
    assert.equal(shouldApplyAutofillValue({ candidate: 'Atacante', currentValue: 'Zagueiro', autoFilled: false }), false);
    assert.equal(shouldApplyAutofillValue({ candidate: 'Atacante', currentValue: 'Zagueiro', autoFilled: true }), true);
    assert.equal(shouldApplyAutofillValue({ candidate: '', currentValue: '', dirty: false }), false);
});

test('mantém Hulk Lateral e Hulk Atacante em chaves de estatística distintas', () => {
    const hulkLateral = getGamePlayerGlobalId({ idJogador: 1776804290967, jogador: 'Hulk' });
    const hulkAtacante = getGamePlayerGlobalId({ idJogador: 'outro-hulk', jogador: 'Hulk' });
    const stats = { [hulkLateral]: { jogos: 1 }, [hulkAtacante]: { jogos: 1 } };

    assert.notEqual(hulkLateral, hulkAtacante);
    assert.equal(Object.keys(stats).length, 2);
});
