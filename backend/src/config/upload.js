const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('./env');
const ApiError = require('../utils/ApiError');

const MENU_DIR = path.join(env.upload.dir, 'menus');
fs.mkdirSync(MENU_DIR, { recursive: true });

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** อัปโหลดรูปเมนู (field: image) — jpg/png/webp, ขนาดตาม MAX_UPLOAD_MB */
const menuImageUpload = multer({
  storage: multer.diskStorage({
    destination: MENU_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: env.upload.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(ApiError.badRequest('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP'));
  },
}).single('image');

/** ห่อ multer ให้ error ขนาดไฟล์เป็นข้อความภาษาไทย */
function uploadMenuImage(req, res, next) {
  menuImageUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `ไฟล์รูปภาพต้องมีขนาดไม่เกิน ${Math.round(env.upload.maxBytes / 1024 / 1024)} MB`
          : 'อัปโหลดไฟล์ไม่สำเร็จ';
      return next(ApiError.badRequest(msg));
    }
    next(err);
  });
}

/** URL สาธารณะของไฟล์ที่อัปโหลด */
const menuImageUrl = (filename) => `/uploads/menus/${filename}`;

/** ลบไฟล์รูปเมนูจาก URL (เฉพาะไฟล์ใน uploads/menus — ไม่ throw) */
function removeMenuImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/menus/')) return;
  const file = path.join(MENU_DIR, path.basename(imageUrl));
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { uploadMenuImage, menuImageUrl, removeMenuImage };
