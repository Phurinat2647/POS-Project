const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../config/database');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * จัดการผู้ใช้ (admin)
 * - ห้ามแก้ role / ปิดใช้งาน / ลบ บัญชีของตัวเอง (กันล็อกตัวเองออกจากระบบ)
 * - ต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คนเสมอ (ล็อกแถว admin ด้วย FOR UPDATE)
 * - ผู้ใช้ที่เคยมีประวัติ (ออเดอร์/รับเงิน/สต็อก) ลบแบบ soft delete (is_active = 0)
 */

const toUser = (r) => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  phone: r.phone,
  role: r.role,
  roleDisplayName: r.role_display_name,
  isActive: !!r.is_active,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
});

const SELECT = `
  SELECT u.id, u.username, u.full_name, u.phone, u.is_active, u.last_login_at, u.created_at,
         r.name AS role, r.display_name AS role_display_name
    FROM users u JOIN roles r ON r.id = u.role_id`;

async function listRoles() {
  const [rows] = await pool.query('SELECT name, display_name FROM roles ORDER BY id');
  return rows.map((r) => ({ name: r.name, displayName: r.display_name }));
}

async function list({ includeInactive = true } = {}) {
  const [rows] = await pool.query(
    `${SELECT} ${includeInactive ? '' : 'WHERE u.is_active = 1'} ORDER BY u.is_active DESC, r.id, u.username`
  );
  return rows.map(toUser);
}

async function getById(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT} WHERE u.id = ?`, [id]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบผู้ใช้');
  return toUser(rows[0]);
}

async function roleId(conn, role) {
  const [[row]] = await conn.query('SELECT id FROM roles WHERE name = ?', [role]);
  if (!row) throw ApiError.badRequest('ตำแหน่งไม่ถูกต้อง');
  return row.id;
}

/** ตรวจว่าหลังเปลี่ยนแปลงแล้วยังเหลือ admin ที่ใช้งานได้ (เรียกภายใน transaction) */
async function assertKeepsAnAdmin(conn, targetId, { willBeActiveAdmin }) {
  if (willBeActiveAdmin) return;
  const [admins] = await conn.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_active = 1 FOR UPDATE`
  );
  if (admins.every((a) => a.id === targetId)) {
    throw ApiError.conflict('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
  }
}

/** data: { username, password, fullName, phone, role } */
async function create(data) {
  return withTransaction(async (conn) => {
    const [[dup]] = await conn.query('SELECT id FROM users WHERE username = ?', [data.username]);
    if (dup) throw ApiError.conflict('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    const hash = await bcrypt.hash(data.password, env.bcryptRounds);
    const [r] = await conn.query(
      'INSERT INTO users (role_id, username, password_hash, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      [await roleId(conn, data.role), data.username, hash, data.fullName, data.phone]
    );
    return getById(r.insertId, conn);
  });
}

/** data: { fullName, phone, role, isActive } — actor = ผู้ใช้ที่ทำรายการ */
async function update(id, data, actor) {
  return withTransaction(async (conn) => {
    const current = await getById(id, conn);
    if (id === actor.id) {
      if (data.role !== current.role) throw ApiError.badRequest('ไม่สามารถเปลี่ยนตำแหน่งของตัวเองได้');
      if (!data.isActive) throw ApiError.badRequest('ไม่สามารถปิดใช้งานบัญชีของตัวเองได้');
    }
    if (current.role === 'admin' && current.isActive) {
      await assertKeepsAnAdmin(conn, id, { willBeActiveAdmin: data.role === 'admin' && data.isActive });
    }
    await conn.query('UPDATE users SET full_name = ?, phone = ?, role_id = ?, is_active = ? WHERE id = ?', [
      data.fullName,
      data.phone,
      await roleId(conn, data.role),
      data.isActive ? 1 : 0,
      id,
    ]);
    return getById(id, conn);
  });
}

/** ตั้งรหัสผ่านใหม่ให้ผู้ใช้อื่น (ตัวเองให้ใช้หน้าเปลี่ยนรหัสผ่าน ซึ่งต้องยืนยันรหัสเดิม) */
async function resetPassword(id, password, actor) {
  if (id === actor.id) throw ApiError.badRequest('เปลี่ยนรหัสผ่านของตัวเองที่หน้า "เปลี่ยนรหัสผ่าน"');
  await getById(id);
  const hash = await bcrypt.hash(password, env.bcryptRounds);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
}

/** ลบ: มีประวัติการใช้งาน -> ปิดใช้งาน, ไม่มี -> ลบจริง */
async function remove(id, actor) {
  if (id === actor.id) throw ApiError.badRequest('ไม่สามารถลบบัญชีของตัวเองได้');
  return withTransaction(async (conn) => {
    const current = await getById(id, conn);
    if (current.role === 'admin' && current.isActive) {
      await assertKeepsAnAdmin(conn, id, { willBeActiveAdmin: false });
    }
    const [[{ used }]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM orders WHERE cashier_id = ?)
            + (SELECT COUNT(*) FROM payments WHERE received_by = ?)
            + (SELECT COUNT(*) FROM inventory_transactions WHERE created_by = ?) AS used`,
      [id, id, id]
    );
    if (Number(used) > 0) {
      if (!current.isActive) throw ApiError.badRequest('ผู้ใช้นี้ถูกปิดใช้งานแล้ว');
      await conn.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
      return { softDeleted: true };
    }
    await conn.query('DELETE FROM users WHERE id = ?', [id]);
    return { softDeleted: false };
  });
}

module.exports = { listRoles, list, getById, create, update, resetPassword, remove };
