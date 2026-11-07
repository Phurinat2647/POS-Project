const v = require('../utils/validate');
const service = require('../services/category.service');

function parseBody(body = {}) {
  return {
    name: v.requiredString(body.name, 'ชื่อหมวดหมู่', 100),
    description: v.optionalString(body.description, 'คำอธิบาย', 255),
    sortOrder: v.integer(body.sortOrder, 'ลำดับการแสดงผล', { min: 0, max: 9999, fallback: 0 }),
    isActive: v.bool(body.isActive, true),
  };
}

async function list(req, res) {
  // หมวดที่ปิดใช้งานแสดงเฉพาะ admin
  const includeInactive = req.user.role === 'admin' && v.bool(req.query.includeInactive);
  res.json({ success: true, data: await service.list({ includeInactive }) });
}

async function create(req, res) {
  const data = await service.create(parseBody(req.body));
  res.status(201).json({ success: true, data, message: 'เพิ่มหมวดหมู่สำเร็จ' });
}

async function update(req, res) {
  const data = await service.update(v.id(req.params.id), parseBody(req.body));
  res.json({ success: true, data, message: 'บันทึกหมวดหมู่สำเร็จ' });
}

async function remove(req, res) {
  const { softDeleted } = await service.remove(v.id(req.params.id));
  res.json({
    success: true,
    data: { softDeleted },
    message: softDeleted ? 'ปิดใช้งานหมวดหมู่แล้ว (มีประวัติเมนูที่ถูกลบอ้างอิงอยู่)' : 'ลบหมวดหมู่สำเร็จ',
  });
}

module.exports = { list, create, update, remove };
