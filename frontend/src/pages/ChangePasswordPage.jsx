import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { changePassword } from '../services/auth.service';

const MIN_LENGTH = 8;
const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-200';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.current || !form.next || !form.confirm) return setError('กรุณากรอกข้อมูลให้ครบถ้วน');
    if (form.next.length < MIN_LENGTH) return setError(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_LENGTH} ตัวอักษร`);
    if (form.next !== form.confirm) return setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');

    setSubmitting(true);
    setError(null);
    try {
      const res = await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      Swal.fire({ icon: 'success', title: res.message || 'เปลี่ยนรหัสผ่านสำเร็จ', confirmButtonColor: '#166534' });
    } catch (err) {
      setError(err.userMessage || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6">
        <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <KeyRound size={20} /> เปลี่ยนรหัสผ่าน
        </h1>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field id="current" label="รหัสผ่านปัจจุบัน" autoComplete="current-password" value={form.current} onChange={set('current')} />
          <Field id="next" label={`รหัสผ่านใหม่ (อย่างน้อย ${MIN_LENGTH} ตัวอักษร)`} autoComplete="new-password" value={form.next} onChange={set('next')} />
          <Field id="confirm" label="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
            {submitting && <Loader2 className="animate-spin" size={18} />}
            {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ id, label, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} type="password" className={inputClass} {...props} />
    </div>
  );
}
