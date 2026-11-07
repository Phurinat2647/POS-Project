const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth');
const dashboardService = require('../services/dashboard.service');

router.use(authenticate, authorize('admin', 'cashier'));

/** GET /api/dashboard/summary */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await dashboardService.getSummary() });
  })
);

module.exports = router;
