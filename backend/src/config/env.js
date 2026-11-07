const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'food_pos',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    timezone: process.env.DB_TIMEZONE || '+07:00',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  bcryptRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  upload: {
    dir: path.resolve(__dirname, '../..', process.env.UPLOAD_DIR || 'uploads'),
    maxBytes: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
  },
};

if (!env.jwt.secret || env.jwt.secret.length < 16) {
  // ไม่ยอมให้รันด้วย secret ที่ว่างหรือสั้นเกินไป
  console.error('[config] JWT_SECRET ต้องกำหนดใน .env และยาวอย่างน้อย 16 ตัวอักษร');
  process.exit(1);
}
if (env.nodeEnv === 'production' && env.jwt.secret.startsWith('change_this')) {
  console.error('[config] กรุณาเปลี่ยน JWT_SECRET ก่อนรันในโหมด production');
  process.exit(1);
}

module.exports = env;
