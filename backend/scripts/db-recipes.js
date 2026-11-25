/**
 * ใส่สูตรอาหารมาตรฐาน (database/recipes.js) ให้ฐานข้อมูล
 *   npm run db:recipes              -> เพิ่มวัตถุดิบที่ยังไม่มี (คงเหลือ 0) + ใส่สูตรเฉพาะเมนูที่ยังไม่มีสูตร
 *   npm run db:recipes -- --replace -> แทนที่สูตรของทุกเมนูที่ชื่อตรงกับ recipes.js (สูตรที่แก้เองจะหาย)
 *
 * - จับคู่เมนูและวัตถุดิบด้วยชื่อ — เมนูที่เปลี่ยนชื่อ/ลบไปแล้วจะถูกข้ามและแสดงในรายงาน
 * - ไม่แก้ไขวัตถุดิบที่มีอยู่แล้ว (หน่วย ยอดคงเหลือ ต้นทุน คงเดิม)
 * - ทำใน transaction เดียว — ผิดพลาดจะไม่มีอะไรเปลี่ยน
 */
const { INGREDIENTS, RECIPES, OPTION_RECIPES } = require('../database/recipes');

const toMilli = (v) => Math.round(Number(v) * 1000);

function validateData() {
  const names = new Set(INGREDIENTS.map(([name]) => name));
  for (const [opt, { extraPercent, items }] of Object.entries(OPTION_RECIPES)) {
    if (!(extraPercent >= 0 && extraPercent <= 500)) throw new Error(`recipes.js: extraPercent ของตัวเลือก "${opt}" ต้องอยู่ระหว่าง 0-500`);
    for (const ing of Object.keys(items)) {
      if (!names.has(ing)) throw new Error(`recipes.js: วัตถุดิบ "${ing}" ของตัวเลือก "${opt}" ไม่อยู่ใน INGREDIENTS`);
    }
  }
  for (const [menu, items] of [...Object.entries(RECIPES), ...Object.entries(OPTION_RECIPES).map(([k, o]) => [k, o.items])]) {
    for (const [ing, qty] of Object.entries(items)) {
      if (!names.has(ing)) throw new Error(`recipes.js: วัตถุดิบ "${ing}" ของเมนู "${menu}" ไม่อยู่ใน INGREDIENTS`);
      if (!(qty > 0) || Math.abs(toMilli(qty) - qty * 1000) > 1e-6) {
        throw new Error(`recipes.js: ปริมาณ ${qty} ของ "${ing}" ในเมนู "${menu}" ต้อง > 0 และทศนิยมไม่เกิน 3 ตำแหน่ง`);
      }
    }
  }
}

/**
 * conn: connection ที่เลือกฐานข้อมูลแล้ว (ไม่เริ่ม transaction เอง — ผู้เรียกจัดการ)
 * options.replace   : แทนที่สูตรเดิมของเมนูที่ชื่อตรง
 * options.withStock : วัตถุดิบที่สร้างใหม่ใช้ยอดตัวอย่าง (ติดตั้งใหม่เท่านั้น) และบันทึกเป็น "ยอดยกมา"
 */
