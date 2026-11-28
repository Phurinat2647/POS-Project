import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleCheck, Loader2, PackageCheck, RefreshCw, ScanBarcode, ShoppingBag, Utensils, X } from 'lucide-react';
import Swal from 'sweetalert2';
import PageHeader from '../components/PageHeader';
import OrderItems from '../components/OrderItems';
import PaymentModal from '../components/PaymentModal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useSocketEvent, useSocketReconnect } from '../contexts/SocketContext';
import { getOrders, lookupOrderByCode, updateOrderStatus } from '../services/order.service';
import { showError, toastSuccess } from '../utils/alert';
import { buildBoxLabels, normalizeScan, parseBoxCode } from '../utils/boxLabels';
import { formatCurrency, formatDateTime, formatTime } from '../utils/format';
import { printReceiptOnly } from '../utils/kitchenTicket';
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_STATUS } from '../utils/labels';
import { localName, t } from '../i18n';

const PRINT_KEY = 'food_pos_handover_print_receipt';

function loadPrintPref() {
  try {
    return localStorage.getItem(PRINT_KEY) !== '0';
  } catch {
    return true;
  }
}
function savePrintPref(on) {
  try {
    localStorage.setItem(PRINT_KEY, on ? '1' : '0');
  } catch {
    /* storage ไม่พร้อมใช้งาน */
  }
}

/** สแกนด้วยกล้องได้เมื่อเบราว์เซอร์มี BarcodeDetector (Chrome บน Android) และเปิดผ่าน HTTPS/localhost */
const cameraSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && window.isSecureContext;

/** วันนี้ตามเวลาเครื่อง: YYYY-MM-DD (ตัวกรอง API) / YYYYMMDD (ส่วนหน้าของเลขออเดอร์) */
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayCompact = () => todayYmd().replaceAll('-', '');

const placeText = (o) => (o.orderType === 'dine_in' && o.tableNo ? t('โต๊ะ {0}', [o.tableNo]) : ORDER_TYPE[o.orderType]);

/**
 * จุดเช็คบิล & ส่งมอบ: สแกนบาร์โค้ดสติ๊กเกอร์กล่อง -> ตรวจว่าครบทุกกล่อง/ชำระแล้ว/ครัวทำเสร็จ
 * -> กดส่งมอบ (status = delivered) และพิมพ์ใบเสร็จให้ลูกค้า
 * รองรับเครื่องสแกนแบบคีย์บอร์ด (พิมพ์รหัสแล้วกด Enter), พิมพ์เลขเอง และกล้อง (ถ้ารองรับ)
 */
