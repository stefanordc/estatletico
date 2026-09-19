'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('cliente Supabase usa projeções principais, diário e Broadcast privado', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(source, /CORE_SELECTS\[tableName\]/);
  assert.match(source, /from\('estatletico_change_log'\)/);
  assert.match(source, /channel\('estatletico:sync', \{ config: \{ private: true \} \}\)/);
  assert.match(source, /\.on\('broadcast', \{ event: 'change' \}/);
  assert.doesNotMatch(source, /from\(tableName\)\.select\('\*'\)/);
  assert.doesNotMatch(source, /'postgres_changes'/);
});
