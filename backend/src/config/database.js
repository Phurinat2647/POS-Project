const mysql = require('mysql2/promise');
const env = require('./env');

/**
 * Connection pool หลักของระบบ
 * - charset utf8mb4 เพื่อรองรับภาษาไทย
 * - timezone +07:00 เพื่อให้ DATETIME ตรงกับเวลาไทย
 * - decimalNumbers: แปลง DECIMAL เป็น number (ยอดเงินคำนวณใน service ด้วยหน่วยสตางค์)
 */
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  waitForConnections: true,
  charset: 'utf8mb4_unicode_ci',
  timezone: env.db.timezone,
  dateStrings: false,
  decimalNumbers: true,
  namedPlaceholders: false,
});

// ตั้ง time_zone ของ session ให้ตรงกัน (ใช้กับ NOW(), CURDATE() ในรายงาน)
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${env.db.timezone}'`);
});

/**
 * รันฟังก์ชันภายใน Transaction เดียว
 * commit อัตโนมัติเมื่อสำเร็จ / rollback เมื่อเกิด error
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function testConnection() {
  const [rows] = await pool.query('SELECT VERSION() AS version, NOW() AS now');
  return rows[0];
}

module.exports = { pool, withTransaction, testConnection };
