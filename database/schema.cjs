'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, tables } = require('../server/config.cjs');
const destination = [process.env.MYSQL_HOST || '127.0.0.1', process.env.MYSQL_PORT || '3306', process.env.MYSQL_DATABASE || 'estatletico'].join(':');
const manifestPath = path.join(root, '.local-data', crypto.createHash('sha256').update(destination).digest('hex').slice(0, 16), 'schema.json');
const mq = name => '`' + String(name).replace(/`/g, '``') + '`';
const pq = name => '"' + String(name).replace(/"/g, '""') + '"';
const mysqlName = column => column.mysql_name || column.column_name;
const mysqlColumn = (table, name) => mysqlName(table.columns.find(column => column.column_name === name));
function readManifest() {
  if (!fs.existsSync(manifestPath)) throw new Error('Esquema ausente. Execute npm run db:copy primeiro.');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
function mysqlType(c) {
  if (c.data_type === 'ARRAY' || ['json', 'jsonb'].includes(c.udt_name)) return 'JSON';
  if (c.enum_values) return `ENUM(${c.enum_values.map(v => "'" + v.replace(/'/g, "''") + "'").join(',')})`;
  switch (c.udt_name) {
    case 'int2': return 'SMALLINT';
    case 'int4': return 'INT';
    case 'int8': return 'BIGINT';
    case 'bool': return 'BOOLEAN';
    case 'uuid': return 'CHAR(36)';
    case 'float4': return 'FLOAT';
    case 'float8': return 'DOUBLE';
    case 'numeric':
      if (!c.numeric_precision || c.numeric_precision > 65 || c.numeric_scale > 30 || c.numeric_scale < 0 || c.numeric_scale > c.numeric_precision)
        throw new Error(`${c.table_name}.${c.column_name}: numeric fora dos limites exatos MySQL; defina conversão explícita antes da cópia.`);
      return `DECIMAL(${c.numeric_precision},${c.numeric_scale})`;
    case 'varchar': case 'bpchar':
      return c.character_maximum_length && c.character_maximum_length <= 1000 ? `VARCHAR(${c.character_maximum_length})` : 'LONGTEXT';
    case 'text': return 'LONGTEXT';
    case 'date': return 'DATE';
    case 'timestamp': case 'timestamptz': return 'DATETIME(6)';
    case 'time': return 'TIME(6)';
    case 'bytea': return 'LONGBLOB';
    default: throw new Error(`${c.table_name}.${c.column_name}: tipo PostgreSQL não suportado (${c.udt_name}). Nenhuma conversão com perda será aplicada.`);
  }
}
async function discover(pg) {
  const names = (await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  for (const table of tables) if (!names.includes(table)) throw new Error(`Tabela obrigatória ausente: public.${table}`);
  if (names.some(n => n.startsWith('_estatletico_'))) throw new Error('Nome reservado _estatletico_ no esquema de origem.');
  const columns = (await pg.query(`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`)).rows;
  const constraints = (await pg.query(`SELECT c.conname AS name, c.contype AS type, t.relname AS "table", rt.relname AS "refTable",
    rn.nspname AS "refSchema", c.confupdtype AS "onUpdate", c.confdeltype AS "onDelete",
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS "refColumns",
    pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class rt ON rt.oid=c.confrelid
    LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace WHERE n.nspname='public'`)).rows;
  const indexes = (await pg.query(`SELECT t.relname AS "table", ix.relname AS name, i.indisunique AS unique, am.amname AS method,
    pg_get_expr(i.indpred,i.indrelid) AS predicate, pg_get_expr(i.indexprs,i.indrelid) AS expression,
    ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS columns,
    pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class ix ON ix.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_am am ON am.oid=ix.relam WHERE n.nspname='public' AND NOT i.indisprimary`)).rows;
  const enums = (await pg.query(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname`)).rows;
  const manifest = { version: 1, capturedAt: new Date().toISOString(), tables: [],
    views: (await pg.query("SELECT viewname, definition FROM pg_views WHERE schemaname='public'")).rows,
    materializedViews: (await pg.query("SELECT matviewname, definition FROM pg_matviews WHERE schemaname='public'")).rows,
    routines: (await pg.query("SELECT routine_name, routine_type, routine_definition FROM information_schema.routines WHERE routine_schema='public'")).rows,
    triggers: (await pg.query("SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE trigger_schema='public'")).rows,
    warnings: [] };
  for (const name of names) {
    const cols = columns.filter(c => c.table_name === name).map(c => ({ ...c, enum_values: enums.find(e => e.typname === c.udt_name)?.labels }));
    const cons = constraints.filter(c => c.table === name);
    const pk = cons.find(c => c.type === 'p')?.columns;
    if (!pk?.length) throw new Error(`${name}: sem chave primária; cópia/sincronização segura exige chave estável.`);
    for (const c of cols) {
      if (c.is_generated !== 'NEVER') throw new Error(`${name}.${c.column_name}: coluna gerada exige conversão manual.`);
      c.mysqlType = mysqlType(c);
      c.auto = c.is_identity === 'YES' || /^nextval\(/.test(c.column_default || '');
      if (c.auto && (pk.length !== 1 || pk[0] !== c.column_name)) throw new Error(`${name}: identity composta exige adaptação manual.`);
    }
    // MySQL trata nomes de coluna sem diferenciar maiúsculas/minúsculas.
    // Preservamos o nome contemporâneo usado pela aplicação e mantemos a
    // coluna PostgreSQL histórica em um nome explícito de legado.
    for (const group of Object.values(Object.groupBy(cols, column => column.column_name.toLowerCase()))) {
      if (group.length < 2) continue;
      const preferred = group.find(column => /[A-Z]/.test(column.column_name)) || group[0];
      for (const column of group) {
        if (column === preferred) continue;
        column.mysql_name = `_legacy_${column.column_name}`;
        manifest.warnings.push(`${name}.${column.column_name} será mantida no MySQL como ${column.mysql_name}; ${preferred.column_name} mantém o nome da aplicação.`);
      }
    }
    const table = { name, columns: cols, pk, constraints: cons, indexes: indexes.filter(i => i.table === name) };
    for (const fk of cons.filter(c => c.type === 'f')) if (fk.refSchema !== 'public' || !names.includes(fk.refTable))
      throw new Error(`${name}.${fk.name}: FK para ${fk.refSchema}.${fk.refTable} exige plano explícito (Auth não é copiado).`);
    for (const c of cons.filter(c => c.type === 'c' || c.type === 'x')) manifest.warnings.push(`${name}: revisar constraint ${c.name}: ${c.definition}`);
    for (const idx of table.indexes) {
      const unsupported = idx.predicate || idx.expression || idx.method !== 'btree' || idx.columns.some(n => /TEXT|JSON|BLOB/.test(cols.find(c => c.column_name === n)?.mysqlType || ''));
      if (unsupported && idx.unique) throw new Error(`${name}: índice único ${idx.name} exige conversão manual sem perda de unicidade.`);
      idx.supported = !unsupported;
      if (unsupported) manifest.warnings.push(`${name}: índice especializado não convertido: ${idx.definition}`);
    }
    manifest.tables.push(table);
  }
  // MySQL verifica FKs imediatamente; ciclos não podem ser importados com segurança sem plano específico.
  const ordered = [], pending = [...manifest.tables];
  while (pending.length) {
    const index = pending.findIndex(t => t.constraints.filter(c => c.type === 'f').every(c => ordered.some(o => o.name === c.refTable)));
    if (index < 0) throw new Error('FKs cíclicas/autorreferentes: necessário plano de importação específico; verificações não serão desativadas.');
    ordered.push(...pending.splice(index, 1));
  }
  manifest.tables = ordered;
  return manifest;
}
function defaultSQL(c) {
  if (c.auto) return ' AUTO_INCREMENT';
  const d = c.column_default;
  if (!d) return '';
  if (/^(now\(\)|CURRENT_TIMESTAMP)$/i.test(d) && /DATETIME/.test(c.mysqlType)) return ' DEFAULT CURRENT_TIMESTAMP(6)';
  if (/^(true|false)$/i.test(d)) return ` DEFAULT ${d.toLowerCase() === 'true' ? 1 : 0}`;
  if (/^-?\d+(\.\d+)?$/.test(d)) return ` DEFAULT ${d}`;
  const literal = d.match(/^('(?:[^']|'')*')(::[\w\s.\[\]"]+)?$/);
  if (literal && !/JSON|TEXT|BLOB/.test(c.mysqlType)) return ` DEFAULT ${literal[1]}`;
  return ''; // Relatado no manifesto; inserts devem fornecer este campo.
}
function createSQL(t) {
  for (const name of [t.name, ...t.columns.map(mysqlName), ...t.indexes.map(i => i.name), ...t.constraints.filter(c => c.type === 'f').map(c => c.name)])
    if (name.length > 64) throw new Error(`Identificador excede 64 caracteres no MySQL: ${name}`);
  if (t.pk.some(n => /TEXT|BLOB|JSON/.test(t.columns.find(c => c.column_name === n).mysqlType))) throw new Error(`${t.name}: PK textual sem limite exige conversão explícita.`);
  const parts = t.columns.map(c => `${mq(mysqlName(c))} ${c.mysqlType} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}${defaultSQL(c)}`);
  parts.push(`PRIMARY KEY (${t.pk.map(name => mq(mysqlColumn(t, name)))})`);
  for (const i of t.indexes.filter(i => i.supported)) parts.push(`${i.unique ? 'UNIQUE ' : ''}KEY ${mq(i.name)} (${i.columns.map(name => mq(mysqlColumn(t, name)))})`);
  for (const f of t.constraints.filter(c => c.type === 'f')) {
    const actions = { a: 'RESTRICT', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL' };
    if (!actions[f.onUpdate] || !actions[f.onDelete]) throw new Error(`FK ${f.name}: SET DEFAULT não suportado no MySQL.`);
    parts.push(`CONSTRAINT ${mq(f.name)} FOREIGN KEY (${f.columns.map(name => mq(mysqlColumn(t, name)))}) REFERENCES ${mq(f.refTable)} (${f.refColumns.map(mq)}) ON UPDATE ${actions[f.onUpdate]} ON DELETE ${actions[f.onDelete]}`);
  }
  return `CREATE TABLE IF NOT EXISTS ${mq(t.name)} (${parts.join(',\n')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs`;
}
module.exports = { mq, pq, mysqlName, mysqlColumn, manifestPath, readManifest, discover, createSQL, mysqlType, defaultSQL };
