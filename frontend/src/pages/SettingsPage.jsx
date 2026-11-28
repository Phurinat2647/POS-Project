import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import QRCode from 'qrcode';
import PageHeader from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { getSettings, updateSettings } from '../services/settings.service';
import { showError, toastSuccess } from '../utils/alert';
import { promptPayPayload } from '../utils/promptpay';
import { t } from '../i18n';

const FIELDS = [
  { key: 'shopName', label: t('ชื่อร้าน'), required: true, max: 150 },
  { key: 'shopAddress', label: t('ที่อยู่'), textarea: true, max: 300 },
  { key: 'shopPhone', label: t('เบอร์โทร'), max: 30 },
  { key: 'taxId', label: t('เลขประจำตัวผู้เสียภาษี (ถ้ามี)'), max: 20, hint: t('ตัวเลข 13 หลัก — แสดงบนใบเสร็จ') },
  { key: 'promptpayId', label: 'PromptPay', max: 30, hint: t('เบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก — ใช้สร้าง QR ตอนรับชำระ') },
  { key: 'receiptFooter', label: t('ข้อความท้ายใบเสร็จ'), max: 200 },
];

/** ตั้งค่าข้อมูลร้าน (admin) — ใช้กับใบเสร็จและ QR PromptPay */
export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setForm(null);
    try {
      setForm(await getSettings());
    } catch (err) {
      setError(err.userMessage);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ตัวอย่าง QR (ไม่ระบุยอด) เพื่อให้ทดลองสแกนตรวจว่าเลขถูกต้อง
  const payload = form ? promptPayPayload(form.promptpayId) : null;
  useEffect(() => {
    if (!payload) return setQr(null);
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 160, margin: 1 }).then((url) => !cancelled && setQr(url));
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateSettings(form);
      setForm(res.data);
      toastSuccess(res.message);
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!form) return <LoadingState />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('ตั้งค่าร้าน')} description={t('ข้อมูลที่แสดงบนใบเสร็จ, VAT และเลข PromptPay สำหรับรับชำระเงิน')} />
      <form onSubmit={submit} className="card space-y-4 p-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>
              {f.label} {f.required && <span className="text-danger">*</span>}
            </label>
            {f.textarea ? (
              <textarea
                id={f.key}
                rows={2}
                className="input"
                maxLength={f.max}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            ) : (
              <input
                id={f.key}
                className="input"
                maxLength={f.max}
                required={f.required}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            )}
            {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
            {f.key === 'promptpayId' && form.promptpayId && (
              <div className="mt-2 flex items-center gap-3">
                {qr ? (
                  <>
                    <img src={qr} alt={t('ตัวอย่าง QR PromptPay')} className="h-28 w-28 rounded-lg border border-slate-200" />
                    <p className="text-xs text-slate-500">{t('ตัวอย่าง QR (ไม่ระบุยอด) — ลองสแกนด้วยแอปธนาคารเพื่อตรวจว่าชื่อบัญชีถูกต้อง')}</p>
                  </>
                ) : (
                  <p className="text-xs text-danger">{t('รูปแบบเลข PromptPay ไม่ถูกต้อง')}</p>
                )}
              </div>
            )}
          </div>
        ))}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium">{t('ภาษีมูลค่าเพิ่ม (VAT)')}</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-800"
              checked={form.vatEnabled}
              onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })}
            />
            <span className="text-sm">{t('คิด VAT บวกเพิ่มจากยอดขาย (หลังหักส่วนลด)')}</span>
          </label>
          {form.vatEnabled && (
            <div className="mt-3 max-w-40">
              <label className="label" htmlFor="vatRate">{t('อัตรา VAT (%)')}</label>
              <input
                id="vatRate"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="30"
                step="0.01"
                required
                className="input"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {t('มีผลกับออเดอร์ที่ชำระหลังจากบันทึก — ใบเสร็จที่ชำระไปแล้วไม่เปลี่ยน')}
          </p>
        </fieldset>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('บันทึก')}
          </button>
        </div>
      </form>
    </div>
  );
}
