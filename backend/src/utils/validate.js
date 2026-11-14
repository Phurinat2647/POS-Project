const ApiError = require('./ApiError');
const { toSatang, toBaht } = require('./money');

/**
 * helper ตรวจสอบ input — โยน ApiError.badRequest พร้อมข้อความภาษาไทย
 * รองรับค่าจากทั้ง JSON และ multipart/form-data (ซึ่งทุกค่าเป็น string)
 */

function requiredString(value, label, max) {
  const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  if (!s) throw ApiError.badRequest(`กรุณากรอก${label}`);
  if (max && s.length > max) throw ApiError.badRequest(`${label}ต้องไม่เกิน ${max} ตัวอักษร`);
  return s;
}

function optionalString(value, label, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (max && s.length > max) throw ApiError.badRequest(`${label}ต้องไม่เกิน ${max} ตัวอักษร`);
  return s;
}

/** จำนวนเงิน (บาท) >= 0 ทศนิยมไม่เกิน 2 ตำแหน่ง — คืนค่าบาทที่ปัดผ่านสตางค์แล้ว */
function money(value, label, { max = 99999999.99 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw ApiError.badRequest(`กรุณากรอก${label}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw ApiError.badRequest(`${label}ต้องเป็นตัวเลข`);
  if (n < 0) throw ApiError.badRequest(`${label}ต้องไม่ติดลบ`);
  if (n > max) throw ApiError.badRequest(`${label}สูงเกินไป`);
  const satang = toSatang(n);
  if (Math.abs(satang - n * 100) > 1e-6) throw ApiError.badRequest(`${label}มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
  return toBaht(satang);
}

/** id จำนวนเต็มบวก */
function id(value, label = 'รหัส') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw ApiError.badRequest(`${label}ไม่ถูกต้อง`);
  return n;
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  return id(value, label);
}

function integer(value, label, { min = -2147483648, max = 2147483647, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw ApiError.badRequest(`${label}ไม่ถูกต้อง`);
  return n;
}

/** boolean จาก true/false/1/0/"true"/"false" */
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw ApiError.badRequest(`${label}ไม่ถูกต้อง`);
  return value;
}

/** ปริมาณ (เช่น วัตถุดิบ) >= 0 ทศนิยมไม่เกิน 3 ตำแหน่ง — positive: ต้องมากกว่า 0 */
function quantity(value, label, { positive = false, max = 999999999.999 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw ApiError.badRequest(`กรุณากรอก${label}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw ApiError.badRequest(`${label}ต้องเป็นตัวเลข`);
  if (n < 0 || (positive && n === 0)) throw ApiError.badRequest(`${label}ต้องมากกว่า${positive ? '' : 'หรือเท่ากับ'} 0`);
  if (n > max) throw ApiError.badRequest(`${label}สูงเกินไป`);
  const milli = Math.round(n * 1000);
  if (Math.abs(milli - n * 1000) > 1e-6) throw ApiError.badRequest(`${label}มีทศนิยมได้ไม่เกิน 3 ตำแหน่ง`);
  return milli / 1000;
}

/** วันที่รูปแบบ YYYY-MM-DD (ไม่ส่งมา -> null) */
function optionalDate(value, label = 'วันที่') {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value);
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw ApiError.badRequest(`${label}ไม่ถูกต้อง`);
  }
  return s;
}

/** รหัสผ่าน: อย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์ (ข้อจำกัดของ bcrypt — อักษรไทย 1 ตัว = 3 ไบต์) */
const MIN_PASSWORD_LENGTH = 8;
function password(value, label = 'รหัสผ่าน') {
  const s = typeof value === 'string' ? value : '';
  if (!s) throw ApiError.badRequest(`กรุณากรอก${label}`);
  if (s.length < MIN_PASSWORD_LENGTH) throw ApiError.badRequest(`${label}ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  if (Buffer.byteLength(s, 'utf8') > 72) throw ApiError.badRequest(`${label}ยาวเกินไป`);
  return s;
}

/** ชื่อผู้ใช้: a-z 0-9 . _ - ความยาว 3-50 (เก็บเป็นตัวพิมพ์เล็ก) */
function username(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!s) throw ApiError.badRequest('กรุณากรอกชื่อผู้ใช้');
  if (!/^[a-z0-9._-]{3,50}$/.test(s)) {
    throw ApiError.badRequest('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ความยาว 3-50 ตัวอักษร');
  }
  return s;
}

module.exports = { password, username, requiredString, optionalString, money, id, optionalId, integer, bool, oneOf, quantity, optionalDate };
