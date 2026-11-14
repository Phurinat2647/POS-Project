/**
 * ปรับโครงสร้างฐานข้อมูลที่มีข้อมูลอยู่แล้วให้ตรงกับ schema.sql ล่าสุด (ไม่ลบข้อมูล)
 *   npm run db:migrate
 *
 * แต่ละขั้นตรวจสอบก่อนทำ จึงรันซ้ำได้อย่างปลอดภัย
 * แนะนำให้ backup ก่อน: mysqldump -u root food_pos > backup.sql
 */
const { pool, withTransaction } = require('../src/config/database');
const { sync } = require('../src/services/menuAvailability.service');
const env = require('../src/config/env');

async function checkExists(table, name) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
    [env.db.database, table, name]
  );
  return rows.length > 0;
}

/** แทนที่ CHECK constraint เดิมด้วยตัวใหม่ (ชื่อใหม่ — ใช้ตรวจว่า migrate แล้วหรือยัง) */
async function replaceCheck(table, oldName, newName, expression) {
  if (await checkExists(table, oldName)) {
    // DROP CONSTRAINT ใช้ได้ทั้ง MariaDB 10.2+ และ MySQL 8.0.19+
    await pool.query(`ALTER TABLE \`${table}\` DROP CONSTRAINT \`${oldName}\``);
    console.log(`  - ลบ ${table}.${oldName}`);
  }
  if (!(await checkExists(table, newName))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${newName}\` CHECK (${expression})`);
    console.log(`  + เพิ่ม ${table}.${newName}`);
  }
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [env.db.database, table, column]
  );
  return rows.length > 0;
}

const MIGRATIONS = [
  {
    name: 'Phase 6: inventory_transactions.quantity >= 0',
    async run() {
      await replaceCheck('inventory_transactions', 'chk_inv_tx_qty', 'chk_inv_tx_quantity', '`quantity` >= 0');
    },
  },
  {
    name: 'ยอดวัตถุดิบห้ามติดลบ: ปรับยอดติดลบเป็น 0 แล้วเพิ่ม CHECK',
    async run() {
      if (await checkExists('ingredients', 'chk_ingredients_stock')) return;
      await withTransaction(async (conn) => {
        const [neg] = await conn.query('SELECT id, name, quantity FROM ingredients WHERE quantity < 0 FOR UPDATE');
        for (const r of neg) {
          await conn.query('UPDATE ingredients SET quantity = 0 WHERE id = ?', [r.id]);
          await conn.query(
            `INSERT INTO inventory_transactions (ingredient_id, type, quantity, balance_after, note)
             VALUES (?, 'adjust', ?, 0, 'ปรับยอดติดลบเป็น 0 (ระบบไม่ให้ยอดติดลบแล้ว)')`,
            [r.id, -r.quantity]
          );
          console.log(`  - ${r.name}: ${r.quantity} -> 0`);
        }
      });
      // ตัว CHECK เดิม (chk_ingredients_qty ก่อน Phase 6 / chk_ingredients_min_qty ใน Phase 6) แทนด้วยตัวใหม่
      await replaceCheck('ingredients', 'chk_ingredients_qty', 'chk_ingredients_stock', '`quantity` >= 0 AND `min_quantity` >= 0');
      if (await checkExists('ingredients', 'chk_ingredients_min_qty')) {
        await pool.query('ALTER TABLE `ingredients` DROP CONSTRAINT `chk_ingredients_min_qty`');
        console.log('  - ลบ ingredients.chk_ingredients_min_qty');
      }
    },
  },
  {
    name: 'เมนูหมดอัตโนมัติเมื่อวัตถุดิบไม่พอ (menus.auto_sold_out)',
    async run() {
      if (!(await columnExists('menus', 'auto_sold_out'))) {
        await pool.query('ALTER TABLE `menus` ADD COLUMN `auto_sold_out` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`');
        console.log('  + เพิ่ม menus.auto_sold_out');
      }
      const { soldOut, restored } = await sync();
      console.log(`  ตั้งเป็นหมด ${soldOut.length} เมนู, เปิดขายคืน ${restored.length} เมนู`);
    },
  },
];

(async () => {
  try {
    console.log(`> Migrating database "${env.db.database}"`);
    for (const m of MIGRATIONS) {
      console.log(`• ${m.name}`);
      await m.run();
    }
    console.log('> Done');
  } catch (err) {
    console.error('✖ Migration failed:', err.code || '', err.sqlMessage || err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
