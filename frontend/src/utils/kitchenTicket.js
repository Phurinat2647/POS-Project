/**
 * พิมพ์ใบสั่งครัว (80x80 มม.) โดยไม่ต้องเปิดแท็บใหม่
 * โหลดหน้า /orders/:id/kitchen-ticket?print=1 ใน iframe ที่ซ่อนไว้ — หน้านั้นสั่ง window.print() เอง
 * หน้าต่างพิมพ์จึงขึ้นทับหน้าปัจจุบัน (POS/ครัว/ออเดอร์) แล้วลบ iframe ทิ้งเมื่อพิมพ์/ยกเลิกเสร็จ
 */
const AUTO_KEY = 'food_pos_auto_kitchen_ticket';
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;

export function printKitchenTicket(orderId) {
  const frame = document.createElement('iframe');
  frame.title = 'ใบสั่งครัว';
  frame.setAttribute('aria-hidden', 'true');
  // ต้องมีขนาดจริงให้จัดหน้าได้ แต่อยู่นอกจอ (display:none จะพิมพ์ไม่ได้)
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '80mm', height: '80mm', border: '0' });

  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    frame.remove();
  };
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 100), { once: true });
    } catch {
      /* ไม่ควรเกิด (origin เดียวกัน) — ใช้ timeout ลบแทน */
    }
  });
  timer = setTimeout(cleanup, FRAME_TIMEOUT_MS);
  frame.src = `/orders/${orderId}/kitchen-ticket?print=1`;
  document.body.appendChild(frame);
}

/** ตั้งค่า "พิมพ์ใบสั่งครัวอัตโนมัติเมื่อส่งออเดอร์" ของเครื่องนี้ (ค่าเริ่มต้น: เปิด) */
export function loadAutoKitchenTicket() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveAutoKitchenTicket(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    /* storage ไม่พร้อมใช้งาน — ใช้ค่าเฉพาะครั้งนี้ */
  }
}
