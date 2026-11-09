import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff, Search, ShoppingCart } from 'lucide-react';
import Swal from 'sweetalert2';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import MenuItemModal, { MAX_QTY, buildLine, lineUnitSatang } from '../components/pos/MenuItemModal';
import CartPanel from '../components/pos/CartPanel';
import PaymentModal from '../components/PaymentModal';
import { useSocketEvent, useSocketReconnect } from '../contexts/SocketContext';
import { getPosCatalog } from '../services/pos.service';
import { createOrder } from '../services/order.service';
import { showError } from '../utils/alert';
import { formatCurrency } from '../utils/format';
import { toBaht } from '../utils/money';

const EMPTY_FORM = { orderType: 'dine_in', tableNo: '', note: '' };

const sameLine = (a, b) =>
  a.menuId === b.menuId &&
  a.sizeId === b.sizeId &&
  a.note === b.note &&
  [...a.toppingIds].sort().join(',') === [...b.toppingIds].sort().join(',');

/** หน้าขาย (POS) — เลือกเมนูลงตะกร้าแล้วส่งออเดอร์เข้าครัว */
export default function PosPage() {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');

  const [lines, setLines] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [picking, setPicking] = useState(null); // { menu, line? }
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [paying, setPaying] = useState(null); // ออเดอร์ที่เพิ่งสร้างและเลือก "ชำระเงินเลย"
  const keySeq = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setCatalog(await getPosCatalog());
    } catch (err) {
      if (!silent) setError(err.userMessage);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // เมนูหมด/เปิดขายจากเครื่องอื่น -> อัปเดตทันที
  useSocketEvent('menu:updated', ({ menu }) => {
    setCatalog((c) => c && { ...c, menus: c.menus.map((m) => (m.id === menu.id ? { ...m, status: menu.status } : m)) });
  });
  useSocketReconnect(() => load({ silent: true }));

  const menusById = useMemo(() => new Map((catalog?.menus || []).map((m) => [m.id, m])), [catalog]);

  /** เมนูในตะกร้าที่ไม่พร้อมขายแล้ว */
  const unavailable = useMemo(
    () => new Set(lines.filter((l) => menusById.get(l.menuId)?.status !== 'available').map((l) => l.menuId)),
    [lines, menusById]
  );

  const visibleMenus = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    return catalog.menus.filter(
      (m) => (categoryId === 'all' || m.categoryId === categoryId) && (!q || m.name.toLowerCase().includes(q))
    );
  }, [catalog, categoryId, search]);

  const addLine = (line) =>
    setLines((ls) => {
      const existing = ls.find((l) => sameLine(l, line));
      if (existing) {
        return ls.map((l) => (l === existing ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l));
      }
      keySeq.current += 1;
      return [...ls, { ...line, key: keySeq.current }];
    });

  const handleMenuClick = (menu) => {
    if (menu.status !== 'available') return;
    if (!menu.sizes.length && !menu.toppings.length) {
      addLine(buildLine(menu, { sizeId: null, toppingIds: [], quantity: 1, note: '' }));
      return;
    }
    setPicking({ menu });
  };

  const handlePicked = (line) => {
    if (picking.line) {
      const key = picking.line.key;
      setLines((ls) => ls.map((l) => (l.key === key ? { ...line, key } : l)));
    } else {
      addLine(line);
    }
    setPicking(null);
  };

  const editLine = (line) => {
    const menu = menusById.get(line.menuId);
    if (menu) setPicking({ menu, line });
  };

  const clearCart = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'ล้างตะกร้า?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ล้าง',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      reverseButtons: true,
    });
    if (isConfirmed) {
      setLines([]);
      setForm(EMPTY_FORM);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await createOrder({
        orderType: form.orderType,
        tableNo: form.orderType === 'dine_in' ? form.tableNo.trim() || null : null,
        note: form.note.trim() || null,
        items: lines.map((l) => ({
          menuId: l.menuId,
          optionIds: [...(l.sizeId ? [l.sizeId] : []), ...l.toppingIds],
          quantity: l.quantity,
          note: l.note || null,
        })),
      });
      const order = res.data;
      setLines([]);
      setForm(EMPTY_FORM);
      setCartOpen(false);
      const { isConfirmed } = await Swal.fire({
        icon: 'success',
        title: `ออเดอร์ ${order.orderNo}`,
        html: `ส่งเข้าครัวแล้ว<br/>ยอดรวม <b>${formatCurrency(order.total)}</b>`,
        showCancelButton: true,
        confirmButtonText: 'ชำระเงินเลย',
        cancelButtonText: 'ชำระภายหลัง',
        confirmButtonColor: '#166534',
      });
      if (isConfirmed) setPaying(order);
    } catch (err) {
      showError(err.userMessage, 'ส่งออเดอร์ไม่สำเร็จ');
      load({ silent: true }); // ราคา/สถานะเมนูอาจเปลี่ยน
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const totalSatang = lines.reduce((s, l) => s + lineUnitSatang(l) * l.quantity, 0);

  const renderCart = (onClose) => (
    <CartPanel
      onClose={onClose}
      lines={lines}
      unavailable={unavailable}
      form={form}
      onFormChange={setForm}
      onQuantity={(key, q) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: q } : l)))}
      onEdit={editLine}
      onRemove={(key) => setLines((ls) => ls.filter((l) => l.key !== key))}
      onClear={clearCart}
      onSubmit={submit}
      submitting={submitting}
    />
  );

  return (
    <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
      <section className="pb-24 lg:pb-0">
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="ค้นหาเมนู..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[{ id: 'all', name: 'ทั้งหมด' }, ...catalog.categories].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  categoryId === c.id ? 'bg-primary-800 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {visibleMenus.length === 0 ? (
          <div className="card">
            <EmptyState text="ไม่พบเมนู" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleMenus.map((m) => {
              const soldOut = m.status !== 'available';
              const inCart = lines.filter((l) => l.menuId === m.id).reduce((s, l) => s + l.quantity, 0);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleMenuClick(m)}
                  disabled={soldOut}
                  className="card relative overflow-hidden text-left transition hover:border-primary-600 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:border-slate-200/70 disabled:hover:shadow-sm"
                >
                  <div className="relative aspect-[4/3] bg-slate-100">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className={`h-full w-full object-cover ${soldOut ? 'grayscale' : ''}`} loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <ImageOff size={28} />
                      </div>
                    )}
                    {soldOut && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                        <span className="badge bg-red-600 px-3 py-1 text-sm text-white">หมด</span>
                      </div>
                    )}
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-800 px-2 text-sm font-semibold text-white shadow">
                        {inCart}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className={`line-clamp-2 text-sm font-medium ${soldOut ? 'text-slate-400' : ''}`}>{m.name}</div>
                    <div className="mt-1 font-semibold text-primary-800">{formatCurrency(m.price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Desktop: ตะกร้าด้านขวา */}
      <aside className="card sticky top-20 hidden h-[calc(100vh-6.5rem)] overflow-hidden lg:block">{renderCart()}</aside>

      {/* Mobile/Tablet: แถบด้านล่าง + แผงตะกร้า */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-2xl bg-primary-800 px-5 py-3.5 text-white shadow-lg lg:hidden"
      >
        <span className="flex items-center gap-2 font-medium">
          <ShoppingCart size={20} /> ตะกร้า ({itemCount})
        </span>
        <span className="text-lg font-semibold tabular-nums">{formatCurrency(toBaht(totalSatang))}</span>
      </button>
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden" onMouseDown={() => !submitting && setCartOpen(false)}>
          <div className="h-[88vh] w-full overflow-hidden rounded-t-2xl bg-white" onMouseDown={(e) => e.stopPropagation()}>
            {renderCart(() => setCartOpen(false))}
          </div>
        </div>
      )}

      {paying && <PaymentModal order={paying} onClose={() => setPaying(null)} />}

      {picking && (
        <MenuItemModal
          key={`${picking.menu.id}-${picking.line?.key ?? 'new'}`}
          menu={picking.menu}
          initial={picking.line}
          onClose={() => setPicking(null)}
          onSubmit={handlePicked}
        />
      )}
    </div>
  );
}
