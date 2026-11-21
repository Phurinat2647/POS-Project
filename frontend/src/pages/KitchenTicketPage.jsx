import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/States';
import { optionText } from '../components/OrderItems';
import { getOrder } from '../services/order.service';
import { formatDateTime } from '../utils/format';
import { ORDER_TYPE } from '../utils/labels';

/**
 * ใบสั่งครัว — กระดาษ 80x80 มม. (ไม่มีราคา) เน้นชื่อเมนู ตัวเลือก หมายเหตุ ให้อ่านง่ายหน้าเตา
 * รายการเยอะเกิน 1 แผ่นจะต่อแผ่นถัดไปโดยไม่ตัดกลางรายการ
 * ?print=1 สั่งพิมพ์อัตโนมัติเมื่อโหลดเสร็จ (ใช้จาก utils/kitchenTicket.js ผ่าน iframe)
 * ข้อมูลอ่านจาก snapshot ของออเดอร์
 */
export default function KitchenTicketPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const printed = useRef(false);
  const embedded = window.self !== window.top;

  useEffect(() => {
    getOrder(id)
      .then(setOrder)
      .catch((err) => setError(err.userMessage));
  }, [id]);

  useEffect(() => {
    if (order && params.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [order, params]);

  if (error) return <ErrorState message={error} />;
  if (!order) return <LoadingState />;

  const place = order.orderType === 'dine_in' && order.tableNo ? `โต๊ะ ${order.tableNo}` : ORDER_TYPE[order.orderType];
  const count = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: 80mm 80mm; margin: 3mm; } html, body { margin: 0; } }'}</style>

      {!embedded && (
        <div className="mx-auto mb-4 flex justify-center gap-2 print:hidden">
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> พิมพ์ใบสั่งครัว
          </button>
          <button className="btn-outline" onClick={() => window.close()}>
            <X size={16} /> ปิด
          </button>
        </div>
      )}

      <article className="mx-auto box-border min-h-[80mm] w-[80mm] bg-white p-[3mm] text-[12px] leading-snug text-black shadow print:min-h-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold">ใบสั่งครัว</p>
            <p className="text-[24px] leading-none font-bold">#{order.orderNo.split('-')[1]}</p>
          </div>
          <p className="pt-2.5 text-right text-[17px] leading-tight font-bold">{place}</p>
        </header>
        <div className="mt-0.5 flex justify-between gap-2 text-[10px]">
          <span>{order.orderNo}</span>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
        {order.cashierName && <p className="text-[10px]">พนักงาน: {order.cashierName}</p>}
        <hr className="my-1 border-t-2 border-dashed border-black" />

        <ul className="space-y-1">
          {order.items.map((i) => (
            <li key={i.id} className="break-inside-avoid">
              <p className="text-[15px] leading-tight font-bold">
                {i.quantity} × {i.menuName}
              </p>
              {i.options.length > 0 && <p className="pl-5 text-[12px] leading-tight">+ {optionText(i.options)}</p>}
              {i.note && <p className="pl-5 text-[13px] leading-tight font-bold">* {i.note}</p>}
            </li>
          ))}
        </ul>

        {order.note && (
          <p className="mt-2 break-inside-avoid border-2 border-black px-1.5 py-1 text-[13px] font-semibold">หมายเหตุ: {order.note}</p>
        )}
        <hr className="my-1 border-t-2 border-dashed border-black" />
        <p className="text-center text-[11px]">รวม {count} รายการ</p>
      </article>
    </div>
  );
}
