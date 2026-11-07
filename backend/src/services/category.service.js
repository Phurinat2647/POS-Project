const { pool } = require('../config/database');
const ApiError = require('../utils/ApiError');

const toCategory = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  sortOrder: r.sort_order,
  isActive: !!r.is_active,
  menuCount: Number(r.menu_count || 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function list({ includeInactive = false } = {}) {
  const [rows] = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM menus m WHERE m.category_id = c.id AND m.is_active = 1) AS menu_count
       FROM categories c
      WHERE (? = 1 OR c.is_active = 1)
      ORDER BY c.sort_order, c.id`,
    [includeInactive ? 1 : 0]
  );
  return rows.map(toCategory);
}

async function getById(id) {
  const [rows] = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM menus m WHERE m.category_id = c.id AND m.is_active = 1) AS menu_count
       FROM categories c WHERE c.id = ?`,
    [id]
  );
  if (!rows[0]) throw ApiError.notFound('ไม่พบหมวดหมู่');
  return toCategory(rows[0]);
}

/** ชื่อ UNIQUE ทั้งตาราง — แจ้งให้ชัดถ้าชื่อซ้ำกับหมวดที่ถูกปิดไว้ */
async function assertNameAvailable(name, exceptId = 0) {
  const [rows] = await pool.query('SELECT id, is_active FROM categories WHERE name = ? AND id <> ?', [name, exceptId]);
  if (rows[0]) {
    throw ApiError.conflict(
      rows[0].is_active ? 'มีหมวดหมู่ชื่อนี้อยู่แล้ว' : 'ชื่อนี้ซ้ำกับหมวดหมู่ที่ถูกปิดใช้งาน — เปิดใช้งานหมวดเดิมแทน'
    );
  }
}

async function create({ name, description, sortOrder }) {
  await assertNameAvailable(name);
  const [r] = await pool.query(
    'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
    [name, description, sortOrder]
  );
  return getById(r.insertId);
}

async function update(id, { name, description, sortOrder, isActive }) {
  await getById(id);
  await assertNameAvailable(name, id);
  await pool.query(
    'UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [name, description, sortOrder, isActive ? 1 : 0, id]
  );
  return getById(id);
}

/**
 * ลบหมวดหมู่
 * - ยังมีเมนูที่ใช้งานอยู่ -> ไม่อนุญาต
 * - มีเฉพาะเมนูที่ถูก soft delete -> ปิดใช้งาน (is_active = 0) เพราะ FK ยังอ้างอิงอยู่
 * - ไม่มีเมนูเลย -> ลบจริง
 */
async function remove(id) {
  const cat = await getById(id);
  if (cat.menuCount > 0) {
    throw ApiError.conflict(`ไม่สามารถลบได้ เนื่องจากยังมีเมนูในหมวดนี้ ${cat.menuCount} รายการ`);
  }
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM menus WHERE category_id = ?', [id]);
  if (total > 0) {
    await pool.query('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
    return { softDeleted: true };
  }
  await pool.query('DELETE FROM categories WHERE id = ?', [id]);
  return { softDeleted: false };
}

module.exports = { list, getById, create, update, remove };
