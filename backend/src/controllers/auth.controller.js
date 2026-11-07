const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');

const MIN_PASSWORD_LENGTH = 8;

const str = (v) => (typeof v === 'string' ? v : '');

/** POST /api/auth/login  { username, password } */
async function login(req, res) {
  const username = str(req.body?.username).trim();
  const password = str(req.body?.password);
  if (!username || !password) throw ApiError.badRequest('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  const data = await authService.login(username, password);
  res.json({ success: true, data, message: 'เข้าสู่ระบบสำเร็จ' });
}

/** GET /api/auth/me */
async function me(req, res) {
  res.json({ success: true, data: req.user });
}

/** PUT /api/auth/change-password  { currentPassword, newPassword } */
async function changePassword(req, res) {
  const currentPassword = str(req.body?.currentPassword);
  const newPassword = str(req.body?.newPassword);

  if (!currentPassword || !newPassword) throw ApiError.badRequest('กรุณากรอกรหัสผ่านให้ครบถ้วน');
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }
  // bcrypt ใช้ได้สูงสุด 72 ไบต์ (อักษรไทย 1 ตัว = 3 ไบต์)
  if (Buffer.byteLength(newPassword, 'utf8') > 72) throw ApiError.badRequest('รหัสผ่านใหม่ยาวเกินไป');
  if (newPassword === currentPassword) throw ApiError.badRequest('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');

  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ success: true, data: null, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
}

module.exports = { login, me, changePassword };
