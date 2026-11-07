/**
 * ตรวจสอบการเชื่อมต่อฐานข้อมูล จำนวนข้อมูลในแต่ละตาราง และความสัมพันธ์ (Foreign Keys)
 *   npm run db:check
 */
const { pool } = require('../src/config/database');
const env = require('../src/config/env');

(async () => {
  try {
    const [[info]] = await pool.query('SELECT VERSION() AS version, NOW() AS now, @@session.time_zone AS tz');
    console.log(`Connected: ${info.version} | time_zone=${info.tz} | now=${info.now.toLocaleString('th-TH')}`);

    const [tables] = await pool.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [env.db.database]
    );
    console.log('\nRow counts:');
    for (const { name } of tables) {
      const [[{ c }]] = await pool.query(`SELECT COUNT(*) AS c FROM \`${name}\``);
      console.log(`  ${name.padEnd(24)} ${c}`);
    }

    const [fks] = await pool.query(
      `SELECT k.TABLE_NAME AS tbl, k.COLUMN_NAME AS col, k.REFERENCED_TABLE_NAME AS ref_tbl,
              k.REFERENCED_COLUMN_NAME AS ref_col, r.DELETE_RULE AS on_delete
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.TABLE_NAME, k.COLUMN_NAME`,
      [env.db.database]
    );
    console.log('\nForeign keys:');
    fks.forEach((f) =>
      console.log(`  ${`${f.tbl}.${f.col}`.padEnd(38)} -> ${`${f.ref_tbl}.${f.ref_col}`.padEnd(18)} ON DELETE ${f.on_delete}`)
    );

    const [[thai]] = await pool.query('SELECT name FROM categories ORDER BY id LIMIT 1');
    console.log(`\nThai text check: ${thai ? thai.name : '(no categories)'}`);
  } catch (err) {
    console.error('✖ Check failed:', err.code || '', err.sqlMessage || err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
