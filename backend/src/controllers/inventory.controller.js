const v = require('../utils/validate');
const service = require('../services/inventory.service');

const TYPES = ['in', 'out', 'adjust'];

function parseIngredient(body = {}, { withQuantity }) {
  const data = {
    name: v.requiredString(body.name, 'ชื่อวัตถุดิบ', 150),
    unit: v.requiredString(body.unit, 'หน่วยนับ', 20),
    minQuantity: v.quantity(body.minQuantity ?? 0, 'จำนวนขั้นต่ำ'),
    costPerUnit:
      body.costPerUnit === undefined || body.costPerUnit === null || body.costPerUnit === ''
        ? null
        : v.money(body.costPerUnit, 'ต้นทุนต่อหน่วย', { max: 99999999.99 }),
    isActive: v.bool(body.isActive, true),
  };
  if (withQuantity) data.quantity = v.quantity(body.quantity ?? 0, 'ยอดคงเหลือเริ่มต้น');
  return data;
}

async function list(req, res) {
  const q = req.query;
  const data = await service.list({
    search: v.optionalString(q.search, 'คำค้นหา', 100),
    lowOnly: v.bool(q.lowOnly),
    includeInactive: req.user.role === 'admin' && v.bool(q.includeInactive),
  });
  res.json({ success: true, data });
}

async function getOne(req, res) {
  res.json({ success: true, data: await service.getById(v.id(req.params.id)) });
}

async function create(req, res) {
  const data = await service.create(parseIngredient(req.body, { withQuantity: true }), req.user.id);
  res.status(201).json({ success: true, data, message: 'เพิ่มวัตถุดิบสำเร็จ' });
}

async function update(req, res) {
  const data = await service.update(v.id(req.params.id), parseIngredient(req.body, { withQuantity: false }));
  res.json({ success: true, data, message: 'บันทึกวัตถุดิบสำเร็จ' });
}

async function remove(req, res) {
  const { softDeleted } = await service.remove(v.id(req.params.id));
  res.json({
    success: true,
    data: { softDeleted },
    message: softDeleted ? 'ปิดใช้งานวัตถุดิบแล้ว (เก็บประวัติไว้)' : 'ลบวัตถุดิบสำเร็จ',
  });
}

async function addTransaction(req, res) {
  const b = req.body || {};
  const type = v.oneOf(b.type, TYPES, 'ประเภทรายการ');
  const data = {
    type,
    quantity: type === 'adjust' ? null : v.quantity(b.quantity, 'จำนวน', { positive: true }),
    newBalance: type === 'adjust' ? v.quantity(b.newBalance, 'ยอดที่นับได้') : null,
    unitCost:
      type === 'in' && b.unitCost !== undefined && b.unitCost !== null && b.unitCost !== ''
        ? v.money(b.unitCost, 'ต้นทุนต่อหน่วย', { max: 99999999.99 })
        : null,
    note: v.optionalString(b.note, 'หมายเหตุ', 255),
  };
  const result = await service.addTransaction(v.id(req.params.id), data, req.user.id);
  res.status(201).json({
    success: true,
    data: result,
    message: `${service.TYPE_LABEL[type]}สำเร็จ — คงเหลือ ${result.ingredient.quantity} ${result.ingredient.unit}`,
  });
}

async function listTransactions(req, res) {
  const q = req.query;
  const data = await service.listTransactions({
    ingredientId: v.optionalId(q.ingredientId, 'วัตถุดิบ'),
    type: q.type ? v.oneOf(q.type, TYPES, 'ประเภทรายการ') : null,
    page: v.integer(q.page, 'หน้า', { min: 1, max: 100000, fallback: 1 }),
    pageSize: v.integer(q.pageSize, 'จำนวนต่อหน้า', { min: 1, max: 100, fallback: 30 }),
  });
  res.json({ success: true, data });
}

module.exports = { list, getOne, create, update, remove, addTransaction, listTransactions };
