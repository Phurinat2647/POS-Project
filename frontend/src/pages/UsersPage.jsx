import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../contexts/AuthContext';
import { createUser, deleteUser, getRoles, getUsers, resetUserPassword, updateUser } from '../services/user.service';
import { confirmDelete, showError, toastSuccess } from '../utils/alert';
import { formatDateTime } from '../utils/format';
import { t, tApi } from '../i18n';

const ROLE_BADGE = {
  admin: 'bg-purple-100 text-purple-800',
  cashier: 'bg-blue-100 text-blue-800',
  kitchen: 'bg-amber-100 text-amber-800',
};

const EMPTY = { username: '', password: '', fullName: '', phone: '', role: 'cashier', isActive: true };
const MIN_PASSWORD = 8;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null = ปิด, EMPTY = เพิ่ม, user = แก้ไข
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, r] = await Promise.all([getUsers(), getRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (u) => {
    if (!(await confirmDelete(t('ลบผู้ใช้ "{0}"?', [u.username]), t('ถ้าผู้ใช้นี้เคยทำรายการ ระบบจะปิดใช้งานแทนการลบ เพื่อเก็บประวัติไว้')))) {
      return;
    }
    try {
      const res = await deleteUser(u.id);
      toastSuccess(res.message);
      load();
    } catch (err) {
      showError(err.userMessage);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('ผู้ใช้งาน')}
        description={t('บัญชีพนักงานและสิทธิ์การใช้งาน — ปิดใช้งานแล้วจะออกจากระบบทันที')}
        actions={
          <button className="btn-primary" onClick={() => setEditing(EMPTY)} disabled={!roles.length}>
            <Plus size={16} /> {t('เพิ่มผู้ใช้')}
          </button>
        }
      />

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState text={t('ยังไม่มีผู้ใช้')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('ชื่อผู้ใช้')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('ตำแหน่ง')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('เบอร์โทร')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('เข้าสู่ระบบล่าสุด')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('สถานะ')}</th>
                  <th className="w-32 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isMe = u.id === me.id;
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50 text-slate-400'}>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {u.fullName} {isMe && <span className="text-xs font-normal text-primary-800">{t('(คุณ)')}</span>}
                        </div>
                        <div className="text-xs text-slate-500">{u.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-700'}`}>{tApi(u.roleDisplayName)}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{u.phone || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('ยังไม่เคย')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}>
                          {u.isActive ? t('ใช้งาน') : t('ปิดใช้งาน')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button className="btn-icon" onClick={() => setEditing(u)} aria-label={t('แก้ไข {0}', [u.username])} title={t('แก้ไข')}>
                            <Pencil size={16} />
                          </button>
                          {!isMe && (
                            <>
                              <button
                                className="btn-icon"
                                onClick={() => setResetting(u)}
                                aria-label={t('ตั้งรหัสผ่านใหม่ {0}', [u.username])}
                                title={t('ตั้งรหัสผ่านใหม่')}
                              >
                                <KeyRound size={16} />
                              </button>
                              <button
                                className="btn-icon hover:text-danger"
                                onClick={() => handleDelete(u)}
                                aria-label={t('ลบ {0}', [u.username])}
                                title={t('ลบ')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <UserForm
          initial={editing}
          roles={roles}
          isMe={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {resetting && <ResetPasswordForm user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function ErrorBox({ error }) {
  return error ? <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null;
}

function UserForm({ initial, roles, isMe, onClose, onSaved }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    username: initial.username,
    password: '',
    fullName: initial.fullName,
    phone: initial.phone || '',
    role: initial.role,
    isActive: initial.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!isEdit) {
      if (!/^[a-zA-Z0-9._-]{3,50}$/.test(form.username.trim())) {
        return setError(t('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ความยาว 3-50 ตัวอักษร'));
      }
      if (form.password.length < MIN_PASSWORD) return setError(t('รหัสผ่านต้องมีอย่างน้อย {0} ตัวอักษร', [MIN_PASSWORD]));
    }
    if (!form.fullName.trim()) return setError(t('กรุณากรอกชื่อ-นามสกุล'));
    setSaving(true);
    setError(null);
    try {
      const profile = { fullName: form.fullName, phone: form.phone, role: form.role };
      const res = isEdit
        ? await updateUser(initial.id, { ...profile, isActive: form.isActive })
        : await createUser({ ...profile, username: form.username.trim(), password: form.password });
      toastSuccess(res.message);
      onSaved();
    } catch (err) {
      setError(err.userMessage);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={isEdit ? t('แก้ไขผู้ใช้ {0}', [initial.username]) : t('เพิ่มผู้ใช้')}
      onClose={onClose}
      busy={saving}
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            {t('ยกเลิก')}
          </button>
          <button className="btn-primary" type="submit" form="user-form" disabled={saving}>
            {saving ? t('กำลังบันทึก...') : t('บันทึก')}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox error={error} />
        {!isEdit && (
          <>
            <div>
              <label className="label" htmlFor="user-username">{t('ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ) *')}</label>
              <input
                id="user-username"
                className="input"
                value={form.username}
                onChange={set('username')}
                maxLength={50}
                autoComplete="off"
                autoCapitalize="none"
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="user-password">{t('รหัสผ่าน * (อย่างน้อย')} {MIN_PASSWORD} {t('ตัวอักษร)')}</label>
              <input
                id="user-password"
                type="password"
                className="input"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="user-fullname">{t('ชื่อ-นามสกุล *')}</label>
          <input id="user-fullname" className="input" value={form.fullName} onChange={set('fullName')} maxLength={150} autoFocus={isEdit} />
        </div>
        <div>
          <label className="label" htmlFor="user-phone">{t('เบอร์โทร')}</label>
          <input id="user-phone" type="tel" className="input" value={form.phone} onChange={set('phone')} maxLength={20} />
        </div>
        <div>
          <label className="label" htmlFor="user-role">{t('ตำแหน่ง *')}</label>
          <select id="user-role" className="input" value={form.role} onChange={set('role')} disabled={isMe}>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {tApi(r.displayName)}
              </option>
            ))}
          </select>
          {isMe && <p className="mt-1 text-xs text-slate-500">{t('ไม่สามารถเปลี่ยนตำแหน่งของตัวเองได้')}</p>}
        </div>
        {isEdit && !isMe && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="accent-primary-800" />
            {t('เปิดใช้งาน (ปิดแล้วผู้ใช้จะออกจากระบบทันที)')}
          </label>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordForm({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t('รหัสผ่านต้องมีอย่างน้อย {0} ตัวอักษร', [MIN_PASSWORD]));
    if (password !== confirm) return setError(t('ยืนยันรหัสผ่านไม่ตรงกัน'));
    setSaving(true);
    setError(null);
    try {
      const res = await resetUserPassword(user.id, password);
      toastSuccess(res.message);
      onClose();
    } catch (err) {
      setError(err.userMessage);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('ตั้งรหัสผ่านใหม่ — {0}', [user.username])}
      onClose={onClose}
      busy={saving}
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            {t('ยกเลิก')}
          </button>
          <button className="btn-primary" type="submit" form="reset-form" disabled={saving}>
            {saving ? t('กำลังบันทึก...') : t('ตั้งรหัสผ่าน')}
          </button>
        </>
      }
    >
      <form id="reset-form" onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox error={error} />
        <div>
          <label className="label" htmlFor="reset-password">{t('รหัสผ่านใหม่')}</label>
          <input
            id="reset-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="reset-confirm">{t('ยืนยันรหัสผ่านใหม่')}</label>
          <input
            id="reset-confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <p className="text-xs text-slate-500">{t('แจ้งรหัสผ่านใหม่ให้พนักงาน และแนะนำให้เปลี่ยนเองที่หน้า "เปลี่ยนรหัสผ่าน"')}</p>
      </form>
    </Modal>
  );
}
