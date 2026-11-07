const { pool } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { removeMenuImage } = require('../config/upload');
const menuOptionService = require('./menuOption.service');

const toMenu = (r) => ({
  id: r.id,
  categoryId: r.category_id,
  categoryName: r.category_name,
  name: r.name,
  description: r.description,
  price: r.price,
  imageUrl: r.image_url,
  status: r.status,
  isActive: !!r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const BASE_SELECT = `
  SELECT m.*, c.name AS category_name
    FROM menus m JOIN categories c ON c.id = m.category_id`;

/**
 * รายการเมนู
 * filters: categoryId, status (available/sold_out), search (ชื่อ), includeInactive (เฉพาะ admin)
 */
async function list({ categoryId, status, search, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('m.is_active = 1');
  if (categoryId) {
    where.push('m.category_id = ?');
    params.push(categoryId);
  }
  if (status) {
    where.push('m.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('m.name LIKE ?');
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const [rows] = await pool.query(
    `${BASE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.sort_order, c.id, m.name`,
    params
  );
  return rows.map(toMenu);
}

async function getById(id, { withOptions = false, includeInactive = true } = {}) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE m.id = ? ${includeInactive ? '' : 'AND m.is_active = 1'}`, [id]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบเมนู');
  const menu = toMenu(rows[0]);
  if (withOptions) menu.options = await menuOptionService.listForMenu(menu.id, menu.categoryId);
  return menu;
}

async function assertCategoryActive(categoryId) {
  const [rows] = await pool.query('SELECT is_active FROM categories WHERE id = ?', [categoryId]);
  if (!rows[0]) throw ApiError.badRequest('ไม่พบหมวดหมู่ที่เลือก');
  if (!rows[0].is_active) throw ApiError.badRequest('หมวดหมู่ที่เลือกถูกปิดใช้งาน');
}

async function assertNameAvailable(name, exceptId = 0) {
  const [rows] = await pool.query('SELECT id, is_active FROM menus WHERE name = ? AND id <> ?', [name, exceptId]);
  if (rows[0]) {
    throw ApiError.conflict(
      rows[0].is_active ? 'มีเมนูชื่อนี้อยู่แล้ว' : 'ชื่อนี้ซ้ำกับเมนูที่เคยถูกลบ (เก็บไว้เป็นประวัติการขาย) กรุณาใช้ชื่ออื่น'
    );
  }
}

async function create({ categoryId, name, description, price, status, imageUrl }) {
  await assertCategoryActive(categoryId);
  await assertNameAvailable(name);
  const [r] = await pool.query(
    'INSERT INTO menus (category_id, name, description, price, status, image_url) VALUES (?, ?, ?, ?, ?, ?)',
    [categoryId, name, description, price, status, imageUrl]
  );
  return getById(r.insertId);
}

/**
 * แก้ไขเมนู
 * image: { newUrl } = เปลี่ยนรูป, { remove: true } = ลบรูป, ไม่ส่ง = ใช้รูปเดิม
 * ลบไฟล์รูปเก่าหลังบันทึกสำเร็จเท่านั้น
 */
async function update(id, { categoryId, name, description, price, status }, image = {}) {
  const current = await getById(id);
  if (!current.isActive) throw ApiError.badRequest('เมนูนี้ถูกลบแล้ว');
  if (categoryId !== current.categoryId) await assertCategoryActive(categoryId);
  await assertNameAvailable(name, id);

  let imageUrl = current.imageUrl;
  if (image.newUrl) imageUrl = image.newUrl;
  else if (image.remove) imageUrl = null;

  await pool.query(
    'UPDATE menus SET category_id = ?, name = ?, description = ?, price = ?, status = ?, image_url = ? WHERE id = ?',
    [categoryId, name, description, price, status, imageUrl, id]
  );
  if (current.imageUrl && current.imageUrl !== imageUrl) removeMenuImage(current.imageUrl);
  return getById(id);
}

async function updateStatus(id, status) {
  const current = await getById(id);
  if (!current.isActive) throw ApiError.badRequest('เมนูนี้ถูกลบแล้ว');
  await pool.query('UPDATE menus SET status = ? WHERE id = ?', [status, id]);
  return getById(id);
}

/**
 * ลบเมนู
 * - เคยถูกสั่งในออเดอร์ -> soft delete (is_active = 0) เก็บไว้เป็นประวัติ
 * - ยังไม่เคยถูกใช้ -> ลบจริงพร้อมไฟล์รูป (ตัวเลือกเฉพาะเมนูถูกลบตาม FK CASCADE)
 */
async function remove(id) {
  const current = await getById(id);
  if (!current.isActive) throw ApiError.notFound('ไม่พบเมนู');

  const [[{ used }]] = await pool.query('SELECT COUNT(*) AS used FROM order_items WHERE menu_id = ?', [id]);
  if (used > 0) {
    await pool.query('UPDATE menus SET is_active = 0 WHERE id = ?', [id]);
    return { softDeleted: true };
  }
  await pool.query('DELETE FROM menus WHERE id = ?', [id]);
  removeMenuImage(current.imageUrl);
  return { softDeleted: false };
}

module.exports = { list, getById, create, update, updateStatus, remove };
