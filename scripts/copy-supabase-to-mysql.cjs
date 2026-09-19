'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { openPg, openMysql, lock, batchSize } = require('../database/connections.cjs');
const { discover, createSQL, manifestPath, mq, pq, defaultSQL } = require('../database/schema.cjs');
const { projection, hash, findMysql, putMysql, initMetadata, baseline, setBaseline } = require('../database/records.cjs');
const { installPlayerTriggers } = require('../database/player-triggers.cjs');
const { sourceFingerprint } = require('../server/config.cjs');
async function main() {
  if (process.argv.slice(2).some(a => a !== '--inspect')) throw new Error('Argumento desconhecido. Use --inspect ou nenhum argumento.');
  const pg = await openPg();
  let db;
  try {
    await pg.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const manifest = await discover(pg);
    for (const t of manifest.tables) {
      createSQL(t); // Preflight de todas as tabelas antes de escrever.
      for (const c of t.columns) if (c.column_default && !defaultSQL(c)) manifest.warnings.push(`${t.name}.${c.column_name}: default PostgreSQL não convertido (${c.column_default}); fornecer no INSERT.`);
      t.sourceCount = (await pg.query(`SELECT count(*)::text AS count FROM public.${pq(t.name)}`)).rows[0].count;
      console.log(`Tabela ${t.name}: ${t.sourceCount} registros no Supabase; PK=${t.pk.join(',')}`);
    }
    console.log(`Views: ${manifest.views.length}; materializadas: ${manifest.materializedViews.length}; rotinas: ${manifest.routines.length}; triggers: ${manifest.triggers.length}`);
    for (const warning of manifest.warnings) console.warn('ATENÇÃO:', warning);
    if (process.argv.includes('--inspect')) { console.log('Inspeção somente leitura concluída.'); return; }
    db = await openMysql();
    await lock(db);
    const existing = (await db.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE()'))[0].map(r => r.name);
    if (manifest.tables.some(t => existing.includes(t.name)) && !fs.existsSync(manifestPath))
      throw new Error('Há tabelas preexistentes sem manifesto de cópia. Use um banco MySQL novo; nenhuma tabela será sobrescrita.');
    if (fs.existsSync(manifestPath)) {
      const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (old.sourceFingerprint && old.sourceFingerprint !== sourceFingerprint()) throw new Error('Conexão Supabase pertence a outra origem. Não misture projetos na mesma cópia.');
      if (old.database !== (process.env.MYSQL_DATABASE || 'estatletico') || old.host !== (process.env.MYSQL_HOST || '127.0.0.1')) throw new Error('Manifesto pertence a outro destino MySQL.');
      if (old.ready && old.tables.map(createSQL).join('\n') !== manifest.tables.map(createSQL).join('\n')) throw new Error('Esquema da origem mudou. Revisão manual necessária antes de continuar.');
    }
    manifest.database = process.env.MYSQL_DATABASE || 'estatletico';
    manifest.sourceFingerprint = sourceFingerprint();
    manifest.host = process.env.MYSQL_HOST || '127.0.0.1';
    manifest.ready = false;
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    for (const t of manifest.tables) await db.query(createSQL(t));
    await initMetadata(db);
    const size = batchSize();
    for (const t of manifest.tables) {
      const counts = { encontrados: t.sourceCount, inseridos: 0, atualizados: 0, ignorados: 0, conflitos: 0, erros: 0 };
      await pg.query(`DECLARE copy_rows NO SCROLL CURSOR FOR SELECT ${projection(t)} FROM public.${pq(t.name)} ORDER BY ${t.pk.map(pq)}`);
      try {
        while (true) {
          const rows = (await pg.query(`FETCH FORWARD ${size} FROM copy_rows`)).rows;
          if (!rows.length) break;
          await db.beginTransaction();
          try {
            for (const row of rows) {
              const current = await findMysql(db, t, row, true);
              const remoteHash = hash(t, row);
              if (!current) {
                // Não ressuscita exclusões locais em uma repetição da cópia.
                if (await baseline(db, t, row)) { counts.conflitos++; continue; }
                await putMysql(db, t, row, false);
                const stored = await findMysql(db, t, row);
                if (hash(t, stored) !== remoteHash) throw new Error(`${t.name}: conversão não preservou o registro ${t.pk.map(n => row[n]).join(',')}`);
                await setBaseline(db, t, row, remoteHash);
                counts.inseridos++;
              } else if (hash(t, current) === remoteHash) {
                await setBaseline(db, t, row, remoteHash);
                counts.ignorados++;
              } else {
                counts.conflitos++;
                console.warn(`CONFLITO na cópia: ${t.name} PK=${t.pk.map(n => row[n]).join(',')}; MySQL preservado.`);
              }
            }
            await db.commit();
          } catch (error) { await db.rollback(); throw error; }
          console.log(t.name, counts);
        }
      } catch (error) { counts.erros++; console.error(t.name, counts); throw error; }
      finally { await pg.query('CLOSE copy_rows'); }
      console.log(`Concluída ${t.name}:`, counts);
      t.copyReport = counts;
    }
    await installPlayerTriggers(db, manifest);
    manifest.ready = true;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('Cópia concluída. Origem intacta. Execute npm run db:verify.');
  } finally {
    await pg.query('ROLLBACK').catch(() => {});
    await pg.end();
    if (db) await db.end();
  }
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error('Cópia interrompida:', error.code || error.message); process.exitCode = 1; });
