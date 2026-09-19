'use strict';
const { openMysql, batchSize } = require('../database/connections.cjs');
const { readManifest, mq } = require('../database/schema.cjs');
const { hash, baseline, mysqlProjection } = require('../database/records.cjs');
(async () => {
  const manifest = readManifest();
  const db = await openMysql();
  try {
    for (const t of manifest.tables) {
      let offset = 0, iguais = 0, alterados = 0, novos = 0;
      while (true) {
        const [rows] = await db.query(`SELECT ${mysqlProjection(t)} FROM ${mq(t.name)} ORDER BY ${t.pk.map(name => mq(t.columns.find(c => c.column_name === name).mysql_name || name))} LIMIT ? OFFSET ?`, [batchSize(), offset]);
        if (!rows.length) break;
        for (const row of rows) {
          const base = await baseline(db, t, row);
          if (!base) novos++; else if (base.row_hash === hash(t, row)) iguais++; else alterados++;
        }
        offset += rows.length;
      }
      console.log(`${t.name}: origem na cópia=${t.sourceCount}, MySQL=${offset}, iguais=${iguais}, alterados=${alterados}, novos=${novos}`);
    }
    if (!manifest.ready) throw new Error('Cópia incompleta; execute novamente db:copy.');
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
