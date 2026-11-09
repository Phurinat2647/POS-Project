const ApiError = require('../utils/ApiError');
const v = require('../utils/validate');
const service = require('../services/order.service');
const { emitEvent } = require('../config/socket');

const ORDER_TYPES = ['dine_in', 'takeaway'];
const STATUSES = ['pending', 'preparing', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid'];

const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;
const MAX_OPTIONS = 20;

/**
 * รับจาก client เฉพาะ menuId, optionIds, quantity, note — ราคาคำนวณใน service จาก DB
 */
function parseItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw ApiError.badRequest('กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ');
  if (items.length > MAX_ITEMS) throw ApiError.badRequest(`สั่งได้ไม่เกิน ${MAX_ITEMS} รายการต่อออเดอร์`);

  return items.map((raw, i) => {
    const label = `รายการที่ ${i + 1}`;
    if (!raw || typeof raw !== 'object') throw ApiError.badRequest(`${label}ไม่ถูกต้อง`);
    const optionIds = raw.optionIds ?? [];
    if (!Array.isArray(optionIds)) throw ApiError.badRequest(`${label}: ตัวเลือกไม่ถูกต้อง`);
    if (optionIds.length > MAX_OPTIONS) throw ApiError.badRequest(`${label}: เลือกตัวเลือกมากเกินไป`);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw ApiError.badRequest(`${label}: จำนวนต้องเป็นจำนวนเต็ม 1-${MAX_QUANTITY}`);
    }
    return {
      menuId: v.id(raw.menuId, `${label}: เมนู`),
      quantity,
      optionIds: [...new Set(optionIds.map((o) => v.id(o, `${label}: ตัวเลือก`)))],
      note: v.optionalString(raw.note, `${label}: หมายเหตุ`, 255),
    };
  });
}

function parseCreate(body = {}) {
  const orderType = v.oneOf(body.orderType || 'dine_in', ORDER_TYPES, 'ประเภทออเดอร์');
  return {
    orderType,
    tableNo: orderType === 'dine_in' ? v.optionalString(body.tableNo, 'เลขโต๊ะ', 20) : null,
    note: v.optionalString(body.note, 'หมายเหตุ', 500),
    items: parseItems(body.items),
  };
}

/** ?status=pending,preparing */
function parseStatuses(value) {
  if (!value) return null;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => v.oneOf(s, STATUSES, 'สถานะ'));
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw ApiError.badRequest('วันที่ไม่ถูกต้อง');
  return s;
}

async function list(req, res) {
  const q = req.query;
  const data = await service.list({
    statuses: parseStatuses(q.status),
    paymentStatus: q.paymentStatus ? v.oneOf(q.paymentStatus, PAYMENT_STATUSES, 'สถานะการชำระเงิน') : null,
    date: parseDate(q.date),
    search: v.optionalString(q.search, 'คำค้นหา', 50),
    page: v.integer(q.page, 'หน้า', { min: 1, max: 100000, fallback: 1 }),
    pageSize: v.integer(q.pageSize, 'จำนวนต่อหน้า', { min: 1, max: 100, fallback: 20 }),
  });
  res.json({ success: true, data });
}

async function kitchenQueue(req, res) {
  const data = await service.listKitchenQueue();
  res.json({ success: true, data });
}

async function getOne(req, res) {
  const data = await service.getById(v.id(req.params.id));
  res.json({ success: true, data });
}

async function create(req, res) {
  const order = await service.create(parseCreate(req.body), req.user.id);
  emitEvent('order:created', { order });
  res.status(201).json({ success: true, data: order, message: `สร้างออเดอร์ ${order.orderNo} สำเร็จ` });
}

const STATUS_MESSAGE = {
  preparing: 'เริ่มทำออเดอร์แล้ว',
  completed: 'ออเดอร์เสร็จแล้ว',
  cancelled: 'ยกเลิกออเดอร์แล้ว',
};

async function updateStatus(req, res) {
  const status = v.oneOf(req.body?.status, Object.keys(STATUS_MESSAGE), 'สถานะ');
  const order = await service.updateStatus(v.id(req.params.id), status, req.user);
  emitEvent('order:updated', { order });
  res.json({ success: true, data: order, message: `${STATUS_MESSAGE[status]} (${order.orderNo})` });
}

module.exports = { list, kitchenQueue, getOne, create, updateStatus };
