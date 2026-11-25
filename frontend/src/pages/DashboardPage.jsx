import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChefHat,
  Clock,
  Receipt,
  RefreshCw,
  Table2,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { getDashboardSummary } from '../services/dashboard.service';
import { useAuth } from '../contexts/AuthContext';
import { useSocketEvent } from '../contexts/SocketContext';
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_STATUS } from '../utils/labels';
import {
  formatCompactBaht,
  formatCurrency,
  formatNumber,
  formatShortDate,
  formatTime,
} from '../utils/format';
import { localName, t } from '../i18n';

const BAR_COLOR = '#15803d'; // primary-700 — ผ่านการตรวจ contrast บนพื้นขาว

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadTimer = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setData(await getDashboardSummary());
    } catch (err) {
      if (!silent) setError(err.userMessage);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(reloadTimer.current);
  }, [load]);

  // ตัวเลขออเดอร์วันนี้อัปเดตเองเมื่อมีออเดอร์ใหม่/เปลี่ยนสถานะ (รวบหลาย event เป็นครั้งเดียว)
  const scheduleReload = () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load({ silent: true }), 1000);
  };
  useSocketEvent('order:created', scheduleReload);
  useSocketEvent('order:updated', scheduleReload);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={t('สวัสดี {0} — สรุปภาพรวมร้านวันนี้', [user.fullName])}
        actions={
          <button className="btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('รีเฟรช')}
          </button>
        }
      />

      {loading && !data ? (
        <div className="card">
          <LoadingState />
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : (
        <DashboardContent data={data} isAdmin={user.role === 'admin'} />
      )}
    </div>
  );
}

