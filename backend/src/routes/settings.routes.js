const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const v = require('../utils/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const service = require('../services/settings.service');

/** เลข PromptPay: เบอร์มือถือ 10 หลัก (ขึ้นต้น 0), เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก */
function promptpayId(value) {
  const raw = v.optionalString(value, 'PromptPay', 30);
  if (!raw) return '';
  const digits = raw.replace(/[\s-]/g, '');
  const valid = /^\d+$/.test(digits) && ((digits.length === 10 && digits.startsWith('0')) || [13, 15].includes(digits.length));
  if (!valid) throw ApiError.badRequest('PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก, เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก');
  return digits;
}

function taxId(value) {
  const raw = v.optionalString(value, 'เลขประจำตัวผู้เสียภาษี', 20);
  if (!raw) return '';
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) throw ApiError.badRequest('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก');
  return digits;
}

router.use(authenticate);

/** GET /api/settings — ข้อมูลร้าน (ใช้กับใบเสร็จ / QR PromptPay) */
router.get(
  '/',
  authorize('admin', 'cashier'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getAll() });
  })
);

/** PUT /api/settings — admin */
router.put(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const data = await service.update({
      shopName: v.requiredString(b.shopName, 'ชื่อร้าน', 150),
      shopAddress: v.optionalString(b.shopAddress, 'ที่อยู่', 300) ?? '',
      shopPhone: v.optionalString(b.shopPhone, 'เบอร์โทร', 30) ?? '',
      taxId: taxId(b.taxId),
      promptpayId: promptpayId(b.promptpayId),
      receiptFooter: v.optionalString(b.receiptFooter, 'ข้อความท้ายใบเสร็จ', 200) ?? '',
    });
    res.json({ success: true, data, message: 'บันทึกการตั้งค่าร้านสำเร็จ' });
  })
);

module.exports = router;
