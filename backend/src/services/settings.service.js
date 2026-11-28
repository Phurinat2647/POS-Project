const { pool } = require('../config/database');

/** คีย์ใน settings ที่อนุญาต (camelCase ฝั่ง API -> setting_key ใน DB) */
const KEYS = {
  shopName: 'shop_name',
  shopAddress: 'shop_address',
  shopPhone: 'shop_phone',
  taxId: 'tax_id',
  promptpayId: 'promptpay_id',
  receiptFooter: 'receipt_footer',
  vatEnabled: 'vat_enabled',
  vatRate: 'vat_rate',
};

const DEFAULT_VAT_RATE = 7;

/** แปลงค่าที่เก็บเป็นข้อความใน DB ให้เป็นชนิดที่ใช้งาน (คีย์อื่นเป็นข้อความ) */
const PARSE = {
  vatEnabled: (s) => s === '1',
  vatRate: (s) => {
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : DEFAULT_VAT_RATE;
  },
};

/** แปลงค่าจาก API เป็นข้อความก่อนเก็บ */
const SERIALIZE = {
  vatEnabled: (v) => (v ? '1' : '0'),
  vatRate: (v) => String(v),
};

async function getAll(conn = pool) {
  const [rows] = await conn.query('SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?)', [
    Object.values(KEYS),
  ]);
  const byKey = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return Object.fromEntries(
    Object.entries(KEYS).map(([k, dbKey]) => {
      const raw = byKey.get(dbKey) ?? '';
      return [k, PARSE[k] ? PARSE[k](raw) : raw];
    })
  );
}

/** data: object ที่มีเฉพาะคีย์ใน KEYS (ผ่าน validate แล้ว) */
async function update(data) {
  const entries = Object.entries(data).filter(([k, value]) => KEYS[k] && value !== undefined);
  if (entries.length) {
    await pool.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ?
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [entries.map(([k, value]) => [KEYS[k], SERIALIZE[k] ? SERIALIZE[k](value) : value ?? ''])]
    );
  }
  return getAll();
}

module.exports = { getAll, update, KEYS, DEFAULT_VAT_RATE };
