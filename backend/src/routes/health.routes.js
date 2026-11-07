const router = require('express').Router();
const { pool } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');

const EXPECTED_TABLES = [
  'roles', 'users', 'categories', 'menus', 'menu_options', 'order_sequences',
  'orders', 'order_items', 'order_item_options', 'payments', 'ingredients',
  'menu_ingredients', 'inventory_transactions', 'settings',
];

/**
 * GET /api/health
 * ตรวจสอบว่า API และฐานข้อมูลพร้อมใช้งาน (ไม่เปิดเผยข้อมูลธุรกิจ)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const [[info]] = await pool.query('SELECT VERSION() AS version, NOW() AS server_time');
      const [tables] = await pool.query(
        'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
      );
      const found = tables.map((t) => t.name);
      const missing = EXPECTED_TABLES.filter((t) => !found.includes(t));

      res.json({
        success: true,
        api: 'ok',
        database: {
          connected: true,
          version: info.version,
          serverTime: info.server_time,
          schemaReady: missing.length === 0,
          missingTables: missing,
        },
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        api: 'ok',
        database: { connected: false, error: err.code || err.message },
      });
    }
  })
);

module.exports = router;
