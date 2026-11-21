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

/** สิ่งที่พิมพ์: ใบเสร็จ / ฉลากติดกล่อง (1 ใบต่อ 1 กล่อง) — จำค่าที่เลือกไว้ใน localStorage */
const PRINT_MODES = [
  { value: 'both', label: 'ใบเสร็จ + ฉลากกล่อง' },
  { value: 'receipt', label: 'ใบเสร็จอย่างเดียว' },
  { value: 'labels', label: 'ฉลากกล่องอย่างเดียว' },
];
const MODE_KEY = 'food_pos_receipt_mode';

function loadMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return PRINT_MODES.some((m) => m.value === v) ? v : 'both';
  } catch {
    return 'both';
  }
}

function saveMode(v) {
  try {
    localStorage.setItem(MODE_KEY, v);
  } catch {
    /* storage ไม่พร้อมใช้งาน — ใช้ค่าเฉพาะครั้งนี้ */
  }
}

/** แตกรายการตามจำนวน: 2 × ข้าวกะเพรา -> 2 ฉลาก, เลขกล่องนับต่อกันทั้งออเดอร์ */
function buildBoxLabels(items) {
  const total = items.reduce((sum, i) => sum + i.quantity, 0);
  const labels = [];
  for (const item of items) {
    for (let n = 0; n < item.quantity; n += 1) {
      labels.push({ key: `${item.id}-${n}`, item, no: labels.length + 1, total });
    }
  }
  return labels;
}

/**
 * ใบเสร็จรับเงิน (กระดาษความร้อน 80mm) + ฉลากชื่อเมนูติดแต่ละกล่อง
 * เปิดในแท็บใหม่จากหน้าออเดอร์/หลังชำระเงิน — ?print=1 สั่งพิมพ์อัตโนมัติเมื่อโหลดเสร็จ
 * ข้อมูลรายการอ่านจาก snapshot ของออเดอร์ (ไม่ใช่ราคาเมนูปัจจุบัน)
 */
export default function ReceiptPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(loadMode);
  const printed = useRef(false);

  const changeMode = (v) => {
    setMode(v);
    saveMode(v);
  };

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
  const showReceipt = mode !== 'labels';
  const showLabels = mode !== 'receipt';
  const orderTypeText =
    order.orderType === 'dine_in' && order.tableNo ? `ทานที่ร้าน (โต๊ะ ${order.tableNo})` : ORDER_TYPE[order.orderType];

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: 80mm auto; margin: 3mm; } }'}</style>

      <div className="mx-auto mb-3 flex max-w-[80mm] flex-col gap-1 px-2 print:hidden">
        {PRINT_MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="print-mode" checked={mode === m.value} onChange={() => changeMode(m.value)} />
            {m.label}
          </label>
        ))}
      </div>

      <div className="mx-auto mb-4 flex max-w-[80mm] justify-center gap-2 print:hidden">
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> พิมพ์
        </button>
        <button className="btn-outline" onClick={() => window.close()}>
          <X size={16} /> ปิด
        </button>
      </div>

      {showReceipt && (
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
          <Row label="ประเภท" value={orderTypeText} />
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
      )}

      {showLabels &&
        buildBoxLabels(order.items).map((box, idx) => (
          <BoxLabel
            key={box.key}
            box={box}
            order={order}
            orderTypeText={orderTypeText}
            shopName={shop.shopName}
            breakBefore={showReceipt || idx > 0}
          />
        ))}
    </div>
  );
}

/**
 * ฉลากติดกล่อง 1 ใบ = 1 กล่อง — ตอนพิมพ์ขึ้นหน้าใหม่ทุกใบ (เครื่องพิมพ์ที่ตั้งตัดกระดาษต่อหน้าจะตัดแยกให้)
 * อ่านจาก snapshot ของรายการ (ชื่อเมนู/ตัวเลือก/หมายเหตุ ณ ตอนสั่ง)
 */
function BoxLabel({ box, order, orderTypeText, shopName, breakBefore }) {
  const { item, no, total } = box;
  return (
    <article
      className={`mx-auto mt-4 w-[80mm] max-w-full border border-dashed border-slate-400 bg-white px-4 py-4 text-[12px] leading-snug text-black shadow print:mt-0 print:w-full print:border-0 print:p-0 print:shadow-none ${
        breakBefore ? 'print:break-before-page' : ''
      }`}
    >
      <div className="flex justify-between gap-2 text-[11px]">
        <span className="truncate">{shopName}</span>
        <span className="shrink-0 font-semibold">
          กล่อง {no}/{total}
        </span>
      </div>
      <div className="flex justify-between gap-2 text-[11px]">
        <span>#{order.orderNo}</span>
        <span className="text-right">{orderTypeText}</span>
      </div>
      <Divider />
      <p className="text-center text-[20px] font-bold leading-tight">{item.menuName}</p>
      {item.options.length > 0 && <p className="mt-1 text-center text-[13px]">({optionText(item.options)})</p>}
      {item.note && <p className="mt-1 text-center text-[13px] font-semibold">* {item.note}</p>}
      {order.note && (
        <>
          <Divider />
          <p className="text-[11px]">หมายเหตุออเดอร์: {order.note}</p>
        </>
      )}
    </article>
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
