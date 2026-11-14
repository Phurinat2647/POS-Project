const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middlewares/auth');

// จัดการผู้ใช้ — admin เท่านั้น
router.use(authenticate, authorize('admin'));

router.get('/roles', asyncHandler(ctrl.roles)); // ต้องอยู่ก่อน /:id
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.put('/:id/password', asyncHandler(ctrl.resetPassword));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
