'use strict';
const readline = require('node:readline/promises');
const { openPg, openMysql, lock, batchSize } = require('../database/connections.cjs');
const { readManifest, mq, pq } = require('../database/schema.cjs');
const { hash, key, baseline, setBaseline, classify, projection, mysqlProjection, toPg } = require('../database/records.cjs');
const { sourceFingerprint } = require('../server/config.cjs');
async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !['--dry-run', '--yes'].includes(a))) throw new Error('Use --dry-run ou --yes.');
  const dry = args.includes('--dry-run');
  const manifest = readManifest();
  if (!manifest.ready) throw new Error('Cópia incompleta. Conclua db:copy antes de sincronizar.');
  if (manifest.sourceFingerprint && manifest.sourceFingerprint !== sourceFingerprint()) throw new Error('Destino Supabase não corresponde à origem copiada. Confira SUPABASE_DB_URL.');
  if (!dry && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Enviar INSERT/UPDATE para o Supabase? Digite SINCRONIZAR: ');
    rl.close();
    if (answer !== 'SINCRONIZAR') { console.log('Cancelado.'); return; }
  } else if (!dry && !args.includes('--yes')) throw new Error('Execução não interativa exige --yes. Faça --dry-run primeiro.');
  const db = await openMysql();
  let pg;
  let conflicts = 0;
  try {
    await lock(db);
    pg = await openPg();
    // Serializa a comparação e o UPSERT com gravações concorrentes no Supabase.
    // Em dry-run até o servidor PostgreSQL impede qualquer escrita.
    await pg.query(dry ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    if (!dry) {
      await pg.query("SET LOCAL lock_timeout='10s'");
      await pg.query(`LOCK TABLE ${manifest.tables.map(t => 'public.' + pq(t.name)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    }
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.beginTransaction();
    const accepted = [];
    for (const t of manifest.tables) {
      const counts = { novos: 0, alterados: 0, iguais: 0, somenteSupabase: 0, conflitos: 0, erros: 0 };
      let offset = 0;
      while (true) {
        const [rows] = await db.query(`SELECT ${mysqlProjection(t)} FROM ${mq(t.name)} ORDER BY ${t.pk.map(name => mq(t.columns.find(c => c.column_name === name).mysql_name || name))} LIMIT ? OFFSET ?`, [batchSize(), offset]);
        if (!rows.length) break;
        const tupleColumns = t.pk.map(pq).join(',');
        const remoteRows = (await pg.query(
          `SELECT ${projection(t)} FROM public.${pq(t.name)} WHERE (${tupleColumns}) IN (${rows.map((_, rowIndex) => `(${t.pk.map((_, columnIndex) => '$' + (rowIndex * t.pk.length + columnIndex + 1)).join(',')})`).join(',')})`,
          rows.flatMap(row => t.pk.map(name => row[name]))
        )).rows;
        const remoteByKey = new Map(remoteRows.map(row => [key(t, row), row]));
        for (const row of rows) {
          const remote = remoteByKey.get(key(t, row));
          const localHash = hash(t, row), remoteHash = remote && hash(t, remote);
          const base = await baseline(db, t, row);
          const status = classify(localHash, remoteHash, base?.row_hash, base?.remote_hash);
          if (status === 'equal') { counts.iguais++; if (!dry) await setBaseline(db, t, row); continue; }
          if (status === 'remoteOnly') { counts.somenteSupabase++; continue; }
          if (status === 'conflict') {
            counts.conflitos++; conflicts++;
            console.warn(`CONFLITO: ${t.name} PK=${t.pk.map(n => row[n]).join(',')} MySQL updated_at=${row.updated_at || 'ausente'} Supabase updated_at=${remote?.updated_at || 'ausente'}; registro pulado.`);
            continue;
          }
          counts[status === 'new' ? 'novos' : 'alterados']++;
          if (!dry) {
            const cols = t.columns;
            const updates = cols.filter(c => !t.pk.includes(c.column_name));
            await pg.query('SAVEPOINT sync_row');
            try {
              const stored = (await pg.query(`INSERT INTO public.${pq(t.name)} (${cols.map(c => pq(c.column_name))}) OVERRIDING SYSTEM VALUE VALUES (${cols.map((_, i) => '$' + (i + 1))}) ON CONFLICT (${t.pk.map(pq)}) ${updates.length ? 'DO UPDATE SET ' + updates.map(c => `${pq(c.column_name)}=EXCLUDED.${pq(c.column_name)}`).join(',') : 'DO NOTHING'} RETURNING ${projection(t)}`, cols.map(c => toPg(c, row[c.column_name])))).rows[0];
              const storedHash = hash(t, stored);
              if (storedHash !== localHash && hash(t, { ...stored, updated_at: row.updated_at }) !== localHash) throw new Error('Trigger/default da origem modificou dados além de updated_at; revisão manual necessária.');
              await setBaseline(db, t, row, localHash, storedHash);
              await pg.query('RELEASE SAVEPOINT sync_row');
            } catch (error) {
              await pg.query('ROLLBACK TO SAVEPOINT sync_row');
              counts.erros++; conflicts++;
              console.error(`PULADO ${t.name} PK=${t.pk.map(n => row[n]).join(',')}: ${error.code || error.message}`);
            }
          }
        }
        offset += rows.length;
      }
      // Exclusões locais são apenas relatadas; nunca propagadas.
      const [missing] = await db.query(`SELECT COUNT(*) AS total FROM _estatletico_baseline WHERE table_name=?`, [t.name]);
      console.log(`Tabela ${t.name}${dry ? ' (SIMULAÇÃO)' : ''}:`, counts, `referências de cópia=${missing[0].total}; registros locais=${offset}`);
      accepted.push(t);
    }
    // IDs explícitos não avançam sequences PostgreSQL. Avança apenas quando
    // necessário, preservando o valor já alocado e sem reiniciar para trás.
    if (!dry) for (const t of accepted) for (const c of t.columns.filter(c => c.auto)) {
      const seq = (await pg.query('SELECT pg_get_serial_sequence($1,$2) AS name', ['public.' + pq(t.name), c.column_name])).rows[0].name;
      if (!seq) continue;
      const max = (await pg.query(`SELECT max(${pq(c.column_name)})::text AS value FROM public.${pq(t.name)}`)).rows[0].value;
      if (max === null) continue;
      const info = (await pg.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS qualified, s.seqincrement::text AS increment
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE c.oid=$1::regclass`, [seq])).rows[0];
      const increment = BigInt(info.increment);
      if (increment <= 0n) throw new Error(`Sequence ${seq}: incremento não positivo exige revisão manual.`);
      // ALTER obtém bloqueio transacional da sequence antes de ler last_value.
      await pg.query(`ALTER SEQUENCE ${info.qualified} INCREMENT BY ${increment}`);
      const sequence = (await pg.query(`SELECT last_value::text, is_called FROM ${info.qualified}`)).rows[0];
      const next = BigInt(sequence.last_value) + (sequence.is_called ? increment : 0n);
      const desired = BigInt(max) + increment;
      if (desired > next) await pg.query(`ALTER SEQUENCE ${info.qualified} RESTART WITH ${desired}`);
    }
    await pg.query(dry ? 'ROLLBACK' : 'COMMIT');
    if (dry) await db.rollback(); else await db.commit();
    console.log(dry ? 'Dry-run concluído: nenhuma escrita em nenhum banco.' : 'Sincronização concluída. Nenhuma exclusão executada.');
    if (conflicts) { console.warn(`${conflicts} conflito(s)/erro(s): revise antes de retornar ao Supabase.`); process.exitCode = 2; }
  } catch (error) {
    if (pg) await pg.query('ROLLBACK').catch(() => {});
    await db.rollback().catch(() => {});
    throw error;
  } finally { if (pg) await pg.end(); await db.end(); }
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error('Sincronização interrompida:', error.code || error.message); process.exitCode = 1; });
