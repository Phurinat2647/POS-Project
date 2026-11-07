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

module.exports = router;
