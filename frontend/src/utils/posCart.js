/**
 * จำตะกร้าหน้า POS ไว้ใน sessionStorage
 * - เปลี่ยนหน้า / refresh แล้วกลับมา ตะกร้ายังอยู่
 * - ปิดแท็บ -> หายเอง (sessionStorage), ออกจากระบบ -> clearPosCart()
 * - ผูกกับผู้ใช้ — ถ้าคนอื่นเข้าระบบในแท็บเดิมจะไม่เห็นตะกร้าของคนก่อน
 * ราคาในตะกร้าเป็นแค่ประมาณการ Backend คำนวณใหม่จาก DB ตอนส่งออเดอร์เสมอ
 */
const KEY = 'food_pos_cart';

export function loadPosCart(userId) {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!data || data.userId !== userId || !Array.isArray(data.lines) || typeof data.form !== 'object') return null;
    return { lines: data.lines, form: data.form };
  } catch {
    return null;
  }
}

export function savePosCart(userId, { lines, form }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ userId, lines, form }));
  } catch {
    /* storage ไม่พร้อมใช้งาน — ตะกร้าจะอยู่แค่ในหน้านี้ */
  }
}

export function clearPosCart() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage ไม่พร้อมใช้งาน */
  }
}
