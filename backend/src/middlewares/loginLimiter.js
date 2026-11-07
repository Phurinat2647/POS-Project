const ApiError = require('../utils/ApiError');

/**
 * จำกัดจำนวนการเข้าสู่ระบบผิดพลาด (in-memory, เพียงพอสำหรับเซิร์ฟเวอร์เครื่องเดียวในร้าน)
 * ผิดครบ MAX_FAILS ครั้งภายใน WINDOW_MS ต่อ IP+username จะถูกล็อกจนหมดช่วงเวลา
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const attempts = new Map(); // key -> { count, resetAt }

const keyOf = (req) => `${req.ip}|${String(req.body?.username || '').trim().toLowerCase()}`;

function loginLimiter(req, res, next) {
  const key = keyOf(req);
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && entry.resetAt <= now) attempts.delete(key);
  else if (entry && entry.count >= MAX_FAILS) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    return next(new ApiError(429, `เข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก ${minutes} นาที`));
  }

  // นับเมื่อ login ล้มเหลว (401) และล้างเมื่อสำเร็จ
  res.on('finish', () => {
    if (res.statusCode === 401) {
      const cur = attempts.get(key);
      if (cur && cur.resetAt > Date.now()) cur.count += 1;
      else attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    } else if (res.statusCode < 400) {
      attempts.delete(key);
    }
  });
  next();
}

// ล้างรายการที่หมดอายุเป็นระยะ ป้องกัน Map โตไม่จำกัด
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
}, WINDOW_MS).unref();

module.exports = loginLimiter;
