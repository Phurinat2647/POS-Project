import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  BarChart3,
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
        description={`สวัสดี ${user.fullName} — สรุปภาพรวมร้านวันนี้`}
        actions={
          <button className="btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> รีเฟรช
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
          label="ยอดขายวันนี้"
          value={formatCurrency(today.sales)}
          sub={
            today.yesterdaySales > 0 || today.sales > 0 ? (
              <span className="inline-flex items-center gap-1">
                {diff >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {diff >= 0 ? '+' : ''}
                {formatCurrency(diff)} จากเมื่อวาน
              </span>
            ) : (
              'เมื่อวาน ' + formatCurrency(today.yesterdaySales)
            )
          }
        />
        <StatTile
          icon={Receipt}
          label="บิลที่ชำระแล้ว"
          value={formatNumber(today.paidOrders)}
          sub={`เฉลี่ย ${formatCurrency(today.averagePerBill)} / บิล`}
        />
        <StatTile
          icon={ChefHat}
          label="ออเดอร์วันนี้"
          value={formatNumber(today.orders)}
          sub={`รอทำ ${today.pending} · กำลังทำ ${today.preparing} · ยกเลิก ${today.cancelled}`}
        />
        <StatTile
          icon={UtensilsCrossed}
          label="เมนูพร้อมขาย"
          value={`${formatNumber(menus.available)} / ${formatNumber(menus.total)}`}
          sub={menus.soldOut > 0 ? `หมด ${menus.soldOut} เมนู` : `${menus.categories} หมวดหมู่`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SalesTrendCard trend={data.salesTrend} />
        <TopMenusCard items={data.topMenus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentOrdersCard orders={data.recentOrders} unpaid={today.unpaid} />
        <LowStockCard items={data.lowStock} isAdmin={isAdmin} />
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
          <h2 className="font-semibold">ยอดขาย 7 วันล่าสุด</h2>
          <p className="text-xs text-slate-500">รวม {formatCurrency(total)} (นับเฉพาะออเดอร์ที่ชำระแล้ว)</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="รูปแบบการแสดงผล">
          <ViewButton active={view === 'chart'} onClick={() => setView('chart')} icon={BarChart3} label="กราฟ" />
          <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={Table2} label="ตาราง" />
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
              <Bar dataKey="sales" name="ยอดขาย" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">วันที่</th>
                <th className="py-2 text-right font-medium">บิล</th>
                <th className="py-2 text-right font-medium">ยอดขาย</th>
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
        ยอดขาย <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(d.sales)}</span>
      </div>
      <div className="text-slate-600">{formatNumber(d.orders)} บิล</div>
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
      <h2 className="font-semibold">เมนูขายดี</h2>
      <p className="mb-3 text-xs text-slate-500">7 วันล่าสุด (จำนวนจาน)</p>
      {items.length === 0 ? (
        <EmptyState text="ยังไม่มียอดขาย" />
      ) : (
        <ol className="space-y-3">
          {items.map((m, i) => (
            <li key={m.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {m.name}
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">{formatNumber(m.quantity)} จาน</span>
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
        <h2 className="font-semibold">ออเดอร์ล่าสุด</h2>
        {unpaid > 0 && (
          <span className="badge bg-red-100 text-red-700">
            <Clock size={12} /> รอชำระ {unpaid} บิล
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <EmptyState text="ยังไม่มีออเดอร์ (ระบบ POS จะเปิดใช้ใน Phase 3)" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">เลขออเดอร์</th>
                <th className="py-2 font-medium">ประเภท</th>
                <th className="py-2 font-medium">สถานะ</th>
                <th className="py-2 text-right font-medium">ยอด</th>
                <th className="py-2 text-right font-medium">เวลา</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium">{o.orderNo}</td>
                  <td className="py-2 text-slate-600">
                    {ORDER_TYPE[o.orderType]}
                    {o.tableNo ? ` · โต๊ะ ${o.tableNo}` : ''}
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

function LowStockCard({ items, isAdmin }) {
  return (
    <div className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} className="text-warning" /> วัตถุดิบใกล้หมด
      </h2>
      <p className="mb-3 text-xs text-slate-500">คงเหลือต่ำกว่าหรือเท่ากับจำนวนขั้นต่ำ</p>
      {items.length === 0 ? (
        <EmptyState text="วัตถุดิบเพียงพอทุกรายการ" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="truncate">{i.name}</span>
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
      {isAdmin && (
        <p className="mt-3 text-xs text-slate-400">หน้าจัดการคลังวัตถุดิบจะเปิดใช้ใน Phase 4</p>
      )}
    </div>
  );
}

