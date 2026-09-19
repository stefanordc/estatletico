'use strict';
const { tables } = require('../server/config.cjs');
const { mq, mysqlName } = require('./schema.cjs');
const { isJSON, findMysql, putMysql, toMysql } = require('./records.cjs');
function validate(spec, manifest) {
  if (!spec || !tables.includes(spec.table)) throw new Error('Tabela não permitida.');
  const table = manifest.tables.find(t => t.name === spec.table);
  if (!table) throw new Error('Tabela ainda não copiada.');
  const names = new Set(table.columns.map(c => c.column_name));
  const column = name => { if (!names.has(name)) throw new Error('Coluna inválida.'); return mq(mysqlName(table.columns.find(c => c.column_name === name))); };
  if (!['select', 'upsert', 'delete'].includes(spec.action)) throw new Error('Operação inválida.');
  const filters = spec.filters || [];
  if (!Array.isArray(filters) || filters.length > 10) throw new Error('Filtros inválidos.');
  const values = [];
  const conditions = filters.map(f => {
    const name = column(f.column);
    if (!['eq', 'ilike'].includes(f.op) || (f.value !== null && !['string', 'number', 'boolean'].includes(typeof f.value))) throw new Error('Filtro inválido.');
    if (f.value === null) return `${name} IS NULL`;
    values.push(f.value);
    return f.op === 'eq' ? `${name}=?` : `LOWER(${name}) LIKE LOWER(?)`;
  });
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  if (spec.action === 'delete') {
    if (filters.length !== table.pk.length || !table.pk.every(n => filters.some(f => f.column === n && f.op === 'eq' && f.value !== null))) throw new Error('Exclusão exige chave primária completa.');
  }
  let sql;
  if (spec.action === 'select') {
    const limit = spec.limit ?? 1000, offset = spec.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Paginação inválida.');
    const sourceColumn = name => {
      const physical = column(name);
      return `${physical} AS ${mq(name)}`;
    };
    const selected = spec.columns === '*' ? table.columns.map(c => sourceColumn(c.column_name)) : String(spec.columns).split(',').map(n => sourceColumn(n.trim()));
    const ordering = spec.order ? `${column(spec.order.column)} ${spec.order.ascending === false ? 'DESC' : 'ASC'},` : '';
    sql = `SELECT ${selected.join(',')} FROM ${mq(table.name)}${where} ORDER BY ${ordering}${table.pk.map(mq)} LIMIT ? OFFSET ?`;
    values.push(limit, offset);
  }
  if (spec.action === 'upsert') {
    if (!Array.isArray(spec.rows) || !spec.rows.length || spec.rows.length > 1000) throw new Error('Lote de escrita inválido.');
    for (const row of spec.rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Registro inválido.');
      for (const name of Object.keys(row)) column(name);
      if (table.pk.some(n => row[n] === null || row[n] === undefined || typeof row[n] === 'object')) throw new Error('Registro sem chave primária.');
    }
  }
  return { table, where, values, sql };
}
function apiRow(t, row) {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => {
    const c = t.columns.find(c => c.column_name === name);
    if (value === null || !c) return [name, value];
    if (isJSON(c)) return [name, typeof value === 'string' ? JSON.parse(value) : value];
    if (c.udt_name === 'bool') return [name, Boolean(Number(value))];
    if (['int2', 'int4', 'int8'].includes(c.udt_name)) return [name, Number.isSafeInteger(Number(value)) ? Number(value) : String(value)];
    if (['numeric', 'float4', 'float8'].includes(c.udt_name)) return [name, Number(value)];
    if (c.udt_name === 'timestamptz') return [name, String(value).replace(' ', 'T') + '+00:00'];
    return [name, value];
  }));
}
async function execute(db, spec, manifest) {
  const { table: t, sql, where, values } = validate(spec, manifest);
  if (spec.action === 'select') return { data: (await db.query(sql, values))[0].map(r => apiRow(t, r)), events: [] };
  const events = [], result = [];
  if (spec.action === 'delete') {
    const before = (await db.query(`SELECT * FROM ${mq(t.name)}${where} FOR UPDATE`, values))[0];
    // Exclusão é exclusivamente a ação explícita já existente na interface.
    await db.query(`DELETE FROM ${mq(t.name)}${where}`, values);
    for (const old of before) events.push({ table: t.name, eventType: 'DELETE', old: apiRow(t, old), new: {} });
  } else for (const input of spec.rows) {
    const row = { ...input };
    const previous = await findMysql(db, t, row, true);
    // Mesma identidade estável do trigger set_id_jogador; nenhum RPC remoto.
    if (t.name === 'jogadores' && t.columns.some(c => c.column_name === 'id_jogador')) {
      const complete = { ...previous, ...row };
      const [others] = complete.nome_completo?.trim() && complete.nascimento ? await db.query('SELECT id_jogador FROM jogadores WHERE nome_completo=? AND nascimento=? AND id<>? AND id_jogador IS NOT NULL ORDER BY id LIMIT 1', [complete.nome_completo, complete.nascimento, row.id]) : [[]];
      row.id_jogador = others[0]?.id_jogador || complete.id_jogador || row.id;
    }
    // Valores preparados em putMysql; JSON nunca interpolado como SQL.
    for (const c of t.columns) if (Object.hasOwn(row, c.column_name)) toMysql(c, row[c.column_name]);
    await putMysql(db, t, row, Boolean(previous));
    const stored = apiRow(t, await findMysql(db, t, row));
    result.push(stored);
    events.push({ table: t.name, eventType: previous ? 'UPDATE' : 'INSERT', new: stored, old: previous ? apiRow(t, previous) : {} });
  }
  return { data: result, events };
}
module.exports = { validate, apiRow, execute };
