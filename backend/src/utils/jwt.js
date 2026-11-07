const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'food-pos';

/** สร้าง access token — payload เก็บเฉพาะ id ผู้ใช้ (role ตรวจจาก DB ทุกครั้ง) */
function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: ISSUER,
    algorithm: 'HS256',
  });
}

/** ตรวจสอบ token — โยน error ของ jsonwebtoken ถ้าไม่ถูกต้อง/หมดอายุ */
function verifyToken(token) {
  return jwt.verify(token, env.jwt.secret, { issuer: ISSUER, algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };
