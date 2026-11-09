const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth');

router.use(authenticate);

// คิวครัว (ต้องอยู่ก่อน /:id)
router.get('/kitchen', authorize('admin', 'cashier', 'kitchen'), asyncHandler(ctrl.kitchenQueue));

router.get('/', authorize('admin', 'cashier'), asyncHandler(ctrl.list));
router.get('/:id', authorize('admin', 'cashier', 'kitchen'), asyncHandler(ctrl.getOne));
router.post('/', authorize('admin', 'cashier'), asyncHandler(ctrl.create));
// ครัวเปลี่ยนเป็น preparing/completed ได้ — การยกเลิกตรวจสิทธิ์เพิ่มใน service
router.patch('/:id/status', authorize('admin', 'cashier', 'kitchen'), asyncHandler(ctrl.updateStatus));

module.exports = router;
