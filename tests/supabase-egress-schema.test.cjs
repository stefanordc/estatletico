'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migração cria diário seguro e Broadcast compacto para todas as tabelas', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase_egress_incremental_sync.sql'), 'utf8');
  assert.match(sql, /alter table public\.estatletico_change_log enable row level security/i);
  assert.match(sql, /create policy "authenticated read estatletico change log"/i);
  assert.match(sql, /realtime\.send\(/i);
  assert.doesNotMatch(sql, /realtime\.broadcast_changes\(/i);
  assert.match(sql, /new is not distinct from old/i);
  assert.match(sql, /revoke all on function estatletico_private\.capture_change\(\) from public/i);
  assert.match(sql, /revoke all on function estatletico_private\.purge_change_log\(\) from public/i);
  for (const table of ['adversarios', 'arbitros', 'competicoes', 'estadios', 'jogadores', 'jogos']) {
    assert.match(sql, new RegExp(`after insert or update or delete on public\\.${table}`, 'i'));
  }
});
