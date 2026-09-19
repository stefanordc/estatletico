# Sincronização incremental para redução de egress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar cargas recorrentes de mídia e de tabelas completas, preservando todos os resultados e atualizações ao vivo do Supabase.

**Architecture:** O navegador carregará projeções principais explícitas e manterá mídia em cache separado sob demanda. Um diário durável de revisões e Broadcast privado com payload mínimo permitirão aplicar INSERT, UPDATE e DELETE sem refresh, inclusive depois de reconexão ou período offline.

**Tech Stack:** JavaScript ES2022 no navegador, Supabase JS 2 CDN, IndexedDB, PostgreSQL/Supabase Realtime Broadcast, Node.js test runner e node-postgres.

**Spec:** `docs/superpowers/specs/2026-09-19-egress-data-sync-design.md`

## Global Constraints

- Preservar exatamente os registros em `state`, cálculos e resultados já exibidos.
- Não usar `select('*')` no caminho Supabase de carga, foco, reconexão ou atualização de registro.
- Excluir `foto` de `jogadores`, `arbitros` e `estadios`, e `escudo` de `adversarios`, apenas das projeções principais; mídia continua disponível sob demanda.
- Aplicar toda alteração, inclusive DELETE, sem recarregar a página para abas conectadas.
- Ativar RLS em todo objeto novo exposto; funções privilegiadas ficam em esquema não exposto, com `search_path` fixo e sem `EXECUTE` por `PUBLIC`.
- O diário retém 35 dias; cache incremental expira em 30 dias e então faz carga principal segura.
- Manter os modos MySQL e Supabase compatíveis através de `EstatleticoData`.
- Não criar índices sem um `EXPLAIN (ANALYZE, BUFFERS)` que justifique a alteração.

## Review Focus

- Cache com cursor anterior à retenção: a aplicação precisa fazer carga principal, não ignorar exclusões antigas. Cobrir no teste da Tarefa 1.
- Broadcast duplicado ou fora de ordem: a maior revisão precisa vencer sem duplicar itens. Cobrir no teste da Tarefa 1.
- UPDATE de um jogador com foto alterada: estado principal atualiza, mídia anterior é invalidada e a nova só é buscada quando exibida. Cobrir no teste da Tarefa 4.
- DELETE recebido durante uma carga ou reconciliação: o item e seu cache de mídia não podem reaparecer. Cobrir no teste da Tarefa 3.
- Queda do Broadcast: ao foco ou reconexão, consultar o diário e não reiniciar a leitura das seis tabelas. Cobrir no teste da Tarefa 3.

---

## File structure

- `data-sync-utils.js`: módulo puro UMD com projeções, cursor, mesclagem idempotente e metadados de cache.
- `app.js`: orquestra Supabase, IndexedDB, renderização e Broadcast; consome o módulo puro sem alterar os cálculos existentes.
- `index.html` e `scripts/build.cjs`: carregam e publicam o novo módulo antes de `app.js`.
- `supabase_egress_incremental_sync.sql`: migração idempotente de diário, RLS, triggers, Broadcast e retenção.
- `tests/data-sync-utils.test.cjs`: regressões sem rede de projeção, cursor e mesclagem.
- `tests/egress-client-wiring.test.cjs`: regressões de integração do navegador por stubs do cliente Supabase.
- `tests/supabase-egress-schema.test.cjs`: valida invariantes de segurança e cobertura das seis triggers no SQL.
- `README.md`: operação, rollout e como medir egress antes/depois.

### Task 1: Contrato de projeções e reconciliação pura

**Files:**
- Create: `data-sync-utils.js`
- Create: `tests/data-sync-utils.test.cjs`
- Modify: `index.html`
- Modify: `scripts/build.cjs`

**Interfaces:**
- Produces `window.EstatleticoSync` e `module.exports` com `CORE_SELECTS`, `MEDIA_COLUMN`, `mergeRevision`, `applyRevisionPage`, `needsFullReload`, `mediaKey` e `sortById`.
- Consumes um estado no formato `{ adversarios, arbitros, competicoes, estadios, jogadores, jogos }`, revisões `{ revision, table_name, row_id, operation }` e um resolvedor assíncrono `(table, id) => row | null`.
- Later tasks call `CORE_SELECTS[table]` para cada consulta e `applyRevisionPage` para a mesma regra de ordem e idempotência.

- [ ] **Step 1: Write failing projection and reconciliation tests**

