const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middlewares/auth');

// คลังวัตถุดิบ: ดู/รับเข้า/เบิกออก/ปรับยอด — admin, kitchen | เพิ่ม/แก้ไข/ลบวัตถุดิบ — admin
router.use(authenticate, authorize('admin', 'kitchen'));

router.get('/', asyncHandler(ctrl.list));
router.get('/transactions', asyncHandler(ctrl.listTransactions)); // ต้องอยู่ก่อน /:id
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', authorize('admin'), asyncHandler(ctrl.create));
router.put('/:id', authorize('admin'), asyncHandler(ctrl.update));
router.delete('/:id', authorize('admin'), asyncHandler(ctrl.remove));
router.post('/:id/transactions', asyncHandler(ctrl.addTransaction));

module.exports = router;
