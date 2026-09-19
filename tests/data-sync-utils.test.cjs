'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CORE_SELECTS,
  MEDIA_COLUMN,
  applyRevisionPage,
  needsFullReload,
  mediaKey
} = require('../data-sync-utils.js');

test('projeções principais preservam campos de resultado e não transferem mídia', () => {
  assert.equal(CORE_SELECTS.adversarios, 'id,clube,estado,pais');
  assert.match(CORE_SELECTS.jogos, /lineupGalo/);
  for (const [table, media] of Object.entries(MEDIA_COLUMN)) {
    assert.doesNotMatch(CORE_SELECTS[table], new RegExp(`(^|,)${media}(,|$)`));
  }
});

test('cache sem cursor ou com mais de trinta dias exige carga principal', () => {
  const now = Date.UTC(2026, 8, 19);
  assert.equal(needsFullReload(null, now), true);
  assert.equal(needsFullReload({ revision: 5, savedAt: now - 31 * 24 * 60 * 60 * 1000 }, now), true);
  assert.equal(needsFullReload({ revision: 5, savedAt: now - 29 * 24 * 60 * 60 * 1000 }, now), false);
});

test('mescla revisões idempotentemente, remove deletes e mantém ordem por id', async () => {
  const resolve = async (table, id) => ({ jogadores: { '1': { id: 1, nome: 'novo' }, '2': { id: 2, nome: 'editado' } } })[table][id] || null;
  const result = await applyRevisionPage(
    { jogadores: [{ id: 2, nome: 'antigo' }], jogos: [] },
    4,
    [
      { revision: 5, table_name: 'jogadores', row_id: '2', operation: 'UPDATE' },
      { revision: 6, table_name: 'jogadores', row_id: '1', operation: 'INSERT' },
      { revision: 7, table_name: 'jogadores', row_id: '2', operation: 'DELETE' },
      { revision: 6, table_name: 'jogadores', row_id: '1', operation: 'INSERT' }
    ],
    resolve
  );
  assert.deepEqual(result.state.jogadores, [{ id: 1, nome: 'novo' }]);
  assert.equal(result.revision, 7);
  assert.deepEqual(result.invalidatedMedia, ['jogadores:2', 'jogadores:1']);
  assert.equal(mediaKey('jogadores', 1), 'jogadores:1');
});
