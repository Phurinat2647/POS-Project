import { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Swal from 'sweetalert2';
import Modal from './Modal';
import { getSettings } from '../services/settings.service';
import { openReceipt, payOrder } from '../services/order.service';
import { showError } from '../utils/alert';
import { formatCurrency } from '../utils/format';
import { toBaht, toSatang } from '../utils/money';
import { promptPayPayload } from '../utils/promptpay';
import { t } from '../i18n';

const METHODS = [
  { value: 'cash', label: t('เงินสด'), icon: Banknote },
  { value: 'promptpay', label: 'PromptPay', icon: QrCode },
];

/** ส่วนลด (สตางค์) — สูตรเดียวกับ backend payment.service (ยอดจริงคำนวณที่ Backend) */
function discountSatang(subtotalSatang, type, value) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  return type === 'percent' ? Math.round((subtotalSatang * v) / 100) : toSatang(v);
}

/** ปุ่มลัดจำนวนเงินที่รับ: พอดี + ปัดขึ้นเป็นแบงก์ */
function quickAmounts(totalSatang) {
  const tx = toBaht(totalSatang);
  const list = [tx, Math.ceil(tx / 10) * 10, Math.ceil(tx / 100) * 100, Math.ceil(tx / 500) * 500, Math.ceil(tx / 1000) * 1000];
  return [...new Set(list)].filter((x) => x >= tx).slice(0, 5);
}

/**
 * รับชำระเงิน: ส่วนลด (บาท/%), เงินสด (คำนวณเงินทอน) หรือ PromptPay (แสดง QR ตามยอด)
 * onPaid(order) เรียกเมื่อชำระสำเร็จ
 */
