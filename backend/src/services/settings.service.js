const { pool } = require('../config/database');

/** คีย์ใน settings ที่อนุญาต (camelCase ฝั่ง API -> setting_key ใน DB) */
const KEYS = {
  shopName: 'shop_name',
  shopAddress: 'shop_address',
  shopPhone: 'shop_phone',
  taxId: 'tax_id',
  promptpayId: 'promptpay_id',
  receiptFooter: 'receipt_footer',
};

async function getAll(conn = pool) {
  const [rows] = await conn.query('SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?)', [
    Object.values(KEYS),
  ]);
  const byKey = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return Object.fromEntries(Object.entries(KEYS).map(([k, dbKey]) => [k, byKey.get(dbKey) ?? '']));
}

/** data: object ที่มีเฉพาะคีย์ใน KEYS (ผ่าน validate แล้ว) */
async function update(data) {
  const entries = Object.entries(data).filter(([k]) => KEYS[k]);
  if (entries.length) {
    await pool.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ?
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [entries.map(([k, value]) => [KEYS[k], value ?? ''])]
    );
  }
  return getAll();
}

module.exports = { getAll, update, KEYS };
