const { pool, withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');

/**
 * ตัวเลือกเมนู (ขนาด / ท็อปปิ้ง)
 * scope: 'menu' (menu_id), 'category' (category_id), 'all' (ทั้งคู่ NULL)
 */

const scopeOf = (r) => (r.menu_id ? 'menu' : r.category_id ? 'category' : 'all');

const toOption = (r) => ({
  id: r.id,
  scope: scopeOf(r),
  menuId: r.menu_id,
  menuName: r.menu_name ?? null,
  categoryId: r.category_id,
  categoryName: r.category_name ?? null,
  optionType: r.option_type,
  name: r.name,
  extraPrice: r.extra_price,
  isDefault: !!r.is_default,
  sortOrder: r.sort_order,
  isActive: !!r.is_active,
});

const BASE_SELECT = `
  SELECT o.*, m.name AS menu_name, c.name AS category_name
    FROM menu_options o
    LEFT JOIN menus m ON m.id = o.menu_id
    LEFT JOIN categories c ON c.id = o.category_id`;

const ORDER_BY = `ORDER BY (o.menu_id IS NULL AND o.category_id IS NULL) DESC, c.sort_order, o.category_id, m.name,
                  o.option_type, o.sort_order, o.id`;

/** รายการทั้งหมดสำหรับหน้าจัดการ — filters: scope, categoryId, menuId, optionType */
async function list({ scope, categoryId, menuId, optionType } = {}) {
  const where = ['(o.menu_id IS NULL OR m.is_active = 1)'];
  const params = [];
  if (scope === 'all') where.push('o.menu_id IS NULL AND o.category_id IS NULL');
  if (scope === 'category') where.push('o.category_id IS NOT NULL');
  if (scope === 'menu') where.push('o.menu_id IS NOT NULL');
  if (categoryId) {
    // ตัวเลือกของหมวดนี้ + ตัวเลือกเฉพาะเมนูในหมวดนี้
    where.push('(o.category_id = ? OR m.category_id = ?)');
    params.push(categoryId, categoryId);
  }
  if (menuId) {
    where.push('o.menu_id = ?');
    params.push(menuId);
  }
  if (optionType) {
    where.push('o.option_type = ?');
    params.push(optionType);
  }
  const [rows] = await pool.query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ${ORDER_BY}`, params);
  return rows.map(toOption);
}

/** ตัวเลือกที่ใช้ได้กับเมนูหนึ่ง (เฉพาะเมนู + ทั้งหมวด + ทุกเมนู) ที่เปิดใช้งาน */
async function listForMenu(menuId, categoryId) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
      WHERE o.is_active = 1
        AND (o.menu_id = ? OR o.category_id = ? OR (o.menu_id IS NULL AND o.category_id IS NULL))
      ORDER BY o.option_type, o.sort_order, o.id`,
    [menuId, categoryId]
  );
  return rows.map(toOption);
}

async function getById(id, conn = pool) {
  const [rows] = await conn.query(`${BASE_SELECT} WHERE o.id = ?`, [id]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบตัวเลือก');
  return toOption(rows[0]);
}

async function assertScopeTarget(conn, { menuId, categoryId }) {
  if (menuId) {
    const [r] = await conn.query('SELECT id FROM menus WHERE id = ? AND is_active = 1', [menuId]);
    if (!r[0]) throw ApiError.badRequest('ไม่พบเมนูที่เลือก');
  }
  if (categoryId) {
    const [r] = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
    if (!r[0]) throw ApiError.badRequest('ไม่พบหมวดหมู่ที่เลือก');
  }
}

/** ขนาดที่เป็นค่าเริ่มต้นมีได้ 1 รายการต่อขอบเขต */
async function clearOtherDefaults(conn, { id = 0, menuId, categoryId }) {
  await conn.query(
    `UPDATE menu_options SET is_default = 0
      WHERE option_type = 'size' AND id <> ?
        AND menu_id <=> ? AND category_id <=> ?`,
    [id, menuId, categoryId]
  );
}

async function create(data) {
  return withTransaction(async (conn) => {
    await assertScopeTarget(conn, data);
    const isDefault = data.optionType === 'size' && data.isDefault;
    const [r] = await conn.query(
      `INSERT INTO menu_options (menu_id, category_id, option_type, name, extra_price, is_default, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.menuId, data.categoryId, data.optionType, data.name, data.extraPrice, isDefault ? 1 : 0, data.sortOrder, data.isActive ? 1 : 0]
    );
    if (isDefault) await clearOtherDefaults(conn, { id: r.insertId, ...data });
    return getById(r.insertId, conn);
  });
}

async function update(id, data) {
  return withTransaction(async (conn) => {
    await getById(id, conn);
    await assertScopeTarget(conn, data);
    const isDefault = data.optionType === 'size' && data.isDefault;
    await conn.query(
      `UPDATE menu_options
          SET menu_id = ?, category_id = ?, option_type = ?, name = ?, extra_price = ?, is_default = ?, sort_order = ?, is_active = ?
        WHERE id = ?`,
      [data.menuId, data.categoryId, data.optionType, data.name, data.extraPrice, isDefault ? 1 : 0, data.sortOrder, data.isActive ? 1 : 0, id]
    );
    if (isDefault) await clearOtherDefaults(conn, { id, ...data });
    return getById(id, conn);
  });
}

/** ลบจริงได้ — ออเดอร์เก่าเก็บชื่อ/ราคาตัวเลือกเป็น snapshot ใน order_item_options แล้ว */
async function remove(id) {
  await getById(id);
  await pool.query('DELETE FROM menu_options WHERE id = ?', [id]);
}

module.exports = { list, listForMenu, getById, create, update, remove };
