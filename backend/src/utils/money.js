/**
 * คำนวณเงินด้วยหน่วยสตางค์ (integer) เพื่อหลีกเลี่ยงปัญหาทศนิยมของ floating point
 */
const toSatang = (baht) => Math.round(Number(baht) * 100);
const toBaht = (satang) => Math.round(satang) / 100;

module.exports = { toSatang, toBaht };
