const { pool } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { removeMenuImage } = require('../config/upload');
const menuOptionService = require('./menuOption.service');
const { shortIngredients } = require('./menuAvailability.service');
const { toSatang, toBaht } = require('../utils/money');

const toMenu = (r) => ({
  id: r.id,
  categoryId: r.category_id,
  categoryName: r.category_name,
  name: r.name,
  nameEn: r.name_en ?? null, // ชื่อภาษาอังกฤษ (ว่าง = ใช้ชื่อไทย)
  description: r.description,
  price: r.price,
  imageUrl: r.image_url,
  status: r.status,
  autoSoldOut: !!r.auto_sold_out, // ระบบตั้งเป็นหมดเองเพราะวัตถุดิบไม่พอ
  isActive: !!r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const BASE_SELECT = `
  SELECT m.*, c.name AS category_name
    FROM menus m JOIN categories c ON c.id = m.category_id`;

/**
 * ต้นทุน/กำไรต่อจาน (ขนาดปกติ ไม่รวมตัวเลือก)
 *   ต้นทุนวัตถุดิบ = สูตร menu_ingredients × ingredients.cost_per_unit
 *   ต้นทุนรวม     = ต้นทุนวัตถุดิบ + menus.extra_cost (ค่ากล่อง แก๊ส แก้ว ที่ admin พิมพ์เอง)
 * extraById: Map<menuId, extra_cost>
 * คืน Map<menuId, { ingredientCost, extraCost, cost, profit, marginPercent, recipeItems, missingCostItems }>
 *   - ไม่มีสูตร -> ingredientCost = null; ถ้าไม่มีต้นทุนอื่นด้วย -> cost/profit = null
 *   - วัตถุดิบบางตัวไม่ได้ใส่ต้นทุน -> นับเป็น 0 และแจ้ง missingCostItems
 */
async function costsFor(menus, extraById) {
  const ids = menus.map((m) => m.id);
  const out = new Map();
  if (!ids.length) return out;
  const [rows] = await pool.query(
    `SELECT mi.menu_id, mi.quantity, i.cost_per_unit
       FROM menu_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id
      WHERE mi.menu_id IN (?)`,
    [ids]
  );
  const acc = new Map();
  for (const r of rows) {
    const a = acc.get(r.menu_id) || { satang: 0, items: 0, missing: 0 };
    a.items += 1;
    if (r.cost_per_unit === null) a.missing += 1;
    // quantity มีทศนิยม 3 ตำแหน่ง -> คิดเป็นสตางค์แบบทศนิยมก่อน แล้วปัดตอนรวม
    else a.satang += Number(r.quantity) * toSatang(r.cost_per_unit);
    acc.set(r.menu_id, a);
  }
  for (const m of menus) {
    const a = acc.get(m.id);
    const extraSatang = toSatang(extraById.get(m.id) || 0);
    const ingredientSatang = a ? Math.round(a.satang) : null;
    const base = { ingredientCost: ingredientSatang === null ? null : toBaht(ingredientSatang), extraCost: toBaht(extraSatang) };
    const meta = { recipeItems: a?.items ?? 0, missingCostItems: a?.missing ?? 0 };
    if (ingredientSatang === null && extraSatang === 0) {
      out.set(m.id, { ...base, cost: null, profit: null, marginPercent: null, ...meta });
      continue;
    }
    const costSatang = (ingredientSatang ?? 0) + extraSatang;
    const priceSatang = toSatang(m.price);
    const profitSatang = priceSatang - costSatang;
    out.set(m.id, {
      ...base,
      cost: toBaht(costSatang),
      profit: toBaht(profitSatang),
      marginPercent: priceSatang > 0 ? Math.round((profitSatang / priceSatang) * 1000) / 10 : null,
      ...meta,
    });
  }
  return out;
}

/** ตั้งต้นทุนอื่นต่อจาน (admin) — คืน costing ใหม่ของเมนูนั้น */
async function setExtraCost(id, extraCost) {
  const [r] = await pool.query('UPDATE menus SET extra_cost = ? WHERE id = ? AND is_active = 1', [extraCost, id]);
  if (!r.affectedRows) throw ApiError.notFound('ไม่พบเมนู');
  const [[row]] = await pool.query('SELECT id, price, extra_cost FROM menus WHERE id = ?', [id]);
  const costs = await costsFor([row], new Map([[row.id, row.extra_cost]]));
  return costs.get(row.id);
}

/**
 * รายการเมนู
 * filters: categoryId, status (available/sold_out), search (ชื่อ), includeInactive (เฉพาะ admin)
 * withCost: แนบต้นทุน/กำไรต่อจาน (เฉพาะ admin)
 */
async function list({ categoryId, status, search, includeInactive = false, withCost = false } = {}) {
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
    where.push('(m.name LIKE ? OR m.name_en LIKE ?)');
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(like, like);
  }
  const [rows] = await pool.query(
    `${BASE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.sort_order, c.id, m.name`,
    params
  );
  const menus = rows.map(toMenu);
  if (withCost) {
    const costs = await costsFor(menus, new Map(rows.map((r) => [r.id, r.extra_cost])));
    for (const m of menus) m.costing = costs.get(m.id);
  }
  return menus;
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

/** เปิดขายได้เมื่อวัตถุดิบในสูตรพอทำอย่างน้อย 1 จาน */
async function assertCanSell(menuId) {
  const short = await shortIngredients(menuId);
  if (short.length) {
    const list = short.map((s) => `${s.name} (ต้องใช้ ${s.required} เหลือ ${s.available} ${s.unit})`).join(', ');
    throw ApiError.badRequest(`เปิดขายไม่ได้ วัตถุดิบไม่พอ: ${list} — รับเข้าวัตถุดิบก่อน`, short);
  }
}

async function create({ categoryId, name, nameEn, description, price, status, imageUrl }) {
  await assertCategoryActive(categoryId);
  await assertNameAvailable(name);
  const [r] = await pool.query(
    'INSERT INTO menus (category_id, name, name_en, description, price, status, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [categoryId, name, nameEn, description, price, status, imageUrl]
  );
  return getById(r.insertId);
}

/**
 * แก้ไขเมนู
 * image: { newUrl } = เปลี่ยนรูป, { remove: true } = ลบรูป, ไม่ส่ง = ใช้รูปเดิม
 * ลบไฟล์รูปเก่าหลังบันทึกสำเร็จเท่านั้น
 */
async function update(id, { categoryId, name, nameEn, description, price, status }, image = {}) {
  const current = await getById(id);
  if (!current.isActive) throw ApiError.badRequest('เมนูนี้ถูกลบแล้ว');
  if (categoryId !== current.categoryId) await assertCategoryActive(categoryId);
  await assertNameAvailable(name, id);

  let imageUrl = current.imageUrl;
  if (image.newUrl) imageUrl = image.newUrl;
  else if (image.remove) imageUrl = null;

  // เปลี่ยนสถานะเอง -> ไม่ใช่ "หมดอัตโนมัติ" แล้ว; สถานะเดิม -> คง auto_sold_out ไว้
  const statusChanged = status !== current.status;
  if (statusChanged && status === 'available') await assertCanSell(id);
  await pool.query(
    `UPDATE menus SET category_id = ?, name = ?, name_en = ?, description = ?, price = ?, status = ?, image_url = ?
                      ${statusChanged ? ', auto_sold_out = 0' : ''} WHERE id = ?`,
    [categoryId, name, nameEn, description, price, status, imageUrl, id]
  );
  if (current.imageUrl && current.imageUrl !== imageUrl) removeMenuImage(current.imageUrl);
  return getById(id);
}

async function updateStatus(id, status) {
  const current = await getById(id);
  if (!current.isActive) throw ApiError.badRequest('เมนูนี้ถูกลบแล้ว');
  if (status === 'available') await assertCanSell(id);
  await pool.query('UPDATE menus SET status = ?, auto_sold_out = 0 WHERE id = ?', [status, id]);
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

module.exports = { list, getById, create, update, updateStatus, remove, setExtraCost };