function DashboardContent({ data, isAdmin }) {
  const { today, menus } = data;
  const diff = today.sales - today.yesterdaySales;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          label={t('ยอดขายวันนี้')}
          value={formatCurrency(today.sales)}
          sub={
            today.yesterdaySales > 0 || today.sales > 0 ? (
              <span className="inline-flex items-center gap-1">
                {diff >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {diff >= 0 ? '+' : ''}
                {formatCurrency(diff)} {t('จากเมื่อวาน')}
              </span>
            ) : (
              t('เมื่อวาน {0}', [formatCurrency(today.yesterdaySales)])
            )
          }
        />
        <StatTile
          icon={Receipt}
          label={t('บิลที่ชำระแล้ว')}
          value={formatNumber(today.paidOrders)}
          sub={t('เฉลี่ย {0} / บิล', [formatCurrency(today.averagePerBill)])}
        />
        <StatTile
          icon={ChefHat}
          label={t('ออเดอร์วันนี้')}
          value={formatNumber(today.orders)}
          sub={t('รอทำ {0} · กำลังทำ {1} · ยกเลิก {2}', [today.pending, today.preparing, today.cancelled])}
        />
        <StatTile
          icon={UtensilsCrossed}
          label={t('เมนูพร้อมขาย')}
          value={`${formatNumber(menus.available)} / ${formatNumber(menus.total)}`}
          sub={menus.soldOut > 0 ? t('หมด {0} เมนู', [menus.soldOut]) : t('{0} หมวดหมู่', [menus.categories])}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SalesTrendCard trend={data.salesTrend} />
        <TopMenusCard items={data.topMenus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentOrdersCard orders={data.recentOrders} unpaid={today.unpaid} />
        <LowStockCard items={data.lowStock} total={data.lowStockCount} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-800">
          <Icon size={16} />
        </span>
        {label}
      </div>
      <div className="mt-3 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function SalesTrendCard({ trend }) {
  const [view, setView] = useState('chart');
  const total = trend.reduce((s, d) => s + d.sales, 0);
  const chartData = trend.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  return (
    <div className="card p-4 lg:col-span-2">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('ยอดขาย 7 วันล่าสุด')}</h2>
          <p className="text-xs text-slate-500">{t('รวม')} {formatCurrency(total)} {t('(นับเฉพาะออเดอร์ที่ชำระแล้ว)')}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={t('รูปแบบการแสดงผล')}>
          <ViewButton active={view === 'chart'} onClick={() => setView('chart')} icon={BarChart3} label={t('กราฟ')} />
          <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={Table2} label={t('ตาราง')} />
        </div>
      </div>

      {view === 'chart' ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                tickFormatter={formatCompactBaht}
                tickLine={false}
                axisLine={false}
                width={56}
                domain={[0, (max) => Math.max(max, 100)]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<SalesTooltip />} />
              <Bar dataKey="sales" name={t('ยอดขาย')} fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">{t('วันที่')}</th>
                <th className="py-2 text-right font-medium">{t('บิล')}</th>
                <th className="py-2 text-right font-medium">{t('ยอดขาย')}</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => (
                <tr key={d.date} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{d.label}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(d.orders)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(d.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-slate-800">{d.label}</div>
      <div className="mt-1 text-slate-600">
        {t('ยอดขาย')} <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(d.sales)}</span>
      </div>
      <div className="text-slate-600">{formatNumber(d.orders)} {t('บิล')}</div>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${active ? 'bg-primary-50 font-medium text-primary-800' : 'text-slate-500 hover:text-slate-800'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function TopMenusCard({ items }) {
  const max = Math.max(1, ...items.map((i) => i.quantity));
  return (
    <div className="card p-4">
      <h2 className="font-semibold">{t('เมนูขายดี')}</h2>
      <p className="mb-3 text-xs text-slate-500">{t('7 วันล่าสุด (จำนวนจาน)')}</p>
      {items.length === 0 ? (
        <EmptyState text={t('ยังไม่มียอดขาย')} />
      ) : (
        <ol className="space-y-3">
          {items.map((m, i) => (
            <li key={m.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {localName(m)}
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">{formatNumber(m.quantity)} {t('จาน')}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full" style={{ width: `${(m.quantity / max) * 100}%`, background: BAR_COLOR }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RecentOrdersCard({ orders, unpaid }) {
  return (
    <div className="card p-4 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('ออเดอร์ล่าสุด')}</h2>
        {unpaid > 0 && (
          <span className="badge bg-red-100 text-red-700">
            <Clock size={12} /> {t('รอชำระ')} {unpaid} {t('บิล')}
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <EmptyState text={t('ยังไม่มีออเดอร์')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">{t('เลขออเดอร์')}</th>
                <th className="py-2 font-medium">{t('ประเภท')}</th>
                <th className="py-2 font-medium">{t('สถานะ')}</th>
                <th className="py-2 text-right font-medium">{t('ยอด')}</th>
                <th className="py-2 text-right font-medium">{t('เวลา')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium">{o.orderNo}</td>
                  <td className="py-2 text-slate-600">
                    {ORDER_TYPE[o.orderType]}
                    {o.tableNo ? t(' · โต๊ะ {0}', [o.tableNo]) : ''}
                  </td>
                  <td className="py-2">
                    <span className={`badge ${ORDER_STATUS[o.status]?.className}`}>{ORDER_STATUS[o.status]?.label}</span>{' '}
                    <span className={`badge ${PAYMENT_STATUS[o.paymentStatus]?.className}`}>
                      {PAYMENT_STATUS[o.paymentStatus]?.label}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(o.total)}</td>
                  <td className="py-2 text-right text-slate-500">{formatTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** วัตถุดิบที่คงเหลือ <= ขั้นต่ำ — ไม่มี: แจ้งว่ายังไม่มี, มี: แสดงรายการ (สูงสุด 10) + จำนวนที่เหลือ */
function LowStockCard({ items, total = items.length, isAdmin }) {
  const more = total - items.length;
  return (
    <div className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} className={items.length ? 'text-warning' : 'text-slate-400'} /> {t('วัตถุดิบใกล้หมด')}
        {total > 0 && <span className="badge bg-red-100 text-red-700">{total}</span>}
      </h2>
      <p className="mb-3 text-xs text-slate-500">{t('คงเหลือต่ำกว่าหรือเท่ากับจำนวนขั้นต่ำ')}</p>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500">
          <CheckCircle2 size={28} className="text-success" />
          {t('ยังไม่มีวัตถุดิบใกล้หมดในเวลานี้')}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{i.name}</span>
                {i.quantity <= 0 && <span className="badge shrink-0 bg-red-100 text-red-700">{t('หมด#stock')}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-danger">{formatNumber(i.quantity)}</span>
                <span className="text-slate-500">
                  {' '}
                  / {formatNumber(i.minQuantity)} {i.unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="mt-2 text-xs text-slate-500">{t('และอีก {0} รายการ', [more])}</p>}
      {isAdmin && (
        <Link to="/inventory" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-800 hover:underline">
          {t('ไปหน้าคลังวัตถุดิบ')} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

