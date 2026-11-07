const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

// hash สำหรับเปรียบเทียบเมื่อไม่พบ username เพื่อให้เวลาตอบสนองใกล้เคียงกัน (ลดการเดา username)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', env.bcryptRounds);

const USER_COLUMNS = `
  u.id, u.username, u.full_name, u.phone, u.is_active, u.last_login_at,
  r.name AS role, r.display_name AS role_display_name`;

/** แปลงแถวจาก DB เป็นข้อมูลผู้ใช้ที่ส่งให้ client ได้ (ไม่มี password_hash) */
function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    roleDisplayName: row.role_display_name,
    lastLoginAt: row.last_login_at,
  };
}

async function login(username, password) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS}, u.password_hash
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? LIMIT 1`,
    [username]
  );
  const row = rows[0];

  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw ApiError.unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (!row.is_active) throw ApiError.forbidden('บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);

  const user = toPublicUser(row);
  return { token: signToken(user), expiresIn: env.jwt.expiresIn, user };
}

/** ดึงผู้ใช้ที่ยังใช้งานอยู่ (ใช้ใน middleware ทุก request) — คืน null ถ้าไม่พบ/ถูกปิด */
async function findActiveUserById(id) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS}
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.is_active = 1 LIMIT 1`,
    [id]
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
}

async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบผู้ใช้');

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) throw ApiError.badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');

  const hash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
}

module.exports = { login, findActiveUserById, changePassword };
