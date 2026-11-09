import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/States';
import { optionText } from '../components/OrderItems';
import { getReceipt } from '../services/order.service';
import { formatCurrency, formatDateTime } from '../utils/format';
import { ORDER_TYPE } from '../utils/labels';

const METHOD_LABEL = { cash: 'เงินสด', promptpay: 'PromptPay' };
const money = (v) => formatCurrency(v).replace('฿', '');

/**
 * ใบเสร็จรับเงิน (กระดาษความร้อน 80mm) — เปิดในแท็บใหม่จากหน้าออเดอร์/หลังชำระเงิน
 * ?print=1 สั่งพิมพ์อัตโนมัติเมื่อโหลดเสร็จ
 * ข้อมูลรายการอ่านจาก snapshot ของออเดอร์ (ไม่ใช่ราคาเมนูปัจจุบัน)
 */
export default function ReceiptPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const printed = useRef(false);

  useEffect(() => {
    getReceipt(id)
      .then(setData)
      .catch((err) => setError(err.userMessage));
  }, [id]);

  useEffect(() => {
    if (data && params.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [data, params]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const { shop, order } = data;
  const p = order.payment;

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: 80mm auto; margin: 3mm; } }'}</style>

      <div className="mx-auto mb-4 flex max-w-[80mm] justify-center gap-2 print:hidden">
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> พิมพ์
        </button>
        <button className="btn-outline" onClick={() => window.close()}>
          <X size={16} /> ปิด
        </button>
      </div>

      <article className="mx-auto w-[80mm] max-w-full bg-white px-4 py-5 text-[12px] leading-snug text-black shadow print:w-full print:p-0 print:shadow-none">
        <header className="text-center">
          <h1 className="text-[15px] font-bold">{shop.shopName}</h1>
          {shop.shopAddress && <p>{shop.shopAddress}</p>}
          {shop.shopPhone && <p>โทร {shop.shopPhone}</p>}
          {shop.taxId && <p>เลขประจำตัวผู้เสียภาษี {shop.taxId}</p>}
          <p className="mt-2 font-semibold">ใบเสร็จรับเงิน</p>
        </header>

        <Divider />
        <Row label="เลขที่" value={order.orderNo} />
        <Row label="วันที่" value={formatDateTime(order.paidAt)} />
        <Row label="ประเภท" value={order.orderType === 'dine_in' && order.tableNo ? `ทานที่ร้าน (โต๊ะ ${order.tableNo})` : ORDER_TYPE[order.orderType]} />
        {p?.receivedByName && <Row label="พนักงาน" value={p.receivedByName} />}
        <Divider />

        <ul className="space-y-1.5">
          {order.items.map((i) => (
            <li key={i.id}>
              <div className="flex justify-between gap-2">
                <span>
                  {i.quantity} × {i.menuName}
                </span>
                <span className="shrink-0 tabular-nums">{money(i.lineTotal)}</span>
              </div>
              {i.options.length > 0 && <div className="pl-4 text-[11px]">({optionText(i.options)})</div>}
              <div className="pl-4 text-[11px]">@ {money(i.unitPrice + i.optionsPrice)}</div>
            </li>
          ))}
        </ul>

        <Divider />
        <Row label="รวม" value={money(order.subtotal)} />
        {order.discount > 0 && <Row label="ส่วนลด" value={`-${money(order.discount)}`} />}
        <Row label="ยอดสุทธิ" value={money(order.total)} bold />
        <Divider />
        {p && (
          <>
            <Row label={`ชำระโดย ${METHOD_LABEL[p.method]}`} value={money(p.receivedAmount)} />
            {p.method === 'cash' && <Row label="เงินทอน" value={money(p.changeAmount)} />}
            {p.referenceNo && <Row label="อ้างอิง" value={p.referenceNo} />}
          </>
        )}

        {shop.receiptFooter && (
          <>
            <Divider />
            <p className="text-center">{shop.receiptFooter}</p>
          </>
        )}
      </article>
    </div>
  );
}

function Divider() {
  return <hr className="my-2 border-t border-dashed border-black/60" />;
}

function Row({ label, value, bold = false }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'text-[14px] font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
