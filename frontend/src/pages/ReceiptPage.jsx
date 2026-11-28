import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import BoxLabel from '../components/BoxLabel';
import { ErrorState, LoadingState } from '../components/States';
import { optionText } from '../components/OrderItems';
import { getReceipt } from '../services/order.service';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, buildBoxLabels } from '../utils/boxLabels';
import { formatCurrency, formatDateTime } from '../utils/format';
import { ORDER_TYPE } from '../utils/labels';
import { localName, t } from '../i18n';

const METHOD_LABEL = { cash: t('เงินสด'), promptpay: 'PromptPay' };
const money = (v) => formatCurrency(v).replace(t('฿'), '');

/**
 * ขนาดกระดาษ (มม.)
 * - ใบเสร็จ: กระดาษม้วนความร้อนกว้าง 57 มม. (พื้นที่พิมพ์จริง ~48 มม.) ความยาวตามเนื้อหา
 * - ฉลากกล่อง: สติ๊กเกอร์ 60 x 40 มม. 1 ดวงต่อ 1 กล่อง (utils/boxLabels.js)
 */
const RECEIPT_WIDTH_MM = 57;
const PX_TO_MM = 25.4 / 96;

/** สิ่งที่ปุ่ม "พิมพ์" และการพิมพ์อัตโนมัติ (?print=1) จะพิมพ์ — จำค่าที่เลือกไว้ใน localStorage */
const PRINT_MODES = [
  { value: 'both', label: t('ใบเสร็จ + ฉลากกล่อง') },
  { value: 'receipt', label: t('ใบเสร็จอย่างเดียว') },
  { value: 'labels', label: t('ฉลากกล่องอย่างเดียว') },
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

const targetsOf = (m) => (m === 'both' ? ['receipt', 'labels'] : [m === 'labels' ? 'labels' : 'receipt']);

/** ขนาดหน้าของการพิมพ์แต่ละแบบ (คนละขนาดกระดาษ จึงพิมพ์แยกครั้งกัน) */
function pageCss(target, receiptHeightMm) {
  if (target === 'labels') return `@page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }`;
  // Chrome ไม่รองรับความสูง auto — ใช้ความสูงจริงของใบเสร็จที่วัดได้
  return `@page { size: ${RECEIPT_WIDTH_MM}mm ${receiptHeightMm}mm; margin: 0; }`;
}

/**
 * ใบเสร็จรับเงิน (กระดาษ 57 มม.) + ฉลากชื่อเมนูติดแต่ละกล่อง (สติ๊กเกอร์ 60x40 มม.)
 * ใบเสร็จกับฉลากเป็นคนละขนาดกระดาษ จึงสั่งพิมพ์แยกกัน 2 ครั้ง (เลือกเครื่องพิมพ์ได้แต่ละครั้ง)
 * เปิดในแท็บใหม่จากหน้าออเดอร์/หลังชำระเงิน — ?print=1 สั่งพิมพ์อัตโนมัติตามโหมดที่เลือกไว้
 * ?only=receipt|labels บังคับพิมพ์อย่างเดียว (จุดส่งมอบพิมพ์ใบเสร็จผ่าน iframe — สติ๊กเกอร์พิมพ์ที่ครัวแล้ว)
 * ข้อมูลรายการอ่านจาก snapshot ของออเดอร์ (ไม่ใช่ราคาเมนูปัจจุบัน)
 */
export default function ReceiptPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(loadMode);
  const [queue, setQueue] = useState([]); // รายการที่รอพิมพ์ เช่น ['receipt', 'labels']
  const [receiptHeightMm, setReceiptHeightMm] = useState(100);
  const receiptRef = useRef(null);
  const printed = useRef(false);

  const changeMode = (v) => {
    setMode(v);
    saveMode(v);
  };

  const startPrint = useCallback((targets) => setQueue(targets), []);

  useEffect(() => {
    getReceipt(id)
      .then(setData)
      .catch((err) => setError(err.userMessage));
  }, [id]);

  // วัดความสูงใบเสร็จ (มม.) เพื่อกำหนดขนาดหน้าให้พอดี ไม่เปลืองกระดาษ/ไม่ล้นเป็น 2 หน้า
  useEffect(() => {
    if (!receiptRef.current) return;
    const h = receiptRef.current.getBoundingClientRect().height * PX_TO_MM;
    setReceiptHeightMm(Math.ceil(h) + 2);
  }, [data]);

  const only = ['receipt', 'labels'].includes(params.get('only')) ? params.get('only') : null;
  const embedded = window.self !== window.top;

  useEffect(() => {
    if (data && params.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => startPrint(targetsOf(only || mode)), 300);
    }
  }, [data, params, mode, only, startPrint]);

  // พิมพ์ทีละรายการในคิว — ไปรายการถัดไปเมื่อปิดหน้าต่างพิมพ์ (afterprint)
  useEffect(() => {
    if (queue.length === 0) return undefined;
    const next = () => setQueue((q) => q.slice(1));
    window.addEventListener('afterprint', next, { once: true });
    const tx = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(tx);
      window.removeEventListener('afterprint', next);
    };
  }, [queue]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const { shop, order } = data;
  const p = order.payment;
  const printing = queue[0];
  const boxes = only === 'receipt' ? [] : buildBoxLabels(order.items);
  const orderTypeText =
    order.orderType === 'dine_in' && order.tableNo ? t('ทานที่ร้าน (โต๊ะ {0})', [order.tableNo]) : ORDER_TYPE[order.orderType];
  // ตอนพิมพ์ ซ่อนส่วนที่ไม่ได้พิมพ์รอบนี้
  const hideWhen = (target) => (printing && printing !== target ? 'print:hidden' : '');

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { ${pageCss(printing, receiptHeightMm)} html, body { margin: 0; } }`}</style>

      {!embedded && !only && (
      <div className="mx-auto mb-3 flex max-w-[80mm] flex-col gap-1 px-2 print:hidden">
        {PRINT_MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="print-mode" checked={mode === m.value} onChange={() => changeMode(m.value)} />
            {m.label}
          </label>
        ))}
        {mode === 'both' && (
          <p className="text-xs text-slate-500">{t('พิมพ์แยก 2 ครั้ง: ใบเสร็จ (57 มม.) แล้วตามด้วยฉลาก (60x40 มม.) — เลือกเครื่องพิมพ์ให้ตรงแต่ละครั้ง')}</p>
        )}
      </div>
      )}

      {!embedded && (
        <div className="mx-auto mb-4 flex max-w-[80mm] flex-wrap justify-center gap-2 print:hidden">
          <button className="btn-primary" onClick={() => startPrint(targetsOf(only || mode))}>
            <Printer size={16} /> {t('พิมพ์')}
          </button>
          <button className="btn-outline" onClick={() => window.close()}>
            <X size={16} /> {t('ปิด')}
          </button>
        </div>
      )}

      <section className={hideWhen('receipt')}>
        <p className="mb-1 text-center text-xs text-slate-500 print:hidden">{t('ใบเสร็จ (')}{RECEIPT_WIDTH_MM} {t('มม.)')}</p>
        {/* กว้าง 57 มม. พื้นที่พิมพ์ 48 มม. (ขอบซ้าย-ขวา 4.5 มม.) — ขนาดเท่ากันทั้งบนจอและตอนพิมพ์ */}
        <article
          ref={receiptRef}
          className="mx-auto box-border w-[57mm] bg-white px-[4.5mm] py-[3mm] text-[11px] leading-snug text-black shadow print:mx-0 print:shadow-none"
        >
          <header className="text-center">
            <h1 className="text-[14px] font-bold">{shop.shopName}</h1>
            {shop.shopAddress && <p>{shop.shopAddress}</p>}
            {shop.shopPhone && <p>{t('โทร')} {shop.shopPhone}</p>}
            {shop.taxId && <p>{t('เลขประจำตัวผู้เสียภาษี')} {shop.taxId}</p>}
            <p className="mt-1.5 font-semibold">{t('ใบเสร็จรับเงิน')}</p>
          </header>

          <Divider />
          <Row label={t('เลขที่')} value={order.orderNo} />
          <Row label={t('วันที่')} value={formatDateTime(order.paidAt)} />
          <Row label={t('ประเภท')} value={orderTypeText} />
          {p?.receivedByName && <Row label={t('พนักงาน')} value={p.receivedByName} />}
          <Divider />

          <ul className="space-y-1">
            {order.items.map((i) => (
              <li key={i.id}>
                <div className="flex justify-between gap-2">
                  <span>
                    {i.quantity} × {localName(i, 'menuName')}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(i.lineTotal)}</span>
                </div>
                {i.options.length > 0 && <div className="pl-3 text-[10px]">({optionText(i.options)})</div>}
                <div className="pl-3 text-[10px]">@ {money(i.unitPrice + i.optionsPrice)}</div>
              </li>
            ))}
          </ul>

          <Divider />
          <Row label={t('รวม')} value={money(order.subtotal)} />
          {order.discount > 0 && <Row label={t('ส่วนลด')} value={`-${money(order.discount)}`} />}
          {order.vatAmount > 0 && (
            <>
              <Row label={t('ยอดก่อน VAT')} value={money(order.total - order.vatAmount)} />
              <Row label={t('VAT {0}%', [order.vatRate])} value={money(order.vatAmount)} />
            </>
          )}
          <Row label={t('ยอดสุทธิ')} value={money(order.total)} bold />
          <Divider />
          {p && (
            <>
              <Row label={t('ชำระโดย {0}', [METHOD_LABEL[p.method]])} value={money(p.receivedAmount)} />
              {p.method === 'cash' && <Row label={t('เงินทอน')} value={money(p.changeAmount)} />}
              {p.referenceNo && <Row label={t('อ้างอิง')} value={p.referenceNo} />}
            </>
          )}

          {shop.receiptFooter && (
            <>
              <Divider />
              <p className="text-center">{shop.receiptFooter}</p>
            </>
          )}
        </article>
      </section>

      {boxes.length > 0 && (
        <section className={`mt-6 print:mt-0 ${hideWhen('labels')}`}>
          <p className="mb-1 text-center text-xs text-slate-500 print:hidden">
            {t('ฉลากกล่อง')} {boxes.length} {t('ดวง (')}{LABEL_WIDTH_MM}x{LABEL_HEIGHT_MM} {t('มม.)')}
          </p>
          <div className="flex flex-col items-center gap-3 print:block">
            {boxes.map((box) => (
              <BoxLabel key={box.key} box={box} order={order} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Divider() {
  return <hr className="my-1.5 border-t border-dashed border-black/60" />;
}

function Row({ label, value, bold = false }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'text-[13px] font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
