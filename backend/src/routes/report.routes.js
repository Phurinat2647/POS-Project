const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const v = require('../utils/validate');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middlewares/auth');
const reportService = require('../services/report.service');

const MAX_DAYS = 366;

router.use(authenticate, authorize('admin'));

/** GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD (ค่าเริ่มต้น: วันนี้) */
router.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
    const from = v.optionalDate(req.query.from, 'วันที่เริ่มต้น') || today;
    const to = v.optionalDate(req.query.to, 'วันที่สิ้นสุด') || from;
    if (from > to) throw ApiError.badRequest('วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด');
    if (reportService.eachDay(from, to).length > MAX_DAYS) {
      throw ApiError.badRequest(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_DAYS} วัน`);
    }
    res.json({ success: true, data: await reportService.getSalesReport({ from, to }) });
  })
);

module.exports = router;