```js
assert.doesNotMatch(CORE_SELECTS.jogadores, /(^|,)foto(,|$)/);
assert.doesNotMatch(CORE_SELECTS.arbitros, /(^|,)foto(,|$)/);
assert.doesNotMatch(CORE_SELECTS.estadios, /(^|,)foto(,|$)/);
assert.doesNotMatch(CORE_SELECTS.adversarios, /(^|,)escudo(,|$)/);
assert.equal(needsFullReload({ revision: 9, savedAt: now - 31 * DAY }, 10, now), true);
const next = await applyRevisionPage({ jogadores: [{ id: 2, nome: 'antigo' }] }, 4,
  [{ revision: 5, table_name: 'jogadores', row_id: '2', operation: 'UPDATE' },
   { revision: 6, table_name: 'jogadores', row_id: '1', operation: 'INSERT' },
   { revision: 7, table_name: 'jogadores', row_id: '2', operation: 'DELETE' }], resolver);
assert.deepEqual(next.state.jogadores, [{ id: 1, nome: 'novo' }]);
assert.equal(next.revision, 7);
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test tests/data-sync-utils.test.cjs`

Expected: FAIL because `data-sync-utils.js` does not exist.

- [ ] **Step 3: Implement the UMD module with explicit production columns**

```js
const CORE_SELECTS = Object.freeze({
  adversarios: 'id,clube,estado,pais',
  arbitros: 'id,nome,nascimento,federacao',
  competicoes: 'id,campeonato,tipo,divisao',
  estadios: 'id,nome,cidade,estado,pais,capacidade,mandante',
  jogadores: 'id,nome_completo,nome_guerra,posicao,temporada,nacionalidade,status,pe_dominante,data_nascimento,altura,peso,num_camisa,info_extra,foraDoElenco,nascimento,numero,observacao,id_jogador',
  jogos: 'id,temporada,data,rodada,campeonato,estadio,estadioEstado,estadioPais,casa,fora,golsCasa,golsFora,vencedor,arbitro,arbitroIdade,arbitroFederacao,assistente1,assistente2,varArbitro,publico,renda,ticketMedio,tecnicoGalo,tecnicoAdv,penaltis,penaltisCasa,penaltisFora,observacao,cartoesGalo,cartoesAdv,lineupGalo,gcfavorcount,gcfavorlist,gccontracount,gccontralist,gcFavorList,gcContraList,portoesFechados,gcFavorCount,gcContraCount,adversarioId'
});
```

Use `revision <= currentRevision` as a no-op, fetch INSERT/UPDATE rows through the resolver, remove DELETE rows and always call `sortById`. Keep revision and cache timestamps outside the data arrays.

- [ ] **Step 4: Load the module before `app.js` and include it in the build**

