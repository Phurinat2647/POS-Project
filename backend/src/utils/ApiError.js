/** Error ที่มี HTTP status code สำหรับส่งกลับไปยัง client */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(msg = 'ข้อมูลไม่ถูกต้อง', details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'กรุณาเข้าสู่ระบบ') { return new ApiError(401, msg); }
  static forbidden(msg = 'ไม่มีสิทธิ์เข้าถึง') { return new ApiError(403, msg); }
  static notFound(msg = 'ไม่พบข้อมูล') { return new ApiError(404, msg); }
  static conflict(msg = 'ข้อมูลซ้ำหรือขัดแย้งกับข้อมูลที่มีอยู่') { return new ApiError(409, msg); }
}

module.exports = ApiError;
