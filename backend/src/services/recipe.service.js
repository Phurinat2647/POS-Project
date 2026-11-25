const { pool, withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');

/**
 * สูตรอาหาร (menu_ingredients): วัตถุดิบและปริมาณที่ใช้ต่อ 1 จาน
 * ใช้ตัดสต็อกอัตโนมัติเมื่อสร้างออเดอร์ (inventory.service.deductForOrder)
 */

const toRecipeItem = (r) => ({
  ingredientId: r.ingredient_id,
  name: r.name,
  unit: r.unit,
  quantity: r.quantity,
  stock: r.stock,
  isActive: !!r.is_active,
});

async function assertMenu(conn, menuId) {
  const [[menu]] = await conn.query('SELECT id, is_active FROM menus WHERE id = ?', [menuId]);
  if (!menu) throw ApiError.notFound('ไม่พบเมนู');
  return menu;
}

async function getRecipe(menuId, conn = pool) {
  await assertMenu(conn, menuId);
  const [rows] = await conn.query(
    `SELECT mi.ingredient_id, mi.quantity, i.name, i.unit, i.quantity AS stock, i.is_active
       FROM menu_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id
      WHERE mi.menu_id = ?
      ORDER BY i.name`,
    [menuId]
  );
  return rows.map(toRecipeItem);
}

/**
 * แปลงรายการที่พิมพ์ชื่อวัตถุดิบใหม่ ({ name, unit }) เป็น ingredientId (ภายใน transaction เดียวกับการบันทึกสูตร)
 * - ชื่อตรงกับวัตถุดิบที่เปิดใช้งาน -> ใช้ตัวเดิม
 * - ชื่อตรงกับวัตถุดิบที่ปิดใช้งาน -> แจ้ง error (ให้เปิดใช้งานที่หน้าคลังก่อน)
 * - ไม่มี -> สร้างใหม่ ยอดคงเหลือ 0 (รับเข้าที่หน้าคลังภายหลัง)
 */
async function resolveNewIngredients(conn, items) {
  const created = new Map(); // ชื่อ (ตัวพิมพ์เล็ก) -> id ที่สร้างในคำขอนี้
  const result = [];
  for (const item of items) {
    if (item.ingredientId) {
      result.push(item);
      continue;
    }
    const key = item.name.toLowerCase();
    let id = created.get(key);
    if (!id) {
      // collation utf8mb4_unicode_ci เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่
      const [[existing]] = await conn.query('SELECT id, name, is_active FROM ingredients WHERE name = ? FOR UPDATE', [item.name]);
      if (existing && !existing.is_active) {
        throw ApiError.badRequest(`วัตถุดิบ "${existing.name}" ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าคลังวัตถุดิบก่อน`);
      }
      if (existing) id = existing.id;
      else {
        const [r] = await conn.query('INSERT INTO ingredients (name, unit, quantity, min_quantity) VALUES (?, ?, 0, 0)', [
          item.name,
          item.unit,
        ]);
        id = r.insertId;
      }
      created.set(key, id);
    }
    result.push({ ingredientId: id, quantity: item.quantity });
  }
  return result;
}

/** แปลงวัตถุดิบใหม่ + ตรวจว่าไม่ซ้ำ มีอยู่จริง และเปิดใช้งาน -> [{ ingredientId, quantity }] */
async function resolveAndValidate(conn, rawItems) {
  const items = await resolveNewIngredients(conn, rawItems);
  if (new Set(items.map((i) => i.ingredientId)).size !== items.length) {
    throw ApiError.badRequest('มีวัตถุดิบซ้ำกันในสูตร');
  }
  if (items.length) {
    const ids = items.map((i) => i.ingredientId);
    const [rows] = await conn.query('SELECT id, name, is_active FROM ingredients WHERE id IN (?)', [ids]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const ing = byId.get(id);
      if (!ing) throw ApiError.badRequest('ไม่พบวัตถุดิบที่เลือก');
      if (!ing.is_active) throw ApiError.badRequest(`วัตถุดิบ "${ing.name}" ถูกปิดใช้งานแล้ว`);
    }
  }
  return items;
}

// ---------------------------------------------------------------------
// สูตรของตัวเลือก (เช่น ไข่ดาว / พิเศษ) — ตัดสต็อกพร้อมสูตรเมนู (inventory.service.lineUsage)
//   extraPercent : เพิ่มปริมาณตามสูตรของเมนูที่สั่งกี่ % (menu_options.recipe_extra_percent)
//   items        : วัตถุดิบที่ใช้เพิ่มต่อ 1 จาน (option_ingredients)
// ---------------------------------------------------------------------

async function assertOption(conn, optionId, lock = false) {
  const [[opt]] = await conn.query(
    `SELECT id, name, recipe_extra_percent FROM menu_options WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
    [optionId]
  );
  if (!opt) throw ApiError.notFound('ไม่พบตัวเลือก');
  return opt;
}

async function getOptionRecipe(optionId, conn = pool) {
  const opt = await assertOption(conn, optionId);
  const [rows] = await conn.query(
    `SELECT oi.ingredient_id, oi.quantity, i.name, i.unit, i.quantity AS stock, i.is_active
       FROM option_ingredients oi JOIN ingredients i ON i.id = oi.ingredient_id
      WHERE oi.option_id = ?
      ORDER BY i.name`,
    [optionId]
  );
  return { extraPercent: opt.recipe_extra_percent, items: rows.map(toRecipeItem) };
}

async function setOptionRecipe(optionId, { extraPercent, items: rawItems }) {
  return withTransaction(async (conn) => {
    await assertOption(conn, optionId, true);
    const items = await resolveAndValidate(conn, rawItems);
    await conn.query('UPDATE menu_options SET recipe_extra_percent = ? WHERE id = ?', [extraPercent, optionId]);
    await conn.query('DELETE FROM option_ingredients WHERE option_id = ?', [optionId]);
    if (items.length) {
      await conn.query('INSERT INTO option_ingredients (option_id, ingredient_id, quantity) VALUES ?', [
        items.map((i) => [optionId, i.ingredientId, i.quantity]),
      ]);
    }
    return getOptionRecipe(optionId, conn);
  });
}

/**
 * แทนที่สูตรทั้งหมดของเมนู
 * items: [{ ingredientId, quantity }] หรือ [{ name, unit, quantity }] (วัตถุดิบใหม่ที่พิมพ์เอง)
 * วัตถุดิบต้องมีอยู่และเปิดใช้งาน และห้ามซ้ำกันในสูตร
 */
async function setRecipe(menuId, rawItems) {
  return withTransaction(async (conn) => {
    const menu = await assertMenu(conn, menuId);
    if (!menu.is_active) throw ApiError.badRequest('เมนูนี้ถูกลบแล้ว');

    const items = await resolveAndValidate(conn, rawItems);
    await conn.query('DELETE FROM menu_ingredients WHERE menu_id = ?', [menuId]);
    if (items.length) {
      await conn.query('INSERT INTO menu_ingredients (menu_id, ingredient_id, quantity) VALUES ?', [
        items.map((i) => [menuId, i.ingredientId, i.quantity]),
      ]);
    }
    return getRecipe(menuId, conn);
  });
}

module.exports = { getRecipe, setRecipe, getOptionRecipe, setOptionRecipe };