Add `<script src="data-sync-utils.js"></script>` immediately before `<script src="app.js"></script>` and append `data-sync-utils.js` to the `assets` array in `scripts/build.cjs`.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test tests/data-sync-utils.test.cjs tests/database.test.cjs && npm run build`

Expected: all focused tests pass and `dist/data-sync-utils.js` exists.

- [ ] **Step 6: Commit**

```powershell
git add data-sync-utils.js tests/data-sync-utils.test.cjs index.html scripts/build.cjs
git commit -m "feat: add incremental sync primitives"
```

### Task 2: Migração segura de diário e Broadcast compacto

**Files:**
- Create: `supabase_egress_incremental_sync.sql`
- Create: `tests/supabase-egress-schema.test.cjs`

**Interfaces:**
- Produces `public.estatletico_change_log(revision, table_name, row_id, operation, occurred_at)` e o tópico privado `estatletico:sync`.
- Produces uma trigger `estatletico_private.capture_change()` instalada em cada uma das seis tabelas.
- Later tasks read `revision`, `table_name`, `row_id` e `operation` com `.gt('revision', cursor).order('revision').limit(500)`.

- [ ] **Step 1: Write failing SQL invariants test**

```js
const sql = fs.readFileSync(path.join(__dirname, '../supabase_egress_incremental_sync.sql'), 'utf8');
assert.match(sql, /alter table public\.estatletico_change_log enable row level security/i);
assert.match(sql, /realtime\.send\(/i);
assert.doesNotMatch(sql, /realtime\.broadcast_changes\(/i);
for (const table of ['adversarios','arbitros','competicoes','estadios','jogadores','jogos'])
  assert.match(sql, new RegExp(`after insert or update or delete on public\\.${table}`, 'i'));
assert.match(sql, /new is not distinct from old/i);
assert.match(sql, /revoke all on function estatletico_private\.capture_change\(\) from public/i);
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test tests/supabase-egress-schema.test.cjs`

Expected: FAIL because the SQL migration file does not exist.

- [ ] **Step 3: Write idempotent migration SQL**

Create the private schema, append-only log table with `revision bigint generated always as identity primary key`, CHECK constraints for the six table names and three operations, `occurred_at timestamptz default now()`, index on `(revision)`, RLS, `authenticated` SELECT policy and no INSERT/UPDATE/DELETE policy.

Define `estatletico_private.capture_change()` as `SECURITY DEFINER SET search_path = pg_catalog, public`, short-circuit unchanged UPDATE, insert one log row, then call:

```sql
perform realtime.send(
  jsonb_build_object('revision', v_revision, 'table', tg_table_name,
    'id', v_row_id, 'operation', tg_op),
  'change', 'estatletico:sync', true
);
```

Qualify all table and Realtime names, revoke public execution, and create one `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW` trigger per table. Add a daily `pg_cron` cleanup only if `cron` is installed; otherwise expose a documented SQL cleanup statement and leave no silently failing scheduler. Do not alter or drop the existing `supabase_realtime` publication in this task.

- [ ] **Step 4: Run static test and SQL transaction probe**

Run: `node --test tests/supabase-egress-schema.test.cjs`

Expected: PASS.

Run a Node `pg` script that opens `BEGIN`, executes the migration, inserts/updates/deletes a fixture row inside a savepoint, selects the matching log records, then `ROLLBACK`.

Expected: exactly INSERT, UPDATE and DELETE revisions are present; a no-op UPDATE adds no revision; no production row or schema change remains after rollback.

- [ ] **Step 5: Commit**

```powershell
git add supabase_egress_incremental_sync.sql tests/supabase-egress-schema.test.cjs
git commit -m "feat: add compact Supabase change journal"
```

### Task 3: Trocar carga e foco por sincronização incremental

**Files:**
- Modify: `app.js:7310-7700`
- Create: `tests/egress-client-wiring.test.cjs`

**Interfaces:**
- Consumes `window.EstatleticoSync.CORE_SELECTS`, `applyRevisionPage`, `needsFullReload` and cache metadata from Task 1.
- Consumes `estatletico_change_log` from Task 2 and Broadcast event `change` on `estatletico:sync`.
- Produces `syncFromJournal(reason)` and `fetchCoreTable(table, batchSize)` inside the DOM initialization scope.

- [ ] **Step 1: Write failing browser wiring tests**

Use a fake Supabase builder that records `select`, `eq`, `gt`, `order`, `range` and `limit`. Assert all initial table reads use `CORE_SELECTS[table]`; assert `focus` invokes only `estatletico_change_log` with `revision > cursor`; assert a DELETE broadcast changes state without a row fetch; assert an UPDATE broadcast fetches only one core projection by `id`.

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test tests/egress-client-wiring.test.cjs`

Expected: FAIL because initialization still calls `.select('*')` and subscribes to `postgres_changes`.

- [ ] **Step 3: Implement core loading and durable cache metadata**

Replace `fetchTableWithPagination` with `fetchCoreTable`, calling `.select(CORE_SELECTS[table]).order('id').range(from, to)`. Store `{ tables, sync: { revision, savedAt } }` in IndexedDB while retaining compatibility with the legacy `{ tableName: rows }` cache format. For a fresh or expired cache: subscribe, read the current highest journal revision, fetch the six core tables, then apply journal pages after that revision. For a valid cache: render it immediately and call `syncFromJournal('startup')`.

- [ ] **Step 4: Implement Broadcast and recovery behavior**

Replace `startRealtimeSync` with one private channel:

```js
supabaseClient.channel('estatletico:sync', { config: { private: true } })
  .on('broadcast', { event: 'change' }, ({ payload }) => syncFromJournal('broadcast', payload.revision))
  .subscribe(onChannelStatus);
```

`syncFromJournal` must page revisions in ascending order, call the Task 1 resolver for rows, persist the new cursor only after successful application, invalidate relevant media keys and rerender only when state changed. `focus`, `CHANNEL_ERROR`, `TIMED_OUT` and successful reconnection call the same function with backoff; remove the old full-table focus refresh and all `postgres_changes` subscriptions.

- [ ] **Step 5: Run focused client tests**

Run: `node --test tests/data-sync-utils.test.cjs tests/egress-client-wiring.test.cjs tests/database.test.cjs`

Expected: PASS with no recorded `.select('*')` in the Supabase code path.

- [ ] **Step 6: Commit**

```powershell
git add app.js tests/egress-client-wiring.test.cjs
git commit -m "feat: reconcile Supabase data incrementally"
```

### Task 4: Hidratar e invalidar mídia apenas quando visível

**Files:**
- Modify: `app.js:430-6700`
- Modify: `data-sync-utils.js`
- Modify: `tests/data-sync-utils.test.cjs`
- Modify: `tests/egress-client-wiring.test.cjs`

**Interfaces:**
- Consumes `MEDIA_COLUMN = { adversarios: 'escudo', arbitros: 'foto', estadios: 'foto', jogadores: 'foto' }`.
- Produces `requestMedia(table, id)`, `hydrateVisibleMedia(root)` and `invalidateMedia(table, id)`.

- [ ] **Step 1: Write failing media-cache tests**

```js
await requestMedia('jogadores', 7);
await requestMedia('jogadores', 7);
assert.equal(queryCalls.length, 1);
invalidateMedia('jogadores', 7);
await requestMedia('jogadores', 7);
assert.equal(queryCalls.length, 2);
```

Add fixture DOM nodes with `data-estatletico-media-table` and `data-estatletico-media-id`; assert they start with the existing placeholder, then receive the same media URL after hydration.

- [ ] **Step 2: Run media tests and verify they fail**

Run: `node --test tests/data-sync-utils.test.cjs tests/egress-client-wiring.test.cjs`

Expected: FAIL because the application still embeds media values in all initial rows.

- [ ] **Step 3: Implement one media loader and adapt every renderer**

Implement `requestMedia` with `.from(table).select(MEDIA_COLUMN[table]).eq('id', id).limit(1)`, a deduplicated in-flight map and IndexedDB media cache. Render players, referees, stadiums and opponents with their current placeholders plus the two `data-estatletico-media-*` attributes; after each affected render call `hydrateVisibleMedia(container)`. Cover the existing usages in cadastro tables, game crest/stadium preview, lineup rows, player lists, ranking tables, referee views and autocomplete. Never write loaded media back into a row before `saveData`; save forms retain their chosen media fields exactly as before.

- [ ] **Step 4: Verify data and traffic behavior**

Run: `node --test tests/data-sync-utils.test.cjs tests/egress-client-wiring.test.cjs tests/player-autofill.test.cjs`

Expected: PASS; tests record one media request per visible uncached item and zero media fields in every core select.

- [ ] **Step 5: Commit**

```powershell
git add app.js data-sync-utils.js tests/data-sync-utils.test.cjs tests/egress-client-wiring.test.cjs
git commit -m "feat: load Supabase media on demand"
```

### Task 5: Apply, verify and document the Supabase rollout

**Files:**
- Modify: `README.md`
- Modify: `docs/auditoria-dados.md`

**Interfaces:**
- Consumes the committed migration and the live `SUPABASE_DB_URL`.
- Produces a verified production database with journal, Broadcast policy and six triggers.

- [ ] **Step 1: Write the rollout documentation assertion**

Add a test that asserts the README names `supabase_egress_incremental_sync.sql`, the journal retention, the Broadcast topic and a rollback procedure that restores Postgres Changes only after disabling the new client path.

- [ ] **Step 2: Run it and verify it fails**

Run: `node --test tests/supabase-egress-schema.test.cjs`

Expected: FAIL because the rollout instructions are absent.

- [ ] **Step 3: Apply the migration and prove the live contract**

Use the configured direct PostgreSQL connection to run `supabase_egress_incremental_sync.sql` once. Then run read-only verification queries for: log table RLS enabled; authenticated SELECT policy; six triggers present; function public execution revoked; existing table read policies unchanged; and no `postgres_changes` client subscription after the deployed build. Insert, update and delete one explicitly marked test fixture inside a transaction and roll it back, confirming the journal emits compact metadata only.

Run `EXPLAIN (ANALYZE, BUFFERS)` for both player autocomplete shapes (`temporada` plus `nome_guerra ILIKE`, and `nome_completo ILIKE`). Add a trigram or season index only when the observed plan materially benefits; record the plan and decision in `docs/auditoria-dados.md`.

- [ ] **Step 4: Update operational documentation**

Document the 38.5 MB baseline, core/media separation, journal retention, how to inspect egress in Supabase, how to clear a client cache and the precise rollback sequence. Do not claim a percentage reduction until the dashboard has before/after measurements.

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run build`

Expected: all test files pass, build exits 0, `dist/` contains `data-sync-utils.js`, and an authenticated browser session receives a live UPDATE and DELETE without reload.

- [ ] **Step 6: Commit and publish**

```powershell
git add README.md docs/auditoria-dados.md supabase_egress_incremental_sync.sql
git commit -m "docs: document Supabase egress rollout"
git push
```

## Plan self-review

- Spec coverage: Tasks 1 and 4 cover core/media separation; Task 2 provides the durable journal, secure compact Broadcast and retention; Task 3 covers initial load, focus, reconnection and immediate changes; Task 5 covers real-database verification, query plans, measurement and rollout.
- Placeholder scan: no unfinished implementation markers or unspecified error paths remain; every task names files, interfaces, commands and expected outcome.
- Type consistency: all client tasks use `revision`, `table_name`, `row_id`, `operation`, `CORE_SELECTS`, `MEDIA_COLUMN`, `applyRevisionPage` and `syncFromJournal` consistently.
- Review focus coverage: every item in Review Focus is assigned to Tasks 1, 3 or 4 with an explicit test.
