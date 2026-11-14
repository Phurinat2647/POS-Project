const v = require('../utils/validate');
const service = require('../services/user.service');

const ROLES = ['admin', 'cashier', 'kitchen'];

function parseProfile(body = {}) {
  return {
    fullName: v.requiredString(body.fullName, 'ชื่อ-นามสกุล', 150),
    phone: v.optionalString(body.phone, 'เบอร์โทร', 20),
    role: v.oneOf(body.role, ROLES, 'ตำแหน่ง'),
  };
}

async function roles(req, res) {
  res.json({ success: true, data: await service.listRoles() });
}

async function list(req, res) {
  res.json({ success: true, data: await service.list() });
}

async function create(req, res) {
  const b = req.body || {};
  const data = await service.create({
    ...parseProfile(b),
    username: v.username(b.username),
    password: v.password(b.password),
  });
  res.status(201).json({ success: true, data, message: `เพิ่มผู้ใช้ ${data.username} สำเร็จ` });
}

async function update(req, res) {
  const data = await service.update(
    v.id(req.params.id),
    { ...parseProfile(req.body), isActive: v.bool(req.body?.isActive, true) },
    req.user
  );
  res.json({ success: true, data, message: 'บันทึกข้อมูลผู้ใช้สำเร็จ' });
}

async function resetPassword(req, res) {
  await service.resetPassword(v.id(req.params.id), v.password(req.body?.password, 'รหัสผ่านใหม่'), req.user);
  res.json({ success: true, data: null, message: 'ตั้งรหัสผ่านใหม่สำเร็จ' });
}

async function remove(req, res) {
  const { softDeleted } = await service.remove(v.id(req.params.id), req.user);
  res.json({
    success: true,
    data: { softDeleted },
    message: softDeleted ? 'ปิดใช้งานผู้ใช้แล้ว (มีประวัติการใช้งาน)' : 'ลบผู้ใช้สำเร็จ',
  });
}

module.exports = { roles, list, create, update, resetPassword, remove };
