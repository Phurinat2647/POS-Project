// โหลด pool เมื่อใช้จริง — scripts/db-setup.js ส่ง connection ของตัวเองมา (ไม่ต้องโหลด config ของเซิร์ฟเวอร์)
const defaultConn = () => require('../config/database').pool;

/**
 * สถานะ "หมด" อัตโนมัติตามวัตถุดิบ
 * - เมนูที่วัตถุดิบ (ที่เปิดใช้งาน) ในสูตรเหลือไม่พอทำอีก 1 จาน -> sold_out + auto_sold_out = 1
 * - เมนูที่ระบบตั้งเป็นหมดเอง (auto_sold_out = 1) เมื่อวัตถุดิบกลับมาพอ -> available
 * - เมนูที่ผู้ใช้ตั้งเป็นหมดเอง (auto_sold_out = 0) ระบบไม่เปิดขายคืนให้
 *
 * เรียก sync() หลัง commit การเปลี่ยนยอดวัตถุดิบ/สูตรทุกครั้ง (ออเดอร์, ยกเลิก, รับเข้า/เบิก/ปรับยอด, แก้วัตถุดิบ, แก้สูตร)
 * — อ่านข้อมูลล่าสุดหลัง commit จึงไม่ถือ lock ของ menus ไว้ใน transaction ของออเดอร์
 */

/** วัตถุดิบในสูตรที่เหลือไม่พอทำ 1 จาน: [{ name, unit, required, available }] */
async function shortIngredients(menuId, conn = defaultConn()) {
  const [rows] = await conn.query(
    `SELECT i.name, i.unit, mi.quantity AS required, i.quantity AS available
       FROM menu_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id
      WHERE mi.menu_id = ? AND i.is_active = 1 AND i.quantity < mi.quantity
      ORDER BY i.name`,
    [menuId]
  );
  return rows;
}

const SHORT_EXISTS = `EXISTS (
  SELECT 1 FROM menu_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id
   WHERE mi.menu_id = m.id AND i.is_active = 1 AND i.quantity < mi.quantity)`;

/** ปรับสถานะเมนูตามยอดวัตถุดิบ — คืน { soldOut: [menuId], restored: [menuId] } */
async function sync(conn = defaultConn()) {
  const [toSoldOut] = await conn.query(
    `SELECT m.id FROM menus m WHERE m.is_active = 1 AND m.status = 'available' AND ${SHORT_EXISTS}`
  );
  const [toRestore] = await conn.query(
    `SELECT m.id FROM menus m
      WHERE m.is_active = 1 AND m.status = 'sold_out' AND m.auto_sold_out = 1 AND NOT ${SHORT_EXISTS}`
  );
  const soldOut = toSoldOut.map((r) => r.id);
  const restored = toRestore.map((r) => r.id);
  if (soldOut.length) {
    await conn.query(
      `UPDATE menus m SET m.status = 'sold_out', m.auto_sold_out = 1
        WHERE m.id IN (?) AND m.status = 'available' AND ${SHORT_EXISTS}`,
      [soldOut]
    );
  }
  if (restored.length) {
    await conn.query(
      `UPDATE menus m SET m.status = 'available', m.auto_sold_out = 0
        WHERE m.id IN (?) AND m.auto_sold_out = 1 AND NOT ${SHORT_EXISTS}`,
      [restored]
    );
  }
  return { soldOut, restored };
}

/**
 * sync() แล้วแจ้งหน้า POS ผ่าน socket (menu:updated) — ใช้ใน controller หลัง service ทำงานสำเร็จ
 * ผิดพลาดจะไม่ทำให้ request ล้มเหลว (สถานะจะถูกแก้ในการ sync ครั้งถัดไป)
 */
async function syncAndNotify() {
  try {
    const result = await sync();
    const ids = [...result.soldOut, ...result.restored];
    if (ids.length) {
      const menuService = require('./menu.service');
      const { emitEvent } = require('../config/socket');
      for (const id of ids) emitEvent('menu:updated', { menu: await menuService.getById(id) });
    }
    return result;
  } catch (err) {
    console.error('[menu-availability] sync failed', err);
    return { soldOut: [], restored: [] };
  }
}

module.exports = { shortIngredients, sync, syncAndNotify };
