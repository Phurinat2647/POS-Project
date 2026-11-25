import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, FileText, Table2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { getSalesReport } from '../services/report.service';
import { downloadCsv } from '../utils/csv';
import { formatCompactBaht, formatCurrency, formatDateTime, formatNumber, formatShortDate } from '../utils/format';
import { ORDER_TYPE } from '../utils/labels';
import { localName, t } from '../i18n';

const BAR_COLOR = '#15803d'; // เดียวกับ Dashboard (primary-700)
const METHOD_LABEL = { cash: t('เงินสด'), promptpay: 'PromptPay' };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** ช่วงวันที่สำเร็จรูป (ตามเวลาเครื่อง) */
function presetRange(key) {
  const today = new Date();
  switch (key) {
    case 'yesterday':
      return { from: ymd(addDays(today, -1)), to: ymd(addDays(today, -1)) };
    case '7d':
      return { from: ymd(addDays(today, -6)), to: ymd(today) };
    case 'month':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case 'lastMonth':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    default:
      return { from: ymd(today), to: ymd(today) };
  }
}

const PRESETS = [
  ['today', t('วันนี้')],
  ['yesterday', t('เมื่อวาน')],
  ['7d', t('7 วันล่าสุด')],
  ['month', t('เดือนนี้')],
  ['lastMonth', t('เดือนที่แล้ว')],
];

/** รายงานยอดขาย (admin) — นับจากออเดอร์ที่ชำระแล้วตามวันที่ชำระ */
export default function ReportsPage() {
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getSalesReport(range));
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const choosePreset = (key) => {
    setPreset(key);
    setRange(presetRange(key));
  };
  const setDate = (k) => (e) => {
    if (!e.target.value) return;
    setPreset('custom');
    setRange((r) => ({ ...r, [k]: e.target.value }));
  };

  const fileSuffix = range.from === range.to ? range.from : `${range.from}_${range.to}`;

  const exportBills = () =>
    downloadCsv(`sales-bills_${fileSuffix}.csv`, [
      { header: t('เลขออเดอร์'), value: (o) => o.orderNo },
      { header: t('วันเวลาชำระ'), value: (o) => formatDateTime(o.paidAt) },
      { header: t('ประเภท'), value: (o) => ORDER_TYPE[o.orderType] },
      { header: t('โต๊ะ'), value: (o) => o.tableNo || '' },
      { header: t('จำนวนรายการ'), value: (o) => o.itemCount },
      { header: t('ยอดรวม'), value: (o) => o.subtotal.toFixed(2) },
      { header: t('ส่วนลด'), value: (o) => o.discount.toFixed(2) },
      { header: t('ยอดสุทธิ'), value: (o) => o.total.toFixed(2) },
      { header: t('วิธีชำระ'), value: (o) => METHOD_LABEL[o.method] },
    ], data.orders);

  /** เปิดหน้ารายงานสำหรับพิมพ์ในแท็บใหม่ (บันทึกเป็น PDF ผ่านหน้าต่างพิมพ์ของ browser) */
  const openPdf = () => {
    const q = new URLSearchParams({ from: data.range.from, to: data.range.to, print: '1' });
    window.open(`/reports/print?${q}`, '_blank', 'noopener');
  };

  const exportMenus = () =>
    downloadCsv(`sales-menus_${fileSuffix}.csv`, [
      { header: t('เมนู'), value: (m) => localName(m) },
      { header: t('หมวดหมู่'), value: (m) => m.category || '' },
      { header: t('จำนวน'), value: (m) => m.quantity },
      { header: t('ยอดขาย (ก่อนส่วนลด)'), value: (m) => m.sales.toFixed(2) },
    ], data.topMenus);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('รายงานยอดขาย')}
        description={t('นับเฉพาะออเดอร์ที่ชำระเงินแล้ว ตามวันที่ชำระ')}
        actions={
          data && data.summary.bills > 0 && (
            <>
              <button className="btn-primary" onClick={openPdf}>
                <FileText size={16} /> {t('รายงาน PDF')}
              </button>
              <button className="btn-outline" onClick={exportBills}>
                <Download size={16} /> {t('รายการบิล (CSV)')}
              </button>
              <button className="btn-outline" onClick={exportMenus}>
                <Download size={16} /> {t('ยอดขายรายเมนู (CSV)')}
              </button>
            </>
          )
        }
      />

      <div className="card mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ช่วงเวลา')}>
          {PRESETS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => choosePreset(k)}
              aria-pressed={preset === k}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${preset === k ? 'bg-primary-800 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input" value={range.from} max={range.to} onChange={setDate('from')} aria-label={t('ตั้งแต่วันที่')} />
          <span className="text-slate-400">–</span>
          <input type="date" className="input" value={range.to} min={range.from} onChange={setDate('to')} aria-label={t('ถึงวันที่')} />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Report data={data} />
      )}
    </div>
  );
}

