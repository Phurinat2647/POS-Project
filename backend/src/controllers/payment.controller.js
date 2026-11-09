const ApiError = require('../utils/ApiError');
const v = require('../utils/validate');
const service = require('../services/payment.service');
const { emitEvent } = require('../config/socket');

const METHODS = ['cash', 'promptpay'];
const DISCOUNT_TYPES = ['amount', 'percent'];

function parseDiscount(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'object') throw ApiError.badRequest('ส่วนลดไม่ถูกต้อง');
  const type = v.oneOf(raw.type || 'amount', DISCOUNT_TYPES, 'ประเภทส่วนลด');
  const value = type === 'percent' ? v.money(raw.value ?? 0, 'ส่วนลด (%)', { max: 100 }) : v.money(raw.value ?? 0, 'ส่วนลด');
  return value > 0 ? { type, value } : null;
}

/** รับจาก client: วิธีชำระ, เงินที่รับ, ส่วนลด — ยอดที่ต้องชำระคำนวณใหม่ใน service */
function parsePayment(body = {}) {
  const method = v.oneOf(body.method, METHODS, 'วิธีชำระเงิน');
  return {
    method,
    discount: parseDiscount(body.discount),
    receivedAmount: method === 'cash' ? v.money(body.receivedAmount, 'จำนวนเงินที่รับ', { max: 9999999.99 }) : null,
    referenceNo: method === 'promptpay' ? v.optionalString(body.referenceNo, 'เลขอ้างอิง', 100) : null,
  };
}

async function pay(req, res) {
  const order = await service.pay(v.id(req.params.id), parsePayment(req.body), req.user.id);
  emitEvent('order:updated', { order });
  const change = order.payment.changeAmount;
  res.status(201).json({
    success: true,
    data: order,
    message: change > 0 ? `ชำระเงินสำเร็จ เงินทอน ${change.toFixed(2)} บาท` : 'ชำระเงินสำเร็จ',
  });
}

async function receipt(req, res) {
  res.json({ success: true, data: await service.getReceipt(v.id(req.params.id)) });
}

module.exports = { pay, receipt };
