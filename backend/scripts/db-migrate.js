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
const { applyEnglishNames } = require('../database/names-en');

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
  {
    name: 'ตัวเลือกตัดสต็อก: menu_options.recipe_extra_percent + ตาราง option_ingredients',
    async run() {
      if (!(await columnExists('menu_options', 'recipe_extra_percent'))) {
        await pool.query(
          "ALTER TABLE `menu_options` ADD COLUMN `recipe_extra_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'ตัดสต็อกตามสูตรเมนูเพิ่มกี่ % เมื่อเลือกตัวเลือกนี้ (เช่น พิเศษ = 50)' AFTER `is_default`"
        );
        console.log('  + เพิ่ม menu_options.recipe_extra_percent');
      }
      if (!(await checkExists('menu_options', 'chk_menu_options_recipe_pct'))) {
        await pool.query(
          'ALTER TABLE `menu_options` ADD CONSTRAINT `chk_menu_options_recipe_pct` CHECK (`recipe_extra_percent` >= 0 AND `recipe_extra_percent` <= 500)'
        );
        console.log('  + เพิ่ม menu_options.chk_menu_options_recipe_pct');
      }
      const [t] = await pool.query(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [env.db.database, 'option_ingredients']
      );
      if (!t.length) {
        await pool.query(`CREATE TABLE \`option_ingredients\` (
          \`option_id\`     INT UNSIGNED NOT NULL,
          \`ingredient_id\` INT UNSIGNED NOT NULL,
          \`quantity\`      DECIMAL(12,3) NOT NULL COMMENT 'ปริมาณที่ใช้ต่อ 1 จาน',
          PRIMARY KEY (\`option_id\`, \`ingredient_id\`),
          KEY \`idx_oi_ingredient\` (\`ingredient_id\`),
          CONSTRAINT \`fk_oi_option\` FOREIGN KEY (\`option_id\`) REFERENCES \`menu_options\` (\`id\`)
            ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT \`fk_oi_ingredient\` FOREIGN KEY (\`ingredient_id\`) REFERENCES \`ingredients\` (\`id\`)
            ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT \`chk_oi_qty\` CHECK (\`quantity\` > 0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        console.log('  + สร้างตาราง option_ingredients (ใส่สูตรตัวเลือกมาตรฐานด้วย npm run db:recipes)');
      }
    },
  },
  {
    name: 'ชื่อภาษาอังกฤษของเมนู/ตัวเลือก (+ snapshot ในออเดอร์)',
    async run() {
      const columns = [
        ['menus', 'name_en', "VARCHAR(150) NULL COMMENT 'ชื่อภาษาอังกฤษ (แสดงเมื่อเลือกภาษา EN, ว่าง = ใช้ชื่อไทย)'", 'name'],
        ['menu_options', 'name_en', "VARCHAR(100) NULL COMMENT 'ชื่อภาษาอังกฤษ (ว่าง = ใช้ชื่อไทย)'", 'name'],
        ['order_items', 'menu_name_en', "VARCHAR(150) NULL COMMENT 'snapshot ชื่อภาษาอังกฤษ ณ เวลาสั่ง'", 'menu_name'],
        ['order_item_options', 'option_name_en', "VARCHAR(100) NULL COMMENT 'snapshot ชื่อภาษาอังกฤษ ณ เวลาสั่ง'", 'option_name'],
      ];
      for (const [table, column, def, after] of columns) {
        if (await columnExists(table, column)) continue;
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def} AFTER \`${after}\``);
        console.log(`  + เพิ่ม ${table}.${column}`);
      }
      const { menus, options } = await applyEnglishNames(pool);
      console.log(`  ใส่ชื่ออังกฤษตั้งต้น: เมนู ${menus}, ตัวเลือก ${options}`);
      // ออเดอร์เก่า: เติม snapshot ชื่ออังกฤษจากเมนู/ตัวเลือกปัจจุบัน (เฉพาะที่ยังว่าง และชื่อไทยยังตรงกัน)
      const [a] = await pool.query(
        `UPDATE order_items oi JOIN menus m ON m.id = oi.menu_id
            SET oi.menu_name_en = m.name_en
          WHERE oi.menu_name_en IS NULL AND m.name_en IS NOT NULL AND m.name = oi.menu_name`
      );
      const [b] = await pool.query(
        `UPDATE order_item_options oo JOIN menu_options o ON o.id = oo.menu_option_id
            SET oo.option_name_en = o.name_en
          WHERE oo.option_name_en IS NULL AND o.name_en IS NOT NULL AND o.name = oo.option_name`
      );
      console.log(`  เติมชื่ออังกฤษในออเดอร์เก่า: รายการอาหาร ${a.affectedRows}, ตัวเลือก ${b.affectedRows}`);
    },
  },
  {
    name: 'ต้นทุนอื่นต่อจาน (menus.extra_cost)',
    async run() {
      if (!(await columnExists('menus', 'extra_cost'))) {
        await pool.query(
          "ALTER TABLE `menus` ADD COLUMN `extra_cost` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'ต้นทุนอื่นต่อจาน (กล่อง แก๊ส แก้ว) บวกกับต้นทุนวัตถุดิบ' AFTER `price`"
        );
        await pool.query('ALTER TABLE `menus` ADD CONSTRAINT `chk_menus_extra_cost` CHECK (`extra_cost` >= 0)');
        console.log('  + เพิ่ม menus.extra_cost');
      }
    },
  },
  {
    name: 'VAT บวกเพิ่มตอนชำระ (orders.vat_rate, orders.vat_amount + settings vat_enabled/vat_rate)',
    async run() {
      if (!(await columnExists('orders', 'vat_rate'))) {
        await pool.query(
          "ALTER TABLE `orders` ADD COLUMN `vat_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'อัตรา VAT (%) ที่ใช้ตอนชำระ, 0 = ไม่คิด VAT' AFTER `discount`"
        );
        console.log('  + เพิ่ม orders.vat_rate');
      }
      if (!(await columnExists('orders', 'vat_amount'))) {
        await pool.query(
          "ALTER TABLE `orders` ADD COLUMN `vat_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'VAT ที่บวกเพิ่มจาก (subtotal - discount)' AFTER `vat_rate`"
        );
        console.log('  + เพิ่ม orders.vat_amount');
      }
      if (!(await checkExists('orders', 'chk_orders_vat'))) {
        await pool.query(
          'ALTER TABLE `orders` ADD CONSTRAINT `chk_orders_vat` CHECK (`vat_rate` >= 0 AND `vat_rate` <= 30 AND `vat_amount` >= 0)'
        );
        console.log('  + เพิ่ม orders.chk_orders_vat');
      }
      // ค่าเริ่มต้น: ปิด VAT, อัตรา 7% (ไม่ทับค่าที่ตั้งไว้แล้ว)
      const [r] = await pool.query(
        "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('vat_enabled', '0'), ('vat_rate', '7')"
      );
      if (r.affectedRows) console.log(`  + เพิ่มค่าตั้งต้น VAT ใน settings ${r.affectedRows} คีย์`);
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
