const ApiError = require('../utils/ApiError');
const v = require('../utils/validate');
const service = require('../services/menuOption.service');

const TYPES = ['size', 'topping'];
const SCOPES = ['all', 'category', 'menu'];

function parseBody(body = {}) {
  const scope = v.oneOf(body.scope, SCOPES, 'ขอบเขตการใช้งาน');
  const data = {
    optionType: v.oneOf(body.optionType, TYPES, 'ประเภทตัวเลือก'),
    name: v.requiredString(body.name, 'ชื่อตัวเลือก', 100),
    extraPrice: v.money(body.extraPrice ?? 0, 'ราคาเพิ่ม', { max: 99999.99 }),
    isDefault: v.bool(body.isDefault),
    sortOrder: v.integer(body.sortOrder, 'ลำดับ', { min: 0, max: 9999, fallback: 0 }),
    isActive: v.bool(body.isActive, true),
    menuId: null,
    categoryId: null,
  };
  if (scope === 'menu') data.menuId = v.id(body.menuId, 'เมนู');
  if (scope === 'category') data.categoryId = v.id(body.categoryId, 'หมวดหมู่');
  if (data.isDefault && data.optionType !== 'size') {
    throw ApiError.badRequest('ค่าเริ่มต้นใช้ได้เฉพาะตัวเลือกประเภทขนาด');
  }
  return data;
}

async function list(req, res) {
  const q = req.query;
  const data = await service.list({
    scope: q.scope ? v.oneOf(q.scope, SCOPES, 'ขอบเขต') : null,
    categoryId: v.optionalId(q.categoryId, 'หมวดหมู่'),
    menuId: v.optionalId(q.menuId, 'เมนู'),
    optionType: q.optionType ? v.oneOf(q.optionType, TYPES, 'ประเภท') : null,
  });
  res.json({ success: true, data });
}

async function create(req, res) {
  const data = await service.create(parseBody(req.body));
  res.status(201).json({ success: true, data, message: 'เพิ่มตัวเลือกสำเร็จ' });
}

async function update(req, res) {
  const data = await service.update(v.id(req.params.id), parseBody(req.body));
  res.json({ success: true, data, message: 'บันทึกตัวเลือกสำเร็จ' });
}

async function remove(req, res) {
  await service.remove(v.id(req.params.id));
  res.json({ success: true, data: null, message: 'ลบตัวเลือกสำเร็จ' });
}

module.exports = { list, create, update, remove };