function Report({ data }) {
  const s = data.summary;
  const singleDay = data.range.from === data.range.to;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('ยอดขายสุทธิ')} value={formatCurrency(s.netSales)} strong />
        <Stat label={t('จำนวนบิล')} value={formatNumber(s.bills)} sub={t('{0} จาน/แก้ว', [formatNumber(s.itemsSold)])} />
        <Stat label={t('เฉลี่ยต่อบิล')} value={formatCurrency(s.averagePerBill)} />
        <Stat label={t('ส่วนลดรวม')} value={formatCurrency(s.discount)} sub={t('ยอดก่อนส่วนลด {0}', [formatCurrency(s.grossSales)])} />
      </div>
      {(s.cancelledOrders > 0 || s.unpaidOrders > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span>{t('ยกเลิก#status')} <b>{formatNumber(s.cancelledOrders)}</b> {t('ออเดอร์ (')}{formatCurrency(s.cancelledAmount)})</span>
          <span>{t('ค้างชำระ')} <b>{formatNumber(s.unpaidOrders)}</b> {t('ออเดอร์ (')}{formatCurrency(s.unpaidAmount)}{t(') — ไม่นับในยอดขาย')}</span>
        </div>
      )}

      {s.bills === 0 ? (
        <div className="card">
          <EmptyState text={t('ไม่มียอดขายในช่วงวันที่เลือก')} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <SalesChart
              className="lg:col-span-2"
              title={singleDay ? t('ยอดขายรายชั่วโมง') : t('ยอดขายรายวัน')}
              rows={
                singleDay
                  ? data.byHour.filter((h) => h.bills > 0 || (h.hour >= 9 && h.hour <= 21)).map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))
                  : data.daily.map((d) => ({ ...d, label: formatShortDate(d.date) }))
              }
              firstColumn={singleDay ? t('ชั่วโมง') : t('วันที่')}
            />
            <ShareCard
              title={t('แยกตามวิธีชำระ')}
              rows={data.byMethod.map((m) => ({ name: METHOD_LABEL[m.method], sales: m.sales, sub: t('{0} บิล', [formatNumber(m.bills)]) }))}
              total={s.netSales}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <MenuTable className="lg:col-span-2" items={data.topMenus} />
            <ShareCard
              title={t('แยกตามหมวดหมู่')}
              note={t('ยอดก่อนหักส่วนลดท้ายบิล')}
              rows={data.byCategory.map((c) => ({ name: c.name, sales: c.sales, sub: t('{0} รายการ', [formatNumber(c.quantity)]) }))}
              total={data.byCategory.reduce((sum, c) => sum + c.sales, 0)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, strong = false }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${strong ? 'text-2xl text-primary-800' : 'text-xl'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function SalesChart({ title, rows, firstColumn, className = '' }) {
  const [view, setView] = useState('chart');
  return (
    <div className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={t('รูปแบบการแสดงผล')}>
          {[
            ['chart', BarChart3, t('กราฟ')],
            ['table', Table2, t('ตาราง')],
          ].map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${view === v ? 'bg-primary-50 font-medium text-primary-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'chart' ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={8} />
              <YAxis
                tickFormatter={formatCompactBaht}
                tickLine={false}
                axisLine={false}
                width={56}
                domain={[0, (max) => Math.max(max, 100)]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip />} />
              <Bar dataKey="sales" name={t('ยอดขาย')} fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">{firstColumn}</th>
                <th className="py-2 text-right font-medium">{t('บิล')}</th>
                <th className="py-2 text-right font-medium">{t('ยอดขาย')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.bills)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(r.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-slate-800">{d.label}</div>
      <div className="mt-1 text-slate-600">
        {t('ยอดขาย')} <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(d.sales)}</span>
      </div>
      <div className="text-slate-600">{formatNumber(d.bills)} {t('บิล')}</div>
    </div>
  );
}

/** สัดส่วนยอดขาย — แถบแนวนอนสีเดียว + ตัวเลขกำกับ (ไม่ใช้สีแยกหมวด) */
function ShareCard({ title, note, rows, total }) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          const pct = total > 0 ? (r.sales / total) * 100 : 0;
          return (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(r.sales)} <span className="text-xs text-slate-500">({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR_COLOR }} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{r.sub}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MenuTable({ items, className = '' }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? items : items.slice(0, 10);
  return (
    <div className={`card p-4 ${className}`}>
      <h2 className="font-semibold">{t('ยอดขายรายเมนู')}</h2>
      <p className="mb-3 text-xs text-slate-500">{t('เรียงตามจำนวนที่ขาย · ยอดก่อนหักส่วนลดท้ายบิล')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-2 font-medium">#</th>
              <th className="py-2 font-medium">{t('เมนู')}</th>
              <th className="hidden py-2 font-medium sm:table-cell">{t('หมวดหมู่')}</th>
              <th className="py-2 text-right font-medium">{t('จำนวน')}</th>
              <th className="py-2 text-right font-medium">{t('ยอดขาย')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m, i) => (
              <tr key={`${m.name}-${m.category}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-slate-400">{i + 1}</td>
                <td className="py-2">{localName(m)}</td>
                <td className="hidden py-2 text-slate-500 sm:table-cell">{m.category || '-'}</td>
                <td className="py-2 text-right tabular-nums">{formatNumber(m.quantity)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(m.sales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 10 && (
        <button className="mt-2 text-sm font-medium text-primary-800" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('แสดงน้อยลง') : t('แสดงทั้งหมด {0} เมนู', [items.length])}
        </button>
      )}
    </div>
  );
}