async function applyRecipes(conn, { replace = false, withStock = false } = {}) {
  validateData();
  const report = { createdIngredients: [], filled: [], skippedHasRecipe: [], missingMenus: [], options: [], skippedOptions: [] };

  // 1) วัตถุดิบที่ยังไม่มี
  const [existing] = await conn.query('SELECT id, name FROM ingredients');
  const ingId = new Map(existing.map((r) => [r.name, r.id]));
  const needed = new Set([...Object.values(RECIPES), ...Object.values(OPTION_RECIPES).map((o) => o.items)].flatMap((items) => Object.keys(items)));
  for (const [name, unit, minQty, cost, demoStock] of INGREDIENTS) {
    if (ingId.has(name) || !needed.has(name)) continue;
    const qty = withStock ? demoStock : 0;
    const [r] = await conn.query(
      'INSERT INTO ingredients (name, unit, quantity, min_quantity, cost_per_unit) VALUES (?, ?, ?, ?, ?)',
      [name, unit, qty, minQty, cost]
    );
    if (qty > 0) {
      await conn.query(
        `INSERT INTO inventory_transactions (ingredient_id, type, quantity, balance_after, unit_cost, note)
         VALUES (?, 'in', ?, ?, ?, 'ยอดยกมาเริ่มต้นระบบ')`,
        [r.insertId, qty, qty, cost]
      );
    }
    ingId.set(name, r.insertId);
    report.createdIngredients.push(`${name} (${unit})`);
  }

  // 2) สูตรของแต่ละเมนู (จับคู่ด้วยชื่อ เฉพาะเมนูที่ยังใช้งาน)
  const [menus] = await conn.query(
    `SELECT m.id, m.name, (SELECT COUNT(*) FROM menu_ingredients mi WHERE mi.menu_id = m.id) AS n
       FROM menus m WHERE m.is_active = 1`
  );
  const menuByName = new Map(menus.map((m) => [m.name, m]));
  for (const [menuName, items] of Object.entries(RECIPES)) {
    const menu = menuByName.get(menuName);
    if (!menu) {
      report.missingMenus.push(menuName);
      continue;
    }
    if (Number(menu.n) > 0 && !replace) {
      report.skippedHasRecipe.push(menuName);
      continue;
    }
    await conn.query('DELETE FROM menu_ingredients WHERE menu_id = ?', [menu.id]);
    await conn.query('INSERT INTO menu_ingredients (menu_id, ingredient_id, quantity) VALUES ?', [
      Object.entries(items).map(([ing, qty]) => [menu.id, ingId.get(ing), qty]),
    ]);
    report.filled.push(`${menuName} (${Object.keys(items).length})`);
  }

  // 3) สูตรของตัวเลือก (จับคู่ด้วยชื่อ — ทุกตัวเลือกที่ชื่อตรง) ข้ามตัวที่ตั้งค่าไว้แล้วถ้าไม่ใช่ --replace
  const [options] = await conn.query(
    `SELECT o.id, o.name, o.recipe_extra_percent,
            (SELECT COUNT(*) FROM option_ingredients oi WHERE oi.option_id = o.id) AS n
       FROM menu_options o`
  );
  for (const opt of options) {
    const def = OPTION_RECIPES[opt.name];
    if (!def) continue;
    if ((Number(opt.n) > 0 || Number(opt.recipe_extra_percent) > 0) && !replace) {
      report.skippedOptions.push(opt.name);
      continue;
    }
    await conn.query('UPDATE menu_options SET recipe_extra_percent = ? WHERE id = ?', [def.extraPercent, opt.id]);
    await conn.query('DELETE FROM option_ingredients WHERE option_id = ?', [opt.id]);
    const entries = Object.entries(def.items);
    if (entries.length) {
      await conn.query('INSERT INTO option_ingredients (option_id, ingredient_id, quantity) VALUES ?', [
        entries.map(([ing, qty]) => [opt.id, ingId.get(ing), qty]),
      ]);
    }
    report.options.push(opt.name);
  }
  return report;
}

function printReport(report) {
  console.log(`  วัตถุดิบที่เพิ่มใหม่ ${report.createdIngredients.length} รายการ${report.createdIngredients.length ? `: ${report.createdIngredients.join(', ')}` : ''}`);
  console.log(`  ใส่สูตรแล้ว ${report.filled.length} เมนู${report.filled.length ? `: ${report.filled.join(', ')}` : ''}`);
  if (report.skippedHasRecipe.length) {
    console.log(`  ข้าม (มีสูตรอยู่แล้ว — ใช้ --replace เพื่อแทนที่) ${report.skippedHasRecipe.length} เมนู: ${report.skippedHasRecipe.join(', ')}`);
  }
  const count = (arr) => Object.entries(arr.reduce((m, n) => ({ ...m, [n]: (m[n] || 0) + 1 }), {})).map(([n, c]) => `${n} x${c}`).join(', ');
  console.log(`  ใส่สูตรตัวเลือกแล้ว ${report.options.length} รายการ${report.options.length ? `: ${count(report.options)}` : ''}`);
  if (report.skippedOptions.length) console.log(`  ข้ามตัวเลือกที่ตั้งค่าไว้แล้ว: ${count(report.skippedOptions)}`);
  if (report.missingMenus.length) console.log(`  ไม่พบเมนูชื่อนี้ในระบบ: ${report.missingMenus.join(', ')}`);
}

module.exports = { applyRecipes, printReport };

if (require.main === module) {
  const { withTransaction, pool } = require('../src/config/database');
  const env = require('../src/config/env');
  const replace = process.argv.includes('--replace');
  (async () => {
    try {
      console.log(`> ใส่สูตรอาหารมาตรฐานใน "${env.db.database}"${replace ? ' (แทนที่สูตรเดิม)' : ''}`);
      const report = await withTransaction((conn) => applyRecipes(conn, { replace }));
      printReport(report);
      const { soldOut, restored } = await require('../src/services/menuAvailability.service').sync();
      if (soldOut.length || restored.length) console.log(`  สถานะเมนูตามวัตถุดิบ: หมด ${soldOut.length} เมนู, เปิดขายคืน ${restored.length} เมนู`);
      if (report.createdIngredients.length) {
        console.log('  ⚠️ วัตถุดิบที่เพิ่มใหม่มียอดคงเหลือ 0 — เมนูที่ใช้จะเป็น "หมด" จนกว่าจะ "รับเข้า" หรือ "ปรับยอด" ในหน้าคลังวัตถุดิบ');
      }
      console.log('> Done');
    } catch (err) {
      console.error('✖ ใส่สูตรไม่สำเร็จ:', err.sqlMessage || err.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