export default function HandoverPage() {
  const [current, setCurrent] = useState(null); // { order, boxes }
  const [scanned, setScanned] = useState(() => new Set());
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [paying, setPaying] = useState(false);
  const [camera, setCamera] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(loadPrintPref);
  const [waiting, setWaiting] = useState(null);
  const [waitingError, setWaitingError] = useState(null);
  const inputRef = useRef(null);
  const currentRef = useRef(null);
  currentRef.current = current;

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0);

  const loadWaiting = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setWaiting(null);
    setWaitingError(null);
    try {
      // ออเดอร์ของวันนี้ที่ครัวทำเสร็จแล้วแต่ยังไม่ส่งมอบ (ออเดอร์วันก่อนสแกน/พิมพ์เลขเต็มได้)
      const data = await getOrders({ status: 'completed', date: todayYmd(), pageSize: 100 });
      setWaiting(data.orders);
    } catch (err) {
      if (!silent) setWaitingError(err.userMessage);
    }
  }, []);

  useEffect(() => {
    loadWaiting();
    focusInput();
  }, [loadWaiting]);

  useSocketEvent('order:updated', ({ order }) => {
    if (currentRef.current?.order.id === order.id) setCurrent((c) => c && { ...c, order });
    loadWaiting({ silent: true });
  });
  useSocketReconnect(() => loadWaiting({ silent: true }));

  /** รับรหัสจากเครื่องสแกน/กล้อง/พิมพ์เอง */
  const handleCode = useCallback(async (raw) => {
    let value = normalizeScan(raw);
    // พิมพ์เลขสั้น เช่น "12" หรือ "0012" = ออเดอร์ของวันนี้
    if (/^\d{1,4}$/.test(value)) value = `${todayCompact()}-${value.padStart(4, '0')}`;
    const parsed = parseBoxCode(value);
    if (!parsed) {
      showError(t('รูปแบบบาร์โค้ดไม่ถูกต้อง'));
      return;
    }
    const cur = currentRef.current;
    if (cur && cur.order.orderNo === parsed.orderNo) {
      if (parsed.box) {
        if (parsed.box > cur.boxes) return showError(t('ออเดอร์ {0} มีเพียง {1} กล่อง', [cur.order.orderNo, cur.boxes]));
        setScanned((s) => new Set(s).add(parsed.box));
      }
      return;
    }
    setLooking(true);
    try {
      const res = await lookupOrderByCode(value);
      setCurrent({ order: res.order, boxes: res.boxes });
      setScanned(new Set(res.box ? [res.box] : []));
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setLooking(false);
    }
  }, []);

  const submitCode = async (e) => {
    e.preventDefault();
    const value = code.trim();
    setCode('');
    if (value) await handleCode(value);
    focusInput();
  };

  const selectOrder = (order) => handleCode(order.orderNo).then(focusInput);

  const clear = () => {
    setCurrent(null);
    setScanned(new Set());
    focusInput();
  };

  const togglePrint = (on) => {
    setPrintReceipt(on);
    savePrintPref(on);
  };

  const deliver = async () => {
    const { order, boxes } = current;
    if (scanned.size < boxes) {
      const ok = await Swal.fire({
        icon: 'warning',
        title: t('สแกนยังไม่ครบ'),
        text: t('สแกนแล้ว {0}/{1} กล่อง — ส่งมอบเลยหรือไม่?', [scanned.size, boxes]),
        showCancelButton: true,
        confirmButtonText: t('ส่งมอบ'),
        cancelButtonText: t('ยกเลิก'),
        confirmButtonColor: '#166534',
      });
      if (!ok.isConfirmed) return focusInput();
    }
    setDelivering(true);
    try {
      const res = await updateOrderStatus(order.id, 'delivered');
      if (printReceipt) printReceiptOnly(order.id);
      toastSuccess(res.message);
      setCurrent(null);
      setScanned(new Set());
      loadWaiting({ silent: true });
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setDelivering(false);
      focusInput();
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t('เช็คบิล & ส่งมอบ')}
        description={t('สแกนบาร์โค้ดบนสติ๊กเกอร์กล่อง ตรวจให้ครบทุกกล่อง แล้วส่งมอบพร้อมใบเสร็จ')}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <form onSubmit={submitCode} className="card flex flex-wrap items-center gap-2 p-4">
            <ScanBarcode className="shrink-0 text-primary-800" />
            <input
              ref={inputRef}
              className="input w-auto min-w-0 flex-1 basis-48 py-3 text-lg"
              placeholder={t('สแกนบาร์โค้ด หรือพิมพ์เลขคิว (เช่น 12) แล้วกด Enter')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              inputMode="numeric"
              aria-label={t('บาร์โค้ด')}
            />
            <button className="btn-primary py-3" disabled={looking || !code.trim()}>
              {looking ? <Loader2 size={16} className="animate-spin" /> : <ScanBarcode size={16} />} {t('ค้นหา')}
            </button>
            {cameraSupported() && (
              <button type="button" className="btn-outline py-3" onClick={() => setCamera(true)}>
                <Camera size={16} /> {t('สแกนด้วยกล้อง')}
              </button>
            )}
          </form>

          {current ? (
            <CurrentOrder
              order={current.order}
              boxes={current.boxes}
              scanned={scanned}
              delivering={delivering}
              printReceipt={printReceipt}
              onTogglePrint={togglePrint}
              onDeliver={deliver}
              onPay={() => setPaying(true)}
              onClear={clear}
            />
          ) : (
            <div className="card flex flex-col items-center gap-2 px-4 py-14 text-center text-slate-500">
              <PackageCheck size={40} className="text-slate-300" />
              <p>{t('สแกนบาร์โค้ดบนสติ๊กเกอร์กล่องเพื่อเริ่มส่งมอบ')}</p>
              <p className="text-xs">{t('หรือเลือกจากรายการ "รอส่งมอบ"')}</p>
            </div>
          )}
        </div>

        <aside className="card min-w-0 self-start p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-semibold">
              {t('รอส่งมอบ')} {waiting && <span className="badge bg-slate-100 text-slate-700">{waiting.length}</span>}
            </h2>
            <button className="btn-icon h-8 w-8" onClick={() => loadWaiting()} title={t('รีเฟรช')} aria-label={t('รีเฟรช')}>
              <RefreshCw size={15} />
            </button>
          </div>
          {waitingError ? (
            <ErrorState message={waitingError} onRetry={loadWaiting} />
          ) : !waiting ? (
            <LoadingState />
          ) : waiting.length === 0 ? (
            <EmptyState text={t('ไม่มีออเดอร์ที่รอส่งมอบ')} />
          ) : (
            <ul className="space-y-1.5">
              {waiting.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => selectOrder(o)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50 ${current?.order.id === o.id ? 'border-primary-800 bg-primary-50' : 'border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        #{o.orderNo.split('-')[1]} <span className="font-normal text-slate-600">{placeText(o)}</span>
                      </span>
                      <span className="text-xs text-slate-500">{formatTime(o.completedAt)}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {o.items.map((i) => `${i.quantity}× ${localName(i, 'menuName')}`).join(', ')}
                    </div>
                    {o.paymentStatus !== 'paid' && <span className="badge mt-1 bg-red-100 text-red-700">{t('ยังไม่ชำระ')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {camera && (
        <CameraScanner
          onDetect={handleCode}
          onClose={() => {
            setCamera(false);
            focusInput();
          }}
        />
      )}
      {paying && current && (
        <PaymentModal
          order={current.order}
          onClose={() => {
            setPaying(false);
            focusInput();
          }}
          onPaid={(order) => setCurrent((c) => c && { ...c, order })}
        />
      )}
    </div>
  );
}

function Badge({ map, value }) {
  const s = map[value];
  return s ? <span className={`badge ${s.className}`}>{s.label}</span> : null;
}

function CurrentOrder({ order, boxes, scanned, delivering, printReceipt, onTogglePrint, onDeliver, onPay, onClear }) {
  const labels = buildBoxLabels(order.items);
  const PlaceIcon = order.orderType === 'dine_in' ? Utensils : ShoppingBag;
  const delivered = order.status === 'delivered';
  const cancelled = order.status === 'cancelled';
  const notReady = order.status === 'pending' || order.status === 'preparing';
  const unpaid = order.paymentStatus !== 'paid';
  const canDeliver = order.status === 'completed' && !unpaid && !delivering;
  const allScanned = scanned.size >= boxes;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-2xl font-bold">
            #{order.orderNo.split('-')[1]}
            <span className="inline-flex items-center gap-1 text-base font-normal text-slate-600">
              <PlaceIcon size={16} /> {placeText(order)}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {order.orderNo} · {t('สั่งเมื่อ')} {formatDateTime(order.createdAt)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge map={ORDER_STATUS} value={order.status} />
          <Badge map={PAYMENT_STATUS} value={order.paymentStatus} />
          <button className="btn-icon h-8 w-8" onClick={onClear} title={t('ล้าง')} aria-label={t('ล้าง')}>
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3">
        {delivered && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
            {t('ส่งมอบแล้วเมื่อ {0}', [formatDateTime(order.deliveredAt)])}
            {order.deliveredByName && ` · ${order.deliveredByName}`}
          </p>
        )}
        {cancelled && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{t('ออเดอร์นี้ถูกยกเลิกแล้ว')}</p>}
        {notReady && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('ครัวยังทำไม่เสร็จ — ส่งมอบได้เมื่อครัวกด "เสร็จแล้ว"')}
          </p>
        )}
        {unpaid && !cancelled && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{t('ยังไม่ได้ชำระเงิน ({0}) — ต้องชำระก่อนส่งมอบ', [formatCurrency(order.total)])}</span>
            <button className="btn-outline bg-white px-3 py-1.5" onClick={onPay}>
              {t('รับชำระเงิน')}
            </button>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium">
            {t('กล่องที่สแกนแล้ว')}{' '}
            <span className={allScanned ? 'text-success' : 'text-warning'}>
              {scanned.size}/{boxes}
            </span>
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {labels.map((l) => {
              const ok = scanned.has(l.no);
              return (
                <li
                  key={l.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ok ? 'border-green-300 bg-green-50' : 'border-dashed border-slate-300'}`}
                >
                  {ok ? <CircleCheck size={18} className="shrink-0 text-green-600" /> : <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-slate-300" />}
                  <span className="shrink-0 font-semibold tabular-nums">
                    {l.no}/{l.total}
                  </span>
                  <span className="truncate">{localName(l.item, 'menuName')}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">{t('รายละเอียดรายการ')}</summary>
          <div className="mt-2">
            <OrderItems items={order.items} />
          </div>
        </details>
      </div>

      {!delivered && !cancelled && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={printReceipt} onChange={(e) => onTogglePrint(e.target.checked)} />
            {t('พิมพ์ใบเสร็จเมื่อส่งมอบ')}
          </label>
          <button className="btn-primary px-6 py-3 text-base" disabled={!canDeliver} onClick={onDeliver}>
            {delivering ? <Loader2 size={18} className="animate-spin" /> : <PackageCheck size={18} />} {t('ส่งมอบ')}
          </button>
        </footer>
      )}
    </section>
  );
}

/** สแกนบาร์โค้ดด้วยกล้อง (BarcodeDetector) — อ่านซ้ำรหัสเดิมได้หลังผ่านไป 2 วินาที */
function CameraScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stream;
    let timer;
    let stopped = false;
    const last = { value: '', at: 0 };
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['code_128'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(videoRef.current);
            const value = found[0]?.rawValue;
            const now = Date.now();
            if (value && (value !== last.value || now - last.at > 2000)) {
              last.value = value;
              last.at = now;
              navigator.vibrate?.(80);
              onDetect(value);
            }
          } catch {
            /* เฟรมนี้อ่านไม่ได้ — ลองเฟรมถัดไป */
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError(t('เปิดกล้องไม่ได้ — ตรวจสอบสิทธิ์การใช้กล้องของเบราว์เซอร์'));
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
      {error ? (
        <p className="rounded-lg bg-white px-4 py-3 text-sm text-danger">{error}</p>
      ) : (
        <video ref={videoRef} className="max-h-[70vh] w-full max-w-lg rounded-xl bg-black" muted playsInline />
      )}
      <p className="text-sm text-white">{t('เล็งกล้องไปที่บาร์โค้ดบนสติ๊กเกอร์ — สแกนต่อได้หลายกล่อง')}</p>
      <button className="btn bg-white text-slate-800" onClick={onClose}>
        <X size={16} /> {t('ปิดกล้อง')}
      </button>
    </div>
  );
}
