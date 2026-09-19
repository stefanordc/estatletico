'use strict';
const mysql = require('mysql2/promise');
const { mysqlOptions } = require('../server/config.cjs');
const { mq } = require('../database/schema.cjs');
(async () => {
  const db = await mysql.createConnection(mysqlOptions(false));
  try {
    const name = process.env.MYSQL_DATABASE || 'estatletico';
    await db.query(`CREATE DATABASE IF NOT EXISTS ${mq(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs`);
    console.log(`Banco ${name} disponível. Nenhuma tabela existente foi alterada.`);
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
