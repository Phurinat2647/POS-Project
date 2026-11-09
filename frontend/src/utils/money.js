/**
 * คำนวณเงินเป็นสตางค์ (integer) — ฝั่ง Frontend ใช้เพื่อแสดงยอดโดยประมาณเท่านั้น
 * ยอดจริงคำนวณที่ Backend จากราคาในฐานข้อมูล
 */
export const toSatang = (baht) => Math.round(Number(baht || 0) * 100);
export const toBaht = (satang) => Math.round(satang) / 100;
