const { pool, withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');

/**
 * คลังวัตถุดิบ
 * - ปริมาณคำนวณเป็นหน่วย 1/1000 (integer) เพื่อเลี่ยงปัญหาทศนิยม (คอลัมน์ DECIMAL(12,3))
 * - การเปลี่ยนยอดทุกครั้งทำผ่าน inventory_transactions ใน transaction เดียวกับการอัปเดต ingredients
 *   quantity เป็นค่าบวกเสมอ, balance_after = ยอดหลังทำรายการ
 * - ยังไม่ตัดสต็อกอัตโนมัติจากการขาย (menu_ingredients เตรียมไว้สำหรับอนาคต)
 */

const toMilli = (v) => Math.round(Number(v || 0) * 1000);
const fromMilli = (m) => Math.round(m) / 1000;

const TYPE_LABEL = { in: 'รับเข้า', out: 'เบิกออก', adjust: 'ปรับยอด' };

const toIngredient = (r) => ({
  id: r.id,
  name: r.name,
  unit: r.unit,
  quantity: r.quantity,
  minQuantity: r.min_quantity,
  costPerUnit: r.cost_per_unit,
  isLow: r.quantity <= r.min_quantity,
  isActive: !!r.is_active,
  lastMovementAt: r.last_movement_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toTransaction = (r) => ({
  id: r.id,
  ingredientId: r.ingredient_id,
  ingredientName: r.ingredient_name,
  unit: r.unit,
  type: r.type,
  quantity: r.quantity,
  balanceAfter: r.balance_after,
  unitCost: r.unit_cost,
  note: r.note,
  createdByName: r.created_by_name ?? null,
  createdAt: r.created_at,
});

const BASE_SELECT = `
  SELECT i.*, (SELECT MAX(t.created_at) FROM inventory_transactions t WHERE t.ingredient_id = i.id) AS last_movement_at
    FROM ingredients i`;

/** filters: search, lowOnly, includeInactive */
async function list({ search, lowOnly = false, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('i.is_active = 1');
  if (lowOnly) where.push('i.quantity <= i.min_quantity');
  if (search) {
    where.push('i.name LIKE ?');
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const [rows] = await pool.query(
    `${BASE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY i.is_active DESC, (i.quantity <= i.min_quantity) DESC, i.name`,
    params
  );
  return rows.map(toIngredient);
}

async function getById(id, conn = pool) {
  const [rows] = await conn.query(`${BASE_SELECT} WHERE i.id = ?`, [id]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบวัตถุดิบ');
  return toIngredient(rows[0]);
}

async function assertNameAvailable(conn, name, exceptId = 0) {
  const [rows] = await conn.query('SELECT id, is_active FROM ingredients WHERE name = ? AND id <> ?', [name, exceptId]);
  if (rows[0]) {
    throw ApiError.conflict(rows[0].is_active ? 'มีวัตถุดิบชื่อนี้อยู่แล้ว' : 'ชื่อนี้ซ้ำกับวัตถุดิบที่ถูกปิดใช้งาน กรุณาใช้ชื่ออื่น');
  }
}

/** เพิ่มวัตถุดิบ — ยอดเริ่มต้น > 0 จะบันทึกเป็นรายการรับเข้า "ยอดยกมา" */
async function create({ name, unit, quantity, minQuantity, costPerUnit }, userId) {
  return withTransaction(async (conn) => {
    await assertNameAvailable(conn, name);
    const [r] = await conn.query(
      'INSERT INTO ingredients (name, unit, quantity, min_quantity, cost_per_unit) VALUES (?, ?, ?, ?, ?)',
      [name, unit, quantity, minQuantity, costPerUnit]
    );
    if (quantity > 0) {
      await conn.query(
        `INSERT INTO inventory_transactions (ingredient_id, type, quantity, balance_after, unit_cost, note, created_by)
         VALUES (?, 'in', ?, ?, ?, 'ยอดยกมา', ?)`,
        [r.insertId, quantity, quantity, costPerUnit, userId]
      );
    }
    return getById(r.insertId, conn);
  });
}

/** แก้ไขข้อมูลวัตถุดิบ (ไม่รวมยอดคงเหลือ — เปลี่ยนยอดผ่าน addTransaction เท่านั้น) */
async function update(id, { name, unit, minQuantity, costPerUnit, isActive }) {
  return withTransaction(async (conn) => {
    await getById(id, conn);
    await assertNameAvailable(conn, name, id);
    await conn.query(
      'UPDATE ingredients SET name = ?, unit = ?, min_quantity = ?, cost_per_unit = ?, is_active = ? WHERE id = ?',
      [name, unit, minQuantity, costPerUnit, isActive ? 1 : 0, id]
    );
    return getById(id, conn);
  });
}

/** ลบ: มีประวัติการเคลื่อนไหว -> ปิดใช้งาน (soft delete), ไม่มี -> ลบจริง */
async function remove(id) {
  return withTransaction(async (conn) => {
    const current = await getById(id, conn);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM inventory_transactions WHERE ingredient_id = ?', [id]);
    if (n > 0) {
      if (!current.isActive) throw ApiError.badRequest('วัตถุดิบนี้ถูกปิดใช้งานแล้ว');
      await conn.query('UPDATE ingredients SET is_active = 0 WHERE id = ?', [id]);
      return { softDeleted: true };
    }
    await conn.query('DELETE FROM ingredients WHERE id = ?', [id]);
    return { softDeleted: false };
  });
}

/**
 * ทำรายการสต็อก
 *   in     : quantity = จำนวนที่รับเข้า (> 0), unitCost (ถ้ามี) อัปเดตต้นทุนล่าสุด
 *   out    : quantity = จำนวนที่เบิก (> 0) ต้องไม่เกินคงเหลือ
 *   adjust : newBalance = ยอดที่นับได้จริง (>= 0) — บันทึก quantity = |ส่วนต่าง|
 */
async function addTransaction(ingredientId, { type, quantity, newBalance, unitCost, note }, userId) {
  return withTransaction(async (conn) => {
    const [[row]] = await conn.query(
      'SELECT id, name, unit, quantity, is_active FROM ingredients WHERE id = ? FOR UPDATE',
      [ingredientId]
    );
    if (!row) throw ApiError.notFound('ไม่พบวัตถุดิบ');
    if (!row.is_active) throw ApiError.badRequest('วัตถุดิบนี้ถูกปิดใช้งานแล้ว');

    const current = toMilli(row.quantity);
    let change;
    let balance;
    if (type === 'in') {
      change = toMilli(quantity);
      balance = current + change;
    } else if (type === 'out') {
      change = toMilli(quantity);
      if (change > current) {
        throw ApiError.badRequest(`${row.name} คงเหลือไม่พอ (เหลือ ${fromMilli(current)} ${row.unit})`);
      }
      balance = current - change;
    } else {
      balance = toMilli(newBalance);
      change = Math.abs(balance - current);
      if (change === 0) throw ApiError.badRequest('ยอดที่นับได้เท่ากับยอดคงเหลือเดิม ไม่ต้องปรับยอด');
    }
    if (fromMilli(balance) > 999999999.999) throw ApiError.badRequest('ยอดคงเหลือสูงเกินไป');

    await conn.query(
      `UPDATE ingredients SET quantity = ?${type === 'in' && unitCost != null ? ', cost_per_unit = ?' : ''} WHERE id = ?`,
      type === 'in' && unitCost != null ? [fromMilli(balance), unitCost, ingredientId] : [fromMilli(balance), ingredientId]
    );
    const [r] = await conn.query(
      `INSERT INTO inventory_transactions (ingredient_id, type, quantity, balance_after, unit_cost, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ingredientId, type, fromMilli(change), fromMilli(balance), type === 'in' ? unitCost : null, note, userId]
    );

    const [[tx]] = await conn.query(`${TX_SELECT} WHERE t.id = ?`, [r.insertId]);
    return { ingredient: await getById(ingredientId, conn), transaction: toTransaction(tx) };
  });
}

const TX_SELECT = `
  SELECT t.*, i.name AS ingredient_name, i.unit, u.full_name AS created_by_name
    FROM inventory_transactions t
    JOIN ingredients i ON i.id = t.ingredient_id
    LEFT JOIN users u ON u.id = t.created_by`;

/** ประวัติการเคลื่อนไหว (ใหม่สุดก่อน) — filters: ingredientId, type, page, pageSize */
async function listTransactions({ ingredientId, type, page = 1, pageSize = 30 } = {}) {
  const where = [];
  const params = [];
  if (ingredientId) {
    where.push('t.ingredient_id = ?');
    params.push(ingredientId);
  }
  if (type) {
    where.push('t.type = ?');
    params.push(type);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM inventory_transactions t ${whereSql}`, params);
  const [rows] = await pool.query(`${TX_SELECT} ${whereSql} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    pageSize,
    (page - 1) * pageSize,
  ]);
  return {
    transactions: rows.map(toTransaction),
    pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(total / pageSize) || 1 },
  };
}

module.exports = { list, getById, create, update, remove, addTransaction, listTransactions, TYPE_LABEL };
