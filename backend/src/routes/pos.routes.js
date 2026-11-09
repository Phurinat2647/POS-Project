const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth');
const posService = require('../services/pos.service');

router.use(authenticate, authorize('admin', 'cashier'));

/** GET /api/pos/catalog — หมวดหมู่ + เมนู + ตัวเลือก สำหรับหน้าขาย */
router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await posService.getCatalog() });
  })
);

module.exports = router;
