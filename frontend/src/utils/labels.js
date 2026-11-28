import { t } from '../i18n';
/** ป้ายชื่อและสีของสถานะต่าง ๆ (ใช้คู่กับคลาส badge) */

export const MENU_STATUS = {
  available: { label: t('พร้อมขาย'), className: 'bg-green-100 text-green-800' },
  sold_out: { label: t('หมด'), className: 'bg-red-100 text-red-700' },
};

export const ORDER_STATUS = {
  pending: { label: t('รอทำ'), className: 'bg-amber-100 text-amber-800' },
  preparing: { label: t('กำลังทำ'), className: 'bg-blue-100 text-blue-800' },
  completed: { label: t('เสร็จแล้ว'), className: 'bg-green-100 text-green-800' },
  delivered: { label: t('ส่งมอบแล้ว'), className: 'bg-teal-100 text-teal-800' },
  cancelled: { label: t('ยกเลิก#status'), className: 'bg-slate-200 text-slate-600' },
};

export const PAYMENT_STATUS = {
  unpaid: { label: t('ยังไม่ชำระ'), className: 'bg-red-100 text-red-700' },
  paid: { label: t('ชำระแล้ว'), className: 'bg-green-100 text-green-800' },
};

export const ORDER_TYPE = { dine_in: t('ทานที่ร้าน'), takeaway: t('กลับบ้าน') };

/**
 * ขั้นถัดไปของออเดอร์ในครัว (ตรงกับ TRANSITIONS ใน backend order.service)
 * completed -> delivered ทำที่หน้า "ส่งมอบ" (/handover) เท่านั้น — ต้องชำระเงินแล้ว (ครัวส่งมอบไม่ได้)
 */
export const ORDER_NEXT_STEP = {
  pending: { status: 'preparing', label: t('เริ่มทำ') },
  preparing: { status: 'completed', label: t('เสร็จแล้ว#action') },
};

/** ยกเลิกได้เฉพาะก่อนเสร็จและยังไม่ชำระเงิน (ครัวยกเลิกไม่ได้) */
export const canCancelOrder = (order) =>
  ['pending', 'preparing'].includes(order.status) && order.paymentStatus === 'unpaid';

export const OPTION_TYPE = {
  size: { label: t('ขนาด/แบบ'), hint: t('เลือกได้ 1 อย่าง'), className: 'bg-indigo-100 text-indigo-800' },
  topping: { label: t('ท็อปปิ้ง'), hint: t('เลือกได้หลายอย่าง'), className: 'bg-orange-100 text-orange-800' },
};

export const OPTION_SCOPE = { all: t('ทุกเมนู'), category: t('ทั้งหมวด'), menu: t('เฉพาะเมนู') };
