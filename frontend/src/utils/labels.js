/** ป้ายชื่อและสีของสถานะต่าง ๆ (ใช้คู่กับคลาส badge) */

export const MENU_STATUS = {
  available: { label: 'พร้อมขาย', className: 'bg-green-100 text-green-800' },
  sold_out: { label: 'หมด', className: 'bg-red-100 text-red-700' },
};

export const ORDER_STATUS = {
  pending: { label: 'รอทำ', className: 'bg-amber-100 text-amber-800' },
  preparing: { label: 'กำลังทำ', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'เสร็จแล้ว', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'ยกเลิก', className: 'bg-slate-200 text-slate-600' },
};

export const PAYMENT_STATUS = {
  unpaid: { label: 'ยังไม่ชำระ', className: 'bg-red-100 text-red-700' },
  paid: { label: 'ชำระแล้ว', className: 'bg-green-100 text-green-800' },
};

export const ORDER_TYPE = { dine_in: 'ทานที่ร้าน', takeaway: 'กลับบ้าน' };

/** ขั้นถัดไปของออเดอร์ในครัว (ตรงกับ TRANSITIONS ใน backend order.service) */
export const ORDER_NEXT_STEP = {
  pending: { status: 'preparing', label: 'เริ่มทำ' },
  preparing: { status: 'completed', label: 'เสร็จแล้ว' },
};

/** ยกเลิกได้เฉพาะก่อนเสร็จและยังไม่ชำระเงิน (ครัวยกเลิกไม่ได้) */
export const canCancelOrder = (order) =>
  ['pending', 'preparing'].includes(order.status) && order.paymentStatus === 'unpaid';

export const OPTION_TYPE = {
  size: { label: 'ขนาด', hint: 'เลือกได้ 1 อย่าง', className: 'bg-indigo-100 text-indigo-800' },
  topping: { label: 'ท็อปปิ้ง', hint: 'เลือกได้หลายอย่าง', className: 'bg-orange-100 text-orange-800' },
};

export const OPTION_SCOPE = { all: 'ทุกเมนู', category: 'ทั้งหมวด', menu: 'เฉพาะเมนู' };
