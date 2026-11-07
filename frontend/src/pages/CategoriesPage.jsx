import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { createCategory, deleteCategory, getCategories, updateCategory } from '../services/category.service';
import { confirmDelete, showError, toastSuccess } from '../utils/alert';

const EMPTY = { name: '', description: '', sortOrder: 0, isActive: true };

export default function CategoriesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // null = ปิด, {} = เพิ่ม, {id..} = แก้ไข

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getCategories({ includeInactive: showInactive }));
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (cat) => {
    if (cat.menuCount > 0) {
      showError(`หมวด "${cat.name}" ยังมีเมนู ${cat.menuCount} รายการ กรุณาย้ายหรือลบเมนูก่อน`, 'ไม่สามารถลบได้');
      return;
    }
    if (!(await confirmDelete(`ลบหมวด "${cat.name}"?`, 'การลบไม่สามารถย้อนกลับได้'))) return;
    try {
      const res = await deleteCategory(cat.id);
      toastSuccess(res.message);
      load();
    } catch (err) {
      showError(err.userMessage);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="หมวดหมู่อาหาร"
        description="จัดกลุ่มเมนูสำหรับหน้าขายและรายงาน"
        actions={
          <button className="btn-primary" onClick={() => setEditing(EMPTY)}>
            <Plus size={16} /> เพิ่มหมวดหมู่
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-end border-b border-slate-200 px-4 py-2.5">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-primary-800" />
            แสดงหมวดที่ปิดใช้งาน
          </label>
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState text="ยังไม่มีหมวดหมู่" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-16 px-4 py-2.5 font-medium">ลำดับ</th>
                  <th className="px-4 py-2.5 font-medium">ชื่อหมวดหมู่</th>
                  <th className="px-4 py-2.5 text-right font-medium">จำนวนเมนู</th>
                  <th className="px-4 py-2.5 font-medium">สถานะ</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.id} className={c.isActive ? '' : 'bg-slate-50 text-slate-400'}>
                    <td className="px-4 py-3 tabular-nums">{c.sortOrder}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.menuCount}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}>
                        {c.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-icon" onClick={() => setEditing(c)} aria-label={`แก้ไข ${c.name}`}>
                          <Pencil size={16} />
                        </button>
                        <button className="btn-icon hover:text-danger" onClick={() => handleDelete(c)} aria-label={`ลบ ${c.name}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CategoryForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({ initial, onClose, onSaved }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    name: initial.name,
    description: initial.description || '',
    sortOrder: initial.sortOrder ?? 0,
    isActive: initial.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('กรุณากรอกชื่อหมวดหมู่');
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) || 0 };
      const res = isEdit ? await updateCategory(initial.id, payload) : await createCategory(payload);
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
      title={isEdit ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}
      onClose={onClose}
      busy={saving}
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button className="btn-primary" type="submit" form="category-form" disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}
        <div>
          <label className="label" htmlFor="cat-name">ชื่อหมวดหมู่ *</label>
          <input id="cat-name" className="input" value={form.name} onChange={set('name')} maxLength={100} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="cat-desc">คำอธิบาย</label>
          <input id="cat-desc" className="input" value={form.description} onChange={set('description')} maxLength={255} />
        </div>
        <div>
          <label className="label" htmlFor="cat-sort">ลำดับการแสดงผล</label>
          <input id="cat-sort" type="number" min={0} className="input" value={form.sortOrder} onChange={set('sortOrder')} />
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="accent-primary-800" />
            เปิดใช้งาน
          </label>
        )}
      </form>
    </Modal>
  );
}
