import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Plus, Printer, Search, Wallet } from 'lucide-react';
import PaymentModal from '../components/PaymentModal';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import OrderItems from '../components/OrderItems';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useSocketEvent, useSocketReconnect } from '../contexts/SocketContext';
import { getOrders, openReceipt, updateOrderStatus } from '../services/order.service';
import { showError, toastSuccess } from '../utils/alert';
import { formatCurrency, formatDateTime, formatTime } from '../utils/format';
import { ORDER_NEXT_STEP, ORDER_STATUS, ORDER_TYPE, PAYMENT_STATUS, canCancelOrder } from '../utils/labels';

const PAGE_SIZE = 20;

/** วันที่วันนี้ตามเวลาเครื่อง YYYY-MM-DD */
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const placeText = (o) => (o.orderType === 'dine_in' && o.tableNo ? `โต๊ะ ${o.tableNo}` : ORDER_TYPE[o.orderType]);

/** รายการออเดอร์ — ค้นหา/กรอง, ดูรายละเอียด, เปลี่ยนสถานะ, ยกเลิก (อัปเดตอัตโนมัติผ่าน Socket.IO) */
export default function OrdersPage() {
  const [filters, setFilters] = useState({ date: todayYmd(), status: '', paymentStatus: '', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const reloadTimer = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        setData(await getOrders({ ...filters, page, pageSize: PAGE_SIZE }));
      } catch (err) {
        if (!silent) setError(err.userMessage);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filters, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  // มีออเดอร์ใหม่/เปลี่ยนสถานะจากเครื่องอื่น -> โหลดหน้าปัจจุบันใหม่แบบเงียบ (รวบหลาย event เป็นครั้งเดียว)
  const scheduleReload = () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load({ silent: true }), 400);
  };
  useSocketEvent('order:created', scheduleReload);
  useSocketEvent('order:updated', scheduleReload);
  useSocketReconnect(scheduleReload);

  const setFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  const selected = data?.orders.find((o) => o.id === selectedId) || null;

  const changeStatus = async (order, status) => {
    if (status === 'cancelled') {
      const { isConfirmed } = await Swal.fire({
        title: `ยกเลิกออเดอร์ ${order.orderNo}?`,
        text: 'ยกเลิกแล้วไม่สามารถย้อนกลับได้ และครัวจะไม่เห็นออเดอร์นี้อีก',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยกเลิกออเดอร์',
        cancelButtonText: 'ไม่ยกเลิก',
        confirmButtonColor: '#dc2626',
        reverseButtons: true,
        focusCancel: true,
      });
      if (!isConfirmed) return;
    }
    setBusy(true);
    try {
      const res = await updateOrderStatus(order.id, status);
      setData((d) => ({ ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, ...res.data } : o)) }));
      toastSuccess(res.message);
    } catch (err) {
      showError(err.userMessage);
      load({ silent: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="ออเดอร์"
        description="รายการออเดอร์ทั้งหมด อัปเดตอัตโนมัติเมื่อมีออเดอร์ใหม่หรือเปลี่ยนสถานะ"
        actions={
          <Link to="/pos" className="btn-primary">
            <Plus size={16} /> สร้างออเดอร์
          </Link>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="ค้นหาเลขออเดอร์ / โต๊ะ"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <input type="date" className="input" value={filters.date} onChange={setFilter('date')} aria-label="วันที่" />
        <select className="input" value={filters.status} onChange={setFilter('status')} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {Object.entries(ORDER_STATUS).map(([k, s]) => (
            <option key={k} value={k}>{s.label}</option>
          ))}
        </select>
        <select className="input" value={filters.paymentStatus} onChange={setFilter('paymentStatus')} aria-label="การชำระเงิน">
          <option value="">การชำระเงินทั้งหมด</option>
          {Object.entries(PAYMENT_STATUS).map(([k, s]) => (
            <option key={k} value={k}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data.orders.length === 0 ? (
          <EmptyState text={filters.date ? 'ไม่มีออเดอร์ในวันที่เลือก' : 'ไม่พบออเดอร์'} />
        ) : (
          <>
            {/* Desktop / Tablet */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">เลขออเดอร์</th>
                    <th className="px-4 py-3 font-medium">เวลา</th>
                    <th className="px-4 py-3 font-medium">ประเภท</th>
                    <th className="px-4 py-3 text-right font-medium">จำนวน</th>
                    <th className="px-4 py-3 text-right font-medium">ยอดรวม</th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                    <th className="px-4 py-3 font-medium">การชำระเงิน</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{o.orderNo}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTime(o.createdAt)}</td>
                      <td className="px-4 py-3">{placeText(o)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{o.itemCount}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(o.total)}</td>
                      <td className="px-4 py-3"><StatusBadge map={ORDER_STATUS} value={o.status} /></td>
                      <td className="px-4 py-3"><StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} /></td>
                      <td className="px-4 py-3 text-right">
                        <button className="btn-outline px-3 py-1.5" onClick={() => setSelectedId(o.id)}>
                          <Eye size={15} /> ดู
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.orders.map((o) => (
                <li key={o.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setSelectedId(o.id)}>
                    <div className="min-w-0">
                      <div className="font-medium">{o.orderNo}</div>
                      <div className="text-xs text-slate-500">
                        {formatTime(o.createdAt)} · {placeText(o)} · {o.itemCount} รายการ
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <StatusBadge map={ORDER_STATUS} value={o.status} />
                        <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(o.total)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <Pagination pagination={data.pagination} onChange={setPage} />
          </>
        )}
      </div>

      <OrderDetailModal
        order={paying ? null : selected}
        busy={busy}
        onClose={() => setSelectedId(null)}
        onChangeStatus={changeStatus}
        onPay={setPaying}
      />
      {paying && (
        <PaymentModal
          order={paying}
          onClose={() => setPaying(null)}
          onPaid={(paid) => setData((d) => ({ ...d, orders: d.orders.map((o) => (o.id === paid.id ? { ...o, ...paid } : o)) }))}
        />
      )}
    </div>
  );
}

function StatusBadge({ map, value }) {
  const s = map[value];
  return <span className={`badge ${s?.className || ''}`}>{s?.label || value}</span>;
}

function Pagination({ pagination, onChange }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">ทั้งหมด {total} ออเดอร์</div>;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">ทั้งหมด {total} ออเดอร์ · หน้า {page}/{totalPages}</span>
      <div className="flex gap-2">
        <button className="btn-outline px-2.5 py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="หน้าก่อน">
          <ChevronLeft size={16} />
        </button>
        <button className="btn-outline px-2.5 py-1.5" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="หน้าถัดไป">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

const METHOD_LABEL = { cash: 'เงินสด', promptpay: 'PromptPay' };

function OrderDetailModal({ order, busy, onClose, onChangeStatus, onPay }) {
  if (!order) return null;
  const step = ORDER_NEXT_STEP[order.status];
  const canPay = order.paymentStatus === 'unpaid' && order.status !== 'cancelled';
  const timeline = [
    ['สั่งเมื่อ', order.createdAt],
    ['เริ่มทำ', order.preparingAt],
    ['เสร็จ', order.completedAt],
    ['ยกเลิก', order.cancelledAt],
    ['ชำระเงิน', order.paidAt],
  ].filter(([, t]) => t);

  return (
    <Modal
      open
      title={`ออเดอร์ ${order.orderNo}`}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap justify-between gap-2">
          {canCancelOrder(order) ? (
            <button className="btn-outline text-danger" disabled={busy} onClick={() => onChangeStatus(order, 'cancelled')}>
              ยกเลิกออเดอร์
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
            {step && (
              <button className="btn-outline" disabled={busy} onClick={() => onChangeStatus(order, step.status)}>
                {step.label}
              </button>
            )}
            {canPay && (
              <button className="btn-primary" disabled={busy} onClick={() => onPay(order)}>
                <Wallet size={16} /> ชำระเงิน
              </button>
            )}
            {order.paymentStatus === 'paid' && (
              <button className="btn-primary" onClick={() => openReceipt(order.id)}>
                <Printer size={16} /> พิมพ์ใบเสร็จ
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge map={ORDER_STATUS} value={order.status} />
        <StatusBadge map={PAYMENT_STATUS} value={order.paymentStatus} />
        <span className="badge bg-slate-100 text-slate-700">{placeText(order)}</span>
      </div>

      <OrderItems items={order.items} showPrice />

      <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">ยอดรวมรายการ</dt><dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd></div>
        {order.discount > 0 && (
          <div className="flex justify-between"><dt className="text-slate-500">ส่วนลด</dt><dd className="tabular-nums">-{formatCurrency(order.discount)}</dd></div>
        )}
        <div className="flex justify-between text-base font-semibold"><dt>ยอดสุทธิ</dt><dd className="text-primary-800 tabular-nums">{formatCurrency(order.total)}</dd></div>
      </dl>

      {order.payment && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-primary-50 px-3 py-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">ชำระโดย</dt><dd>{METHOD_LABEL[order.payment.method]}</dd></div>
          <div><dt className="text-xs text-slate-500">รับเงิน</dt><dd className="tabular-nums">{formatCurrency(order.payment.receivedAmount)}</dd></div>
          <div><dt className="text-xs text-slate-500">เงินทอน</dt><dd className="tabular-nums">{formatCurrency(order.payment.changeAmount)}</dd></div>
          <div><dt className="text-xs text-slate-500">ผู้รับเงิน</dt><dd>{order.payment.receivedByName || '-'}</dd></div>
          {order.payment.referenceNo && (
            <div className="col-span-2"><dt className="text-xs text-slate-500">เลขอ้างอิง</dt><dd>{order.payment.referenceNo}</dd></div>
          )}
        </dl>
      )}

      {order.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">หมายเหตุ: {order.note}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {timeline.map(([label, t]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd>{formatDateTime(t)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-slate-500">พนักงาน</dt>
          <dd>{order.cashierName || '-'}</dd>
        </div>
      </dl>
    </Modal>
  );
}
