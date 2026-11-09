const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { toSatang, toBaht } = require('../utils/money');
const orderService = require('./order.service');
const settingsService = require('./settings.service');

/**
 * คำนวณส่วนลดเป็นสตางค์จากยอดรวมรายการ
 * discount: { type: 'amount' | 'percent', value } หรือ null
 */
function discountSatang(subtotalSatang, discount) {
  if (!discount || !discount.value) return 0;
  const d =
    discount.type === 'percent'
      ? Math.round((subtotalSatang * discount.value) / 100)
      : toSatang(discount.value);
  if (d > subtotalSatang) throw ApiError.badRequest('ส่วนลดต้องไม่มากกว่ายอดรวม');
  return d;
}

/**
 * รับชำระเงิน (1 ออเดอร์ชำระได้ครั้งเดียว)
 * - lock ออเดอร์ด้วย FOR UPDATE, คำนวณยอดใหม่จาก subtotal ใน DB (ไม่เชื่อยอดจาก client)
 * - อัปเดต orders (discount, total, payment_status, paid_at) และเพิ่ม payments ใน transaction เดียว
 * data: { method: 'cash'|'promptpay', receivedAmount (เงินสด), referenceNo, discount }
 */
async function pay(orderId, data, userId) {
  return withTransaction(async (conn) => {
    const [[order]] = await conn.query(
      'SELECT id, status, payment_status, subtotal FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!order) throw ApiError.notFound('ไม่พบออเดอร์');
    if (order.status === 'cancelled') throw ApiError.conflict('ออเดอร์ที่ยกเลิกแล้วไม่สามารถชำระเงินได้');
    if (order.payment_status === 'paid') throw ApiError.conflict('ออเดอร์นี้ชำระเงินแล้ว');

    const subtotal = toSatang(order.subtotal);
    const discount = discountSatang(subtotal, data.discount);
    const total = subtotal - discount;

    let received = total;
    if (data.method === 'cash') {
      if (data.receivedAmount == null) throw ApiError.badRequest('กรุณากรอกจำนวนเงินที่รับ');
      received = toSatang(data.receivedAmount);
      if (received < total) {
        throw ApiError.badRequest(`จำนวนเงินที่รับไม่พอ (ยอดชำระ ${toBaht(total).toFixed(2)} บาท)`);
      }
    }
    const change = received - total;

    const [[{ now }]] = await conn.query('SELECT NOW() AS now');
    await conn.query(
      `UPDATE orders SET discount = ?, total = ?, payment_status = 'paid', paid_at = ? WHERE id = ?`,
      [toBaht(discount), toBaht(total), now, orderId]
    );
    await conn.query(
      `INSERT INTO payments (order_id, method, amount, received_amount, change_amount, reference_no, received_by, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, data.method, toBaht(total), toBaht(received), toBaht(change), data.referenceNo, userId, now]
    );

    return orderService.getById(orderId, conn);
  });
}

/** ข้อมูลใบเสร็จ: ข้อมูลร้าน + ออเดอร์ (snapshot) + การชำระเงิน */
async function getReceipt(orderId) {
  const order = await orderService.getById(orderId);
  if (order.paymentStatus !== 'paid') throw ApiError.badRequest('ออเดอร์นี้ยังไม่ได้ชำระเงิน');
  const shop = await settingsService.getAll();
  return { shop, order };
}

module.exports = { pay, getReceipt, discountSatang };
