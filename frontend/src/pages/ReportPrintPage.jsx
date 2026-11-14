import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/States';
import { getSalesReport } from '../services/report.service';
import { getSettings } from '../services/settings.service';
import { formatCurrency, formatDateTime, formatNumber, formatShortDate } from '../utils/format';
import { ORDER_TYPE } from '../utils/labels';

const METHOD_LABEL = { cash: 'เงินสด', promptpay: 'PromptPay' };

const thaiDate = (ymd) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * รายงานยอดขายสำหรับพิมพ์ / บันทึกเป็น PDF (กระดาษ A4) — เปิดในแท็บใหม่จากหน้ารายงาน
 *   /reports/print?from=YYYY-MM-DD&to=YYYY-MM-DD&print=1
 * ใช้ข้อมูลชุดเดียวกับหน้ารายงาน (นับเฉพาะออเดอร์ที่ชำระแล้ว ตามวันที่ชำระ)
 */
export default function ReportPrintPage() {
  const [params] = useSearchParams();
  const from = params.get('from');
  const to = params.get('to') || from;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const printed = useRef(false);

  useEffect(() => {
    if (!from) {
      setError('ไม่ได้ระบุช่วงวันที่');
      return;
    }
    Promise.all([getSalesReport({ from, to }), getSettings()])
      .then(([report, shop]) => setData({ report, shop }))
      .catch((err) => setError(err.userMessage));
  }, [from, to]);

  useEffect(() => {
    if (data && params.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [data, params]);

  useEffect(() => {
    if (from) document.title = `รายงานยอดขาย ${from === to ? from : `${from}_${to}`}`;
  }, [from, to]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const { report, shop } = data;
  const s = report.summary;
  const singleDay = report.range.from === report.range.to;
  const rangeText = singleDay ? thaiDate(report.range.from) : `${thaiDate(report.range.from)} – ${thaiDate(report.range.to)}`;

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: A4; margin: 12mm; } }'}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-center gap-2 px-4 print:hidden">
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> พิมพ์ / บันทึกเป็น PDF
        </button>
        <button className="btn-outline" onClick={() => window.close()}>
          <X size={16} /> ปิด
        </button>
        <p className="w-full text-center text-xs text-slate-500">
          บันทึกเป็นไฟล์ PDF: กดพิมพ์ แล้วเลือกเครื่องพิมพ์ปลายทางเป็น “บันทึกเป็น PDF” (Save as PDF)
        </p>
      </div>

      <article className="mx-auto w-[210mm] max-w-full bg-white px-10 py-8 text-[12px] leading-relaxed text-black shadow print:w-full print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-lg font-bold">{shop.shopName}</h1>
            {shop.shopAddress && <p className="text-slate-600">{shop.shopAddress}</p>}
            {shop.shopPhone && <p className="text-slate-600">โทร {shop.shopPhone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold">รายงานยอดขาย</h2>
            <p>{rangeText}</p>
            <p className="text-[10px] text-slate-500">พิมพ์เมื่อ {formatDateTime(new Date())}</p>
          </div>
        </header>

        <Section title="สรุป">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="ยอดขายสุทธิ" value={formatCurrency(s.netSales)} strong />
            <Stat label="จำนวนบิล" value={formatNumber(s.bills)} />
            <Stat label="เฉลี่ยต่อบิล" value={formatCurrency(s.averagePerBill)} />
            <Stat label="จำนวนจาน/แก้ว" value={formatNumber(s.itemsSold)} />
          </div>
          <table className="mt-3 w-full">
            <tbody>
              <KV label="ยอดก่อนส่วนลด" value={formatCurrency(s.grossSales)} />
              <KV label="ส่วนลดรวม" value={`- ${formatCurrency(s.discount)}`} />
              <KV label="ยอดขายสุทธิ" value={formatCurrency(s.netSales)} bold />
              <KV label={`ออเดอร์ที่ยกเลิก (${formatNumber(s.cancelledOrders)} ออเดอร์)`} value={formatCurrency(s.cancelledAmount)} muted />
              <KV label={`ออเดอร์ค้างชำระ (${formatNumber(s.unpaidOrders)} ออเดอร์) — ไม่นับในยอดขาย`} value={formatCurrency(s.unpaidAmount)} muted />
            </tbody>
          </table>
        </Section>

        <div className="grid grid-cols-2 gap-6">
          <Section title="แยกตามวิธีชำระเงิน">
            <Table
              head={['วิธีชำระ', 'บิล', 'ยอดขาย']}
              rows={report.byMethod.map((m) => [METHOD_LABEL[m.method] || m.method, formatNumber(m.bills), formatCurrency(m.sales)])}
            />
          </Section>
          <Section title="แยกตามหมวดหมู่ (ก่อนส่วนลด)">
            <Table
              head={['หมวดหมู่', 'จำนวน', 'ยอดขาย']}
              rows={report.byCategory.map((c) => [c.name || '-', formatNumber(c.quantity), formatCurrency(c.sales)])}
              empty="ไม่มีข้อมูล"
            />
          </Section>
        </div>

        {!singleDay && (
          <Section title="ยอดขายรายวัน">
            <Table
              head={['วันที่', 'บิล', 'ยอดขาย']}
              rows={report.daily.map((d) => [formatShortDate(d.date), formatNumber(d.bills), formatCurrency(d.sales)])}
            />
          </Section>
        )}

        <Section title="ยอดขายรายเมนู (ก่อนส่วนลด)">
          <Table
            head={['#', 'เมนู', 'หมวดหมู่', 'จำนวน', 'ยอดขาย']}
            rows={report.topMenus.map((m, i) => [i + 1, m.name, m.category || '-', formatNumber(m.quantity), formatCurrency(m.sales)])}
            empty="ไม่มีรายการขาย"
          />
        </Section>

        <Section title={`รายการบิล (${formatNumber(report.orders.length)} บิล)`}>
          <Table
            head={['เลขออเดอร์', 'วันเวลาชำระ', 'ประเภท', 'รายการ', 'ยอดรวม', 'ส่วนลด', 'สุทธิ', 'ชำระด้วย']}
            rows={report.orders.map((o) => [
              o.orderNo,
              formatDateTime(o.paidAt),
              o.orderType === 'dine_in' && o.tableNo ? `โต๊ะ ${o.tableNo}` : ORDER_TYPE[o.orderType],
              formatNumber(o.itemCount),
              formatCurrency(o.subtotal),
              o.discount ? formatCurrency(o.discount) : '-',
              formatCurrency(o.total),
              METHOD_LABEL[o.method] || o.method,
            ])}
            empty="ไม่มีบิลที่ชำระแล้วในช่วงนี้"
          />
        </Section>

        <footer className="mt-6 border-t border-slate-300 pt-2 text-[10px] text-slate-500">
          นับเฉพาะออเดอร์ที่ชำระเงินแล้ว ตามวันที่ชำระ · ยอดแยกหมวด/เมนูเป็นยอดก่อนส่วนลดท้ายบิล
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-5 break-inside-avoid-page">
      <h3 className="mb-1.5 text-[13px] font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="rounded border border-slate-300 px-3 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-[15px] font-bold' : 'text-[13px] font-semibold'}`}>{value}</div>
    </div>
  );
}

function KV({ label, value, bold, muted }) {
  return (
    <tr className={`${bold ? 'font-bold' : ''} ${muted ? 'text-slate-500' : ''}`}>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right tabular-nums">{value}</td>
    </tr>
  );
}

/** ตาราง: คอลัมน์แรกชิดซ้าย ที่เหลือชิดขวา (ตัวเลข) ยกเว้นคอลัมน์ข้อความ */
function Table({ head, rows, empty = 'ไม่มีข้อมูล' }) {
  const textCols = new Set(head.map((h, i) => (['เมนู', 'หมวดหมู่', 'ประเภท', 'ชำระด้วย', 'วันเวลาชำระ'].includes(h) || i === 0 ? i : -1)));
  return (
    <table className="w-full border-collapse">
      <thead className="table-header-group">
        <tr className="border-b border-slate-400 text-[11px] text-slate-600">
          {head.map((h, i) => (
            <th key={h} className={`px-1.5 py-1 font-semibold ${textCols.has(i) ? 'text-left' : 'text-right'}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="px-1.5 py-2 text-center text-slate-500">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((r, ri) => (
            <tr key={ri} className="break-inside-avoid border-b border-slate-200">
              {r.map((c, ci) => (
                <td key={ci} className={`px-1.5 py-1 ${textCols.has(ci) ? 'text-left' : 'text-right tabular-nums'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
