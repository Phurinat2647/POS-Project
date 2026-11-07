const ApiError = require('../utils/ApiError');
const env = require('../config/env');

function notFound(req, res, next) {
  next(new ApiError(404, `ไม่พบ API: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'เกิดข้อผิดพลาดภายในระบบ';
  const details = err.details;

  // แปลง error จาก MySQL / body-parser ให้เป็นข้อความที่เข้าใจง่าย
  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'ข้อมูลนี้มีอยู่ในระบบแล้ว';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    status = 409;
    message = 'ไม่สามารถลบได้ เนื่องจากข้อมูลนี้ถูกใช้งานอยู่';
  } else if (err.errno === 3819 || err.errno === 4025) {
    // CHECK constraint ล้มเหลว (MySQL 3819 / MariaDB 4025)
    status = 400;
    message = 'ข้อมูลไม่ผ่านเงื่อนไขที่กำหนด (เช่น ราคาหรือจำนวนติดลบ)';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'ข้อมูลอ้างอิงไม่ถูกต้อง';
  } else if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    status = 503;
    message = 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'รูปแบบ JSON ไม่ถูกต้อง';
  }

  if (status >= 500) {
    console.error('[error]', err);
    if (env.nodeEnv === 'production') message = 'เกิดข้อผิดพลาดภายในระบบ';
  }

  res.status(status).json({ success: false, message, ...(details ? { details } : {}) });
}

module.exports = { notFound, errorHandler };
