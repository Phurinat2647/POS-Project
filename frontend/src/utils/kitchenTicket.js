import { t } from '../i18n';
import { printInFrame } from './printFrame';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from './boxLabels';

/**
 * งานพิมพ์ของออเดอร์ผ่าน iframe ซ่อน (utils/printFrame.js) — เข้าคิวพิมพ์ทีละงาน
 * - ใบสั่งครัว 80x80 มม.            /orders/:id/kitchen-ticket?print=1
 * - สติ๊กเกอร์กล่อง 60x40 มม. + บาร์โค้ด  /orders/:id/labels?print=1
 * - ใบเสร็จ 57 มม. (เฉพาะใบเสร็จ)      /orders/:id/receipt?print=1&only=receipt
 */
const AUTO_KEY = 'food_pos_auto_kitchen_ticket';
const AUTO_LABELS_KEY = 'food_pos_auto_box_labels';

export function printKitchenTicket(orderId) {
  printInFrame(`/orders/${orderId}/kitchen-ticket?print=1`, { title: t('ใบสั่งครัว') });
}

export function printBoxLabels(orderId) {
  printInFrame(`/orders/${orderId}/labels?print=1`, {
    title: t('สติ๊กเกอร์กล่อง'),
    width: `${LABEL_WIDTH_MM}mm`,
    height: `${LABEL_HEIGHT_MM}mm`,
  });
}

export function printReceiptOnly(orderId) {
  printInFrame(`/orders/${orderId}/receipt?print=1&only=receipt`, { title: t('ใบเสร็จ'), width: '57mm', height: '200mm' });
}

function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage ไม่พร้อมใช้งาน — ใช้ค่าเฉพาะครั้งนี้ */
  }
}

/** ตั้งค่า "พิมพ์ใบสั่งครัวอัตโนมัติเมื่อส่งออเดอร์" ของเครื่องนี้ (ค่าเริ่มต้น: เปิด) */
export const loadAutoKitchenTicket = () => readFlag(AUTO_KEY, true);
export const saveAutoKitchenTicket = (on) => writeFlag(AUTO_KEY, on);

/** ตั้งค่า "พิมพ์สติ๊กเกอร์อัตโนมัติเมื่อมีออเดอร์ใหม่" ของเครื่องนี้ (ค่าเริ่มต้น: ปิด — เปิดเฉพาะเครื่องที่ต่อเครื่องพิมพ์สติ๊กเกอร์) */
export const loadAutoBoxLabels = () => readFlag(AUTO_LABELS_KEY, false);
export const saveAutoBoxLabels = (on) => writeFlag(AUTO_LABELS_KEY, on);
