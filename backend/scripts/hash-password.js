/**
 * สร้าง bcrypt hash สำหรับรหัสผ่าน (ใช้กรณีต้องการเพิ่ม/รีเซ็ตรหัสผ่านผ่าน SQL โดยตรง)
 *   npm run hash -- <password>
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash -- <password>');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, Number(process.env.BCRYPT_SALT_ROUNDS) || 10));
