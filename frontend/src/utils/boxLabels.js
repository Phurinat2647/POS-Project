/**
 * สติ๊กเกอร์กล่อง: 1 ดวงต่อ 1 กล่อง (2 × ข้าวกะเพรา = 2 ดวง) เลขกล่องนับต่อกันทั้งออเดอร์
 * บาร์โค้ด (Code128) = "<เลขออเดอร์>-<ลำดับกล่อง>" เช่น 20261128-0001-2 — ตรงกับ parseBoxCode ใน backend order.service
 */

export const LABEL_WIDTH_MM = 60;
export const LABEL_HEIGHT_MM = 40;

/** รายการสติ๊กเกอร์ของออเดอร์: [{ key, item, no, total }] */
export function buildBoxLabels(items) {
  const total = items.reduce((sum, i) => sum + i.quantity, 0);
  const labels = [];
  for (const item of items) {
    for (let n = 0; n < item.quantity; n += 1) {
      labels.push({ key: `${item.id}-${n}`, item, no: labels.length + 1, total });
    }
  }
  return labels;
}

export const boxCode = (orderNo, no) => `${orderNo}-${no}`;

/**
 * เครื่องสแกนแบบคีย์บอร์ดส่งรหัสปุ่ม — ถ้าเครื่องเปิดแป้นไทยอยู่ ตัวเลขจะกลายเป็นอักษรไทย (ปุ่ม 1 = "ๅ", ปุ่ม - = "ข")
 * แปลงกลับเป็นปุ่มของแป้นอังกฤษ (แป้นเกษมณี แถวตัวเลขแบบไม่กด Shift)
 */
const THAI_KEYS = { 'ๅ': '1', '/': '2', '-': '3', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0', 'ข': '-' };

export function normalizeScan(raw) {
  const s = String(raw ?? '').trim();
  if (!/[฀-๿]/.test(s)) return s;
  return [...s].map((c) => THAI_KEYS[c] ?? c).join('');
}

/** ตรวจรูปแบบฝั่ง client ก่อนเรียก API: { orderNo, box } หรือ null */
export function parseBoxCode(code) {
  const m = /^(\d{8}-\d{4})(?:-(\d{1,3}))?$/.exec(normalizeScan(code));
  return m ? { orderNo: m[1], box: m[2] ? Number(m[2]) : null } : null;
}
