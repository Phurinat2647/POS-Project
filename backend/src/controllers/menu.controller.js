const v = require('../utils/validate');
const service = require('../services/menu.service');
const { menuImageUrl, removeMenuImage } = require('../config/upload');

const STATUSES = ['available', 'sold_out'];

/** body มาจาก multipart/form-data (ค่าเป็น string) หรือ JSON */
function parseBody(body = {}) {
  return {
    categoryId: v.id(body.categoryId, 'หมวดหมู่'),
    name: v.requiredString(body.name, 'ชื่อเมนู', 150),
    description: v.optionalString(body.description, 'คำอธิบาย', 500),
    price: v.money(body.price, 'ราคา'),
    status: v.oneOf(body.status || 'available', STATUSES, 'สถานะ'),
  };
}

/** ถ้าบันทึกไม่สำเร็จ ให้ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง */
async function withUploadedFile(req, work) {
  const uploadedUrl = req.file ? menuImageUrl(req.file.filename) : null;
  try {
    return await work(uploadedUrl);
  } catch (err) {
    if (uploadedUrl) removeMenuImage(uploadedUrl);
    throw err;
  }
}

async function list(req, res) {
  const includeInactive = req.user.role === 'admin' && v.bool(req.query.includeInactive);
  const data = await service.list({
    categoryId: v.optionalId(req.query.categoryId, 'หมวดหมู่'),
    status: req.query.status ? v.oneOf(req.query.status, STATUSES, 'สถานะ') : null,
    search: v.optionalString(req.query.search, 'คำค้นหา', 100),
    includeInactive,
  });
  res.json({ success: true, data });
}

async function getOne(req, res) {
  const data = await service.getById(v.id(req.params.id), {
    withOptions: true,
    includeInactive: req.user.role === 'admin',
  });
  res.json({ success: true, data });
}

async function create(req, res) {
  const data = await withUploadedFile(req, (imageUrl) => service.create({ ...parseBody(req.body), imageUrl }));
  res.status(201).json({ success: true, data, message: 'เพิ่มเมนูสำเร็จ' });
}

async function update(req, res) {
  const id = v.id(req.params.id);
  const data = await withUploadedFile(req, (newUrl) =>
    service.update(id, parseBody(req.body), { newUrl, remove: v.bool(req.body?.removeImage) })
  );
  res.json({ success: true, data, message: 'บันทึกเมนูสำเร็จ' });
}

async function updateStatus(req, res) {
  const status = v.oneOf(req.body?.status, STATUSES, 'สถานะ');
  const data = await service.updateStatus(v.id(req.params.id), status);
  res.json({ success: true, data, message: status === 'available' ? 'เปิดขายเมนูแล้ว' : 'ตั้งเป็นเมนูหมดแล้ว' });
}

async function remove(req, res) {
  const { softDeleted } = await service.remove(v.id(req.params.id));
  res.json({
    success: true,
    data: { softDeleted },
    message: softDeleted ? 'ลบเมนูแล้ว (เก็บไว้เป็นประวัติการขาย)' : 'ลบเมนูสำเร็จ',
  });
}

module.exports = { list, getOne, create, update, updateStatus, remove };
