import en, { patterns } from './en';

/**
 * แปลภาษา TH / EN แบบเบา (ไม่ใช้ไลบรารี)
 * - ข้อความภาษาไทยในโค้ดคือ key: t('ยกเลิก') -> 'Cancel' เมื่อเลือก EN (ไม่มีคำแปล -> แสดงภาษาไทยเดิม)
 * - ตัวแปรในข้อความ: t('ลบ "{0}"?', [name]) หรือ t('เหลือ {n}', { n })
 * - คำไทยเดียวกันแต่ความหมายต่างกัน ใส่บริบทต่อท้ายด้วย # เช่น t('ยกเลิก#status') -> TH "ยกเลิก", EN "Cancelled"
 * - เปลี่ยนภาษา = บันทึกลง localStorage แล้วโหลดหน้าใหม่ — ค่าคงที่ระดับไฟล์ (เช่น labels.js) จึงได้ภาษาที่ถูกต้องด้วย
 *   (ตะกร้า POS อยู่ใน sessionStorage และ token อยู่ใน localStorage จึงไม่หาย)
 * - ข้อมูลที่ผู้ใช้กรอก (ชื่อเมนู หมวดหมู่ วัตถุดิบ หน่วย ชื่อร้าน) ไม่ถูกแปล
 */

const STORAGE_KEY = 'food_pos_lang';
export const LANGUAGES = [
  { code: 'th', label: 'TH', name: 'ไทย' },
  { code: 'en', label: 'EN', name: 'English' },
];

function readLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'th';
  } catch {
    return 'th';
  }
}

const lang = readLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** ภาษาปัจจุบัน: 'th' | 'en' */
export const getLang = () => lang;

/** locale สำหรับ Intl / toLocaleString */
export const getLocale = () => (lang === 'en' ? 'en-GB' : 'th-TH');

export function setLang(next) {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next === 'en' ? 'en' : 'th');
  } catch {
    // บันทึกไม่ได้ (private mode) — เปลี่ยนได้เฉพาะรอบนี้ไม่ได้เพราะต้องโหลดใหม่ จึงไม่ทำอะไร
    return;
  }
  window.location.reload();
}

const missing = new Set();

/** แปลข้อความ (key = ข้อความภาษาไทย) แล้วแทนค่า {0} / {name} */
export function t(text, vars) {
  if (text == null) return text;
  const hash = text.indexOf('#');
  let out = hash > 0 ? text.slice(0, hash) : text;
  if (lang === 'en') {
    const hit = en[text] ?? (hash > 0 ? en[out] : undefined);
    if (hit !== undefined) out = hit;
    else if (import.meta.env.DEV && /[฀-๿]/.test(text) && !missing.has(text)) {
      missing.add(text);
      console.warn('[i18n] missing EN:', text);
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
  return out;
}

/**
 * แปลข้อความจาก API (backend ตอบเป็นภาษาไทย)
 * ตรงทั้งข้อความ -> ใช้คำแปล, ไม่ตรง -> ลองรูปแบบที่มีตัวแปร (en.patterns), ไม่เจอ -> แสดงตามเดิม
 */
export function tApi(message) {
  if (!message || lang !== 'en') return message;
  if (en[message] !== undefined) return en[message];
  for (const [re, fn] of PATTERNS) {
    const m = message.match(re);
    if (m) return fn(...m.slice(1));
  }
  return message;
}

const PATTERNS = patterns;

/**
 * ชื่อจากข้อมูล (เมนู/ตัวเลือก) ตามภาษาที่เลือก — EN ใช้ `${field}En` ถ้ามี ไม่มีใช้ชื่อไทย
 * เช่น localName(menu) -> menu.nameEn | menu.name, localName(orderItem, 'menuName') -> menuNameEn | menuName
 */
export function localName(obj, field = 'name') {
  if (!obj) return '';
  return (lang === 'en' && obj[`${field}En`]) || obj[field];
}
