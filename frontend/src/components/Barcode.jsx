import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * บาร์โค้ดแท่ง Code128 เป็น SVG
 * กำหนดความกว้างแท่งเล็กสุดเป็น มม. (moduleMm) ให้ตรงจุดของเครื่องพิมพ์ความร้อน 203 dpi (1 จุด = 0.125 มม.)
 * ค่าเริ่มต้น 0.25 มม. = 2 จุด — เครื่องสแกนทั่วไปอ่านได้, ขอบว่างซ้ายขวา 10 แท่งตามมาตรฐาน
 */
export default function Barcode({ value, heightMm = 8, moduleMm = 0.25, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    try {
      JsBarcode(svg, value, { format: 'CODE128', width: 1, height: 100, margin: 10, displayValue: false });
      const modules = parseFloat(svg.getAttribute('width')) || 0; // JsBarcode ใส่เป็น "205px"
      svg.setAttribute('viewBox', `0 0 ${modules} 100`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = `${modules * moduleMm}mm`;
      svg.style.height = `${heightMm}mm`;
    } catch {
      svg.replaceChildren(); // ค่าที่เข้ารหัสไม่ได้ — ไม่แสดงบาร์โค้ด
    }
  }, [value, heightMm, moduleMm]);

  return <svg ref={ref} className={`block max-w-full ${className}`} role="img" aria-label={value} shapeRendering="crispEdges" />;
}
