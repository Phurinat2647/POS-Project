/**
 * สร้างฐานข้อมูล + ตาราง + ข้อมูลเริ่มต้น
 *   npm run db:setup            -> รัน schema.sql และ seed.sql
 *   npm run db:setup -- --schema-only
 *
 * คำเตือน: schema.sql จะ DROP ตารางเดิมทั้งหมด (ข้อมูลเดิมจะหายไป)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DB_NAME = process.env.DB_NAME || 'food_pos';
const schemaOnly = process.argv.includes('--schema-only');

function loadSql(file) {
  let sql = fs.readFileSync(path.resolve(__dirname, '../database', file), 'utf8');
  // รองรับการเปลี่ยนชื่อฐานข้อมูลผ่าน DB_NAME
  if (DB_NAME !== 'food_pos') sql = sql.replace(/`food_pos`/g, `\`${DB_NAME}\``);
  return sql;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4_unicode_ci',
    multipleStatements: true,
  });

  try {
    await conn.query(`SET time_zone = '${process.env.DB_TIMEZONE || '+07:00'}'`);
    console.log(`> Creating schema in database "${DB_NAME}" ...`);
    await conn.query(loadSql('schema.sql'));
    console.log('  schema.sql ✔');

    if (!schemaOnly) {
      console.log('> Inserting seed data ...');
      await conn.query(loadSql('seed.sql'));
      console.log('  seed.sql ✔');
    }

    const [tables] = await conn.query(
      'SELECT TABLE_NAME AS name, TABLE_ROWS AS approx_rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [DB_NAME]
    );
    console.log(`> Done. ${tables.length} tables:`);
    tables.forEach((t) => console.log(`  - ${t.name}`));
  } catch (err) {
    console.error('✖ Database setup failed:', err.code || '', err.sqlMessage || err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
