import { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat, Clock, Loader2, RefreshCw, ShoppingBag, Utensils, Volume2, VolumeX } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import OrderItems from '../components/OrderItems';
import { ErrorState, LoadingState } from '../components/States';
import { useSocketEvent, useSocketReconnect } from '../contexts/SocketContext';
import { getKitchenQueue, updateOrderStatus } from '../services/order.service';
import { showError, toastSuccess } from '../utils/alert';
import { formatTime } from '../utils/format';
import { ORDER_NEXT_STEP, ORDER_TYPE } from '../utils/labels';

const SOUND_KEY = 'food_pos_kitchen_sound';
const RECENT_LIMIT = 12;

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}
function saveSoundPref(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* storage ไม่พร้อมใช้งาน */
  }
}

/** เสียงแจ้งเตือนสั้น ๆ ด้วย Web Audio (ไม่ต้องใช้ไฟล์เสียง) — เบราว์เซอร์อาจบล็อกจนกว่าผู้ใช้จะแตะหน้าจอ */
function useBeep() {
  const ctxRef = useRef(null);
  return useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctxRef.current ||= new AudioCtx();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.22].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.2);
      });
    } catch {
      /* เล่นเสียงไม่ได้ — ไม่เป็นไร */
    }
  }, []);
}

/** เวลาปัจจุบัน อัปเดตทุก 30 วินาที (ใช้คำนวณเวลารอ) */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const byCreated = (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id;

/** นำออเดอร์ที่ได้รับจาก socket ไปวางในคอลัมน์ที่ถูกต้อง */
function applyOrder(queue, order) {
  const active = queue.active.filter((o) => o.id !== order.id);
  let recent = queue.recentCompleted.filter((o) => o.id !== order.id);
  if (order.status === 'pending' || order.status === 'preparing') active.push(order);
  if (order.status === 'completed') recent = [order, ...recent].slice(0, RECENT_LIMIT);
  return { active: active.sort(byCreated), recentCompleted: recent };
}

/** หน้าจอครัว — แสดงออเดอร์แบบ Real-time ผ่าน Socket.IO */
export default function KitchenPage() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [sound, setSound] = useState(readSoundPref);
  const [highlight, setHighlight] = useState(() => new Set());
  const beep = useBeep();
  const now = useNow();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setQueue(await getKitchenQueue());
    } catch (err) {
      if (!silent) setError(err.userMessage);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('order:created', ({ order }) => {
    setQueue((q) => q && applyOrder(q, order));
    setHighlight((h) => new Set(h).add(order.id));
    setTimeout(() => setHighlight((h) => {
      const next = new Set(h);
      next.delete(order.id);
      return next;
    }), 8000);
    if (sound) beep();
  });
  useSocketEvent('order:updated', ({ order }) => setQueue((q) => q && applyOrder(q, order)));
  useSocketReconnect(() => load({ silent: true }));

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    saveSoundPref(next);
    if (next) beep(); // ปลดล็อกเสียงของเบราว์เซอร์ด้วยการแตะ
  };

  const advance = async (order) => {
    const step = ORDER_NEXT_STEP[order.status];
    if (!step) return;
    setBusyId(order.id);
    try {
      const res = await updateOrderStatus(order.id, step.status);
      setQueue((q) => applyOrder(q, res.data));
      toastSuccess(res.message);
    } catch (err) {
      showError(err.userMessage);
      load({ silent: true }); // เครื่องอื่นอาจเปลี่ยนสถานะไปแล้ว
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const pending = queue.active.filter((o) => o.status === 'pending');
  const preparing = queue.active.filter((o) => o.status === 'preparing');

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="ครัว"
        description="ออเดอร์อัปเดตอัตโนมัติแบบ Real-time — เรียงจากออเดอร์ที่รอนานที่สุด"
        actions={
          <>
            <button className="btn-outline" onClick={toggleSound} title="เสียงแจ้งเตือนออเดอร์ใหม่">
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? 'เปิดเสียง' : 'ปิดเสียง'}
            </button>
            <button className="btn-outline" onClick={() => load()}>
              <RefreshCw size={16} /> รีเฟรช
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr_320px]">
        <Column title="รอทำ" count={pending.length} tone="bg-amber-500">
          {pending.map((o) => (
            <KitchenCard key={o.id} order={o} now={now} busy={busyId === o.id} isNew={highlight.has(o.id)} onAdvance={advance} />
          ))}
        </Column>
        <Column title="กำลังทำ" count={preparing.length} tone="bg-blue-600">
          {preparing.map((o) => (
            <KitchenCard key={o.id} order={o} now={now} busy={busyId === o.id} onAdvance={advance} />
          ))}
        </Column>
        <Column title="เสร็จล่าสุด (วันนี้)" count={queue.recentCompleted.length} tone="bg-green-600" className="lg:col-span-2 2xl:col-span-1">
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
            {queue.recentCompleted.map((o) => (
              <div key={o.id} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">#{o.orderNo.split('-')[1]} <OrderPlace order={o} /></div>
                  <div className="truncate text-xs text-slate-500">
                    {o.items.map((i) => `${i.quantity}× ${i.menuName}`).join(', ')}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{formatTime(o.completedAt)}</span>
              </div>
            ))}
          </div>
        </Column>
      </div>
    </div>
  );
}

function Column({ title, count, tone, children, className = '' }) {
  const empty = count === 0;
  return (
    <section className={`rounded-2xl bg-slate-200/50 p-3 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 px-1 font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} /> {title}
        <span className="badge bg-white text-slate-700">{count}</span>
      </h2>
      {empty ? <p className="py-10 text-center text-sm text-slate-400">ไม่มีออเดอร์</p> : <div className="space-y-3">{children}</div>}
    </section>
  );
}

function OrderPlace({ order }) {
  const Icon = order.orderType === 'dine_in' ? Utensils : ShoppingBag;
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-sm font-normal text-slate-600">
      <Icon size={14} />
      {order.orderType === 'dine_in' && order.tableNo ? `โต๊ะ ${order.tableNo}` : ORDER_TYPE[order.orderType]}
    </span>
  );
}

function KitchenCard({ order, now, busy, isNew = false, onAdvance }) {
  const step = ORDER_NEXT_STEP[order.status];
  const waitedMin = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
  const waitTone = waitedMin >= 20 ? 'bg-red-100 text-red-700' : waitedMin >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';

  return (
    <article className={`card overflow-hidden transition ${isNew ? 'ring-4 ring-amber-300' : ''}`}>
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-xl font-bold">
            #{order.orderNo.split('-')[1]}
            <OrderPlace order={order} />
          </div>
          <div className="text-xs text-slate-500">
            {order.orderNo} · สั่งเมื่อ {formatTime(order.createdAt)}
          </div>
        </div>
        <span className={`badge shrink-0 ${waitTone}`}>
          <Clock size={12} /> {waitedMin} นาที
        </span>
      </header>
      <div className="px-4 py-2">
        <OrderItems items={order.items} size="lg" />
        {order.note && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">หมายเหตุ: {order.note}</p>
        )}
      </div>
      {step && (
        <div className="px-4 pb-4">
          <button
            className={`btn w-full py-3 text-base text-white ${order.status === 'pending' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            onClick={() => onAdvance(order)}
            disabled={busy}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ChefHat size={18} />} {step.label}
          </button>
        </div>
      )}
    </article>
  );
}
