const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/menu.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { uploadMenuImage } = require('../config/upload');

router.use(authenticate);

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', authorize('admin'), uploadMenuImage, asyncHandler(ctrl.create));
router.put('/:id', authorize('admin'), uploadMenuImage, asyncHandler(ctrl.update));
// เปลี่ยนสถานะพร้อมขาย/หมด — แคชเชียร์และครัวทำได้ด้วย
router.patch('/:id/status', authorize('admin', 'cashier', 'kitchen'), asyncHandler(ctrl.updateStatus));
router.delete('/:id', authorize('admin'), asyncHandler(ctrl.remove));
// ต้นทุนอื่นต่อจาน (กล่อง แก๊ส แก้ว) — admin
router.patch('/:id/extra-cost', authorize('admin'), asyncHandler(ctrl.setExtraCost));
// สูตรอาหาร (ใช้ตัดสต็อกอัตโนมัติ) — admin/ครัวดูได้, admin แก้ไข
router.get('/:id/recipe', authorize('admin', 'kitchen'), asyncHandler(ctrl.getRecipe));
router.put('/:id/recipe', authorize('admin'), asyncHandler(ctrl.setRecipe));

module.exports = router;