export default function PaymentModal({ order, onClose, onPaid }) {
  const [method, setMethod] = useState('cash');
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [received, setReceived] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [promptpayId, setPromptpayId] = useState(null); // null = กำลังโหลด
  const [qr, setQr] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = toSatang(order.subtotal);
  const discount = discountSatang(subtotal, discountType, discountValue);
  const discountError =
    discountType === 'percent' && Number(discountValue) > 100
      ? t('ส่วนลดต้องไม่เกิน 100%')
      : discount > subtotal
        ? t('ส่วนลดต้องไม่มากกว่ายอดรวม')
        : Number(discountValue) < 0
          ? t('ส่วนลดต้องไม่ติดลบ')
          : null;
  const total = discountError ? subtotal : subtotal - discount;
  const receivedSatang = toSatang(received);
  const change = receivedSatang - total;
  const quick = useMemo(() => quickAmounts(total), [total]);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => !cancelled && setPromptpayId(s.promptpayId || ''))
      .catch(() => !cancelled && setPromptpayId(''));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (method !== 'promptpay' || !promptpayId) return;
    const payload = promptPayPayload(promptpayId, toBaht(total));
    if (!payload) return setQr(null);
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [method, promptpayId, total]);

  const canSubmit =
    !submitting && !discountError && (method === 'promptpay' || (received !== '' && change >= 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await payOrder(order.id, {
        method,
        receivedAmount: method === 'cash' ? Number(received) : undefined,
        referenceNo: method === 'promptpay' ? referenceNo.trim() || null : undefined,
        discount: discount > 0 ? { type: discountType, value: Number(discountValue) } : null,
      });
      const paid = res.data;
      onPaid?.(paid);
      onClose();
      Swal.fire({
        icon: 'success',
        title: t('ชำระเงินสำเร็จ'),
        html:
          `${t('ออเดอร์ {0}', [paid.orderNo])}<br/>${t('ยอดชำระ')} <b>${formatCurrency(paid.total)}</b>` +
          (paid.payment.changeAmount > 0
            ? `<div style="margin-top:8px;font-size:1.6rem;font-weight:700;color:#166534">${t('เงินทอน')} ${formatCurrency(paid.payment.changeAmount)}</div>`
            : ''),
        showCancelButton: true,
        confirmButtonText: t('พิมพ์ใบเสร็จ'),
        cancelButtonText: t('ปิด'),
        confirmButtonColor: '#166534',
        // เปิดแท็บใหม่ภายใน event คลิก เพื่อไม่ให้ถูก popup blocker บล็อก
        preConfirm: () => {
          openReceipt(paid.id);
          return true;
        },
      });
    } catch (err) {
      showError(err.userMessage, t('ชำระเงินไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t('ชำระเงิน · {0}', [order.orderNo])}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={submitting}>
            {t('ยกเลิก')}
          </button>
          <button type="submit" form="payment-form" className="btn-primary" disabled={!canSubmit}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {method === 'cash' ? t('ยืนยันรับเงิน') : t('ยืนยันได้รับเงินโอนแล้ว')}
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">{t('ยอดรวมรายการ')}</dt>
            <dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd>
          </div>
          {discount > 0 && !discountError && (
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('ส่วนลด')}</dt>
              <dd className="tabular-nums text-danger">-{formatCurrency(toBaht(discount))}</dd>
            </div>
          )}
          <div className="flex items-end justify-between pt-1">
            <dt className="font-medium">{t('ยอดที่ต้องชำระ')}</dt>
            <dd className="text-2xl font-semibold text-primary-800 tabular-nums">{formatCurrency(toBaht(total))}</dd>
          </div>
        </dl>

        <div>
          <label className="label" htmlFor="discount">{t('ส่วนลด (ถ้ามี)')}</label>
          <div className="flex gap-2">
            <input
              id="discount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="input"
              placeholder="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
            <div className="flex shrink-0 rounded-xl border border-slate-300 p-0.5" role="group" aria-label={t('ประเภทส่วนลด')}>
              {[
                ['amount', t('บาท')],
                ['percent', '%'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={discountType === v}
                  onClick={() => setDiscountType(v)}
                  className={`rounded-lg px-3 text-sm ${discountType === v ? 'bg-primary-800 text-white' : 'text-slate-600'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {discountError && <p className="mt-1 text-xs text-danger">{discountError}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              aria-pressed={method === value}
              className={`btn border py-3 ${method === value ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>

        {method === 'cash' ? (
          <div>
            <label className="label" htmlFor="received">{t('รับเงินมา (บาท)')}</label>
            <input
              id="received"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="input py-3 text-lg"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((amt, i) => (
                <button key={amt} type="button" className="btn-outline px-3 py-1.5" onClick={() => setReceived(String(amt))}>
                  {i === 0 ? t('พอดี {0}', [formatCurrency(amt)]) : formatCurrency(amt)}
                </button>
              ))}
            </div>
            {received !== '' && (
              <div className={`mt-3 flex items-end justify-between rounded-xl p-3 ${change >= 0 ? 'bg-primary-50' : 'bg-red-50'}`}>
                <span className="text-sm font-medium">{change >= 0 ? t('เงินทอน') : t('ยังขาดอีก')}</span>
                <span className={`text-2xl font-semibold tabular-nums ${change >= 0 ? 'text-primary-800' : 'text-danger'}`}>
                  {formatCurrency(toBaht(Math.abs(change)))}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-slate-200 p-3 text-center">
              {promptpayId === null ? (
                <Loader2 className="animate-spin text-slate-400" />
              ) : !promptpayId ? (
                <p className="text-sm text-slate-500">
                  {t('ยังไม่ได้ตั้งค่าเลข PromptPay ของร้าน')}
                  <br />
                  {t('(ผู้ดูแลตั้งได้ที่เมนู "ตั้งค่าร้าน") — รับโอนแล้วกดยืนยันได้ตามปกติ')}
                </p>
              ) : qr ? (
                <>
                  <img src={qr} alt="QR PromptPay" className="h-56 w-56" />
                  <p className="mt-1 text-sm">
                    {t('สแกนจ่าย')} <b>{formatCurrency(toBaht(total))}</b>
                  </p>
                </>
              ) : (
                <p className="text-sm text-danger">{t('เลข PromptPay ของร้านไม่ถูกต้อง')}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="ref">{t('เลขอ้างอิงการโอน (ถ้ามี)')}</label>
              <input id="ref" className="input" maxLength={100} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500">{t('ระบบไม่ได้ตรวจสอบการโอนอัตโนมัติ — กรุณาตรวจสอบยอดเงินเข้าก่อนกดยืนยัน')}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
