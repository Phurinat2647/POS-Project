const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');
const authService = require('../services/auth.service');

/**
 * ตรวจสอบ JWT จาก header `Authorization: Bearer <token>`
 * และโหลดผู้ใช้จาก DB ทุกครั้ง (ผู้ใช้ที่ถูกปิดหรือเปลี่ยน role จะมีผลทันที)
 * ผลลัพธ์: req.user = { id, username, fullName, role, ... }
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('กรุณาเข้าสู่ระบบ');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError'
        ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
        : 'Token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่'
    );
  }

  const user = await authService.findActiveUserById(Number(payload.sub));
  if (!user) throw ApiError.unauthorized('บัญชีนี้ไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่');

  req.user = user;
  next();
});

/**
 * จำกัดสิทธิ์ตาม role — ใช้หลัง authenticate
 *   router.get('/', authenticate, authorize('admin', 'cashier'), handler)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden('คุณไม่มีสิทธิ์ใช้งานส่วนนี้'));
    next();
  };
}

module.exports = { authenticate, authorize };
