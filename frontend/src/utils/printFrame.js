/**
 * พิมพ์หน้าในระบบโดยไม่ต้องเปิดแท็บใหม่: โหลด url (ที่มี ?print=1 — หน้านั้นสั่ง window.print() เอง) ใน iframe ที่ซ่อนไว้
 * หน้าต่างพิมพ์จึงขึ้นทับหน้าปัจจุบัน แล้วลบ iframe ทิ้งเมื่อพิมพ์/ยกเลิกเสร็จ
 * งานพิมพ์เข้าคิวทีละงาน — ออเดอร์เข้าพร้อมกันหลายใบจะพิมพ์ต่อกันตามลำดับ ไม่ซ้อนกัน
 * (เปิด Chrome ด้วย --kiosk-printing จะพิมพ์ลงเครื่องพิมพ์ค่าเริ่มต้นทันทีโดยไม่มีหน้าต่างพิมพ์)
 */
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const queue = [];
let busy = false;

function runNext() {
  if (busy || queue.length === 0) return;
  busy = true;
  const { url, title, width, height } = queue.shift();

  const frame = document.createElement('iframe');
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  // ต้องมีขนาดจริงให้จัดหน้าได้ แต่อยู่นอกจอ (display:none จะพิมพ์ไม่ได้)
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width, height, border: '0' });

  let timer;
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    frame.remove();
    busy = false;
    runNext();
  };
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 100), { once: true });
    } catch {
      /* ไม่ควรเกิด (origin เดียวกัน) — ใช้ timeout ลบแทน */
    }
  });
  timer = setTimeout(cleanup, FRAME_TIMEOUT_MS);
  frame.src = url;
  document.body.appendChild(frame);
}

export function printInFrame(url, { title = 'print', width = '80mm', height = '80mm' } = {}) {
  queue.push({ url, title, width, height });
  runNext();
}
