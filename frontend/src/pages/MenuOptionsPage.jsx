import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { getCategories } from '../services/category.service';
import { getMenus } from '../services/menu.service';
import { createMenuOption, deleteMenuOption, getMenuOptions, updateMenuOption } from '../services/menuOption.service';
import { confirmDelete, showError, toastSuccess } from '../utils/alert';
import { formatCurrency } from '../utils/format';
import { OPTION_SCOPE, OPTION_TYPE } from '../utils/labels';

const scopeTarget = (o) =>
  o.scope === 'menu' ? `เมนู: ${o.menuName}` : o.scope === 'category' ? `หมวด: ${o.categoryName}` : 'ทุกเมนู';

export default function MenuOptionsPage() {
  const [options, setOptions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ scope: '', categoryId: '', optionType: '' });
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opts, cats, ms] = await Promise.all([getMenuOptions(filters), getCategories(), getMenus()]);
      setOptions(opts);
      setCategories(cats);
      setMenus(ms);
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // จัดกลุ่มตามขอบเขต (ทุกเมนู / หมวด / เมนู) เพื่อให้อ่านง่าย
  const groups = useMemo(() => {
    const map = new Map();
    for (const o of options) {
      const key = scopeTarget(o);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return [...map.entries()];
  }, [options]);

  const handleDelete = async (o) => {
    if (!(await confirmDelete(`ลบตัวเลือก "${o.name}" (${scopeTarget(o)})?`, 'ออเดอร์เก่ายังเก็บชื่อและราคาตัวเลือกไว้ตามเดิม'))) return;
    try {
      const res = await deleteMenuOption(o.id);
      toastSuccess(res.message);
      load();
    } catch (err) {
      showError(err.userMessage);
    }
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="ตัวเลือกเมนู"
        description="ขนาด (เลือกได้ 1 อย่าง) และท็อปปิ้ง (เลือกได้หลายอย่าง) — ผูกกับทุกเมนู ทั้งหมวด หรือเฉพาะเมนู"
        actions={
          <button className="btn-primary" onClick={() => setEditing({})}>
            <Plus size={16} /> เพิ่มตัวเลือก
          </button>
        }
      />

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-3">
        <select className="input" value={filters.scope} onChange={setFilter('scope')} aria-label="ขอบเขต">
          <option value="">ทุกขอบเขต</option>
          {Object.entries(OPTION_SCOPE).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className="input" value={filters.categoryId} onChange={setFilter('categoryId')} aria-label="หมวดหมู่">
          <option value="">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input" value={filters.optionType} onChange={setFilter('optionType')} aria-label="ประเภท">
          <option value="">ทุกประเภท</option>
          {Object.entries(OPTION_TYPE).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      {loading && options.length === 0 ? (
        <div className="card"><LoadingState /></div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : groups.length === 0 ? (
        <div className="card"><EmptyState text="ไม่พบตัวเลือก" /></div>
      ) : (
        <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {groups.map(([title, list]) => (
            <div key={title} className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium">{title}</div>
              <ul className="divide-y divide-slate-100">
                {list.map((o) => (
                  <li key={o.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${o.isActive ? '' : 'text-slate-400'}`}>
                    <span className={`badge w-16 justify-center ${OPTION_TYPE[o.optionType].className}`}>{OPTION_TYPE[o.optionType].label}</span>
                    <span className="flex-1">
                      {o.name}
                      {o.isDefault && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-amber-600">
                          <Star size={12} fill="currentColor" /> ค่าเริ่มต้น
                        </span>
                      )}
                      {!o.isActive && <span className="ml-2 text-xs">(ปิดใช้งาน)</span>}
                    </span>
                    <span className="tabular-nums text-slate-600">+{formatCurrency(o.extraPrice)}</span>
                    <div className="flex gap-1">
                      <button className="btn-icon" onClick={() => setEditing(o)} aria-label={`แก้ไข ${o.name}`}>
                        <Pencil size={16} />
                      </button>
                      <button className="btn-icon hover:text-danger" onClick={() => handleDelete(o)} aria-label={`ลบ ${o.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <OptionForm
          initial={editing}
          categories={categories}
          menus={menus}
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

function OptionForm({ initial, categories, menus, onClose, onSaved }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    scope: initial.scope ?? 'category',
    categoryId: initial.categoryId ?? categories[0]?.id ?? '',
    menuId: initial.menuId ?? menus[0]?.id ?? '',
    optionType: initial.optionType ?? 'topping',
    name: initial.name ?? '',
    extraPrice: initial.extraPrice ?? 0,
    isDefault: initial.isDefault ?? false,
    sortOrder: initial.sortOrder ?? 0,
    isActive: initial.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('กรุณากรอกชื่อตัวเลือก');
    const price = Number(form.extraPrice);
    if (!Number.isFinite(price) || price < 0) return setError('ราคาเพิ่มต้องเป็นตัวเลขที่ไม่ติดลบ');

    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        extraPrice: price,
        sortOrder: Number(form.sortOrder) || 0,
        isDefault: form.optionType === 'size' && form.isDefault,
      };
      const res = isEdit ? await updateMenuOption(initial.id, payload) : await createMenuOption(payload);
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
      title={isEdit ? 'แก้ไขตัวเลือก' : 'เพิ่มตัวเลือก'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button className="btn-primary" type="submit" form="option-form" disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="option-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="opt-scope">ใช้กับ</label>
            <select id="opt-scope" className="input" value={form.scope} onChange={set('scope')}>
              {Object.entries(OPTION_SCOPE).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {form.scope === 'category' && (
            <div>
              <label className="label" htmlFor="opt-cat">หมวดหมู่</label>
              <select id="opt-cat" className="input" value={form.categoryId} onChange={set('categoryId')}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {form.scope === 'menu' && (
            <div>
              <label className="label" htmlFor="opt-menu">เมนู</label>
              <select id="opt-menu" className="input" value={form.menuId} onChange={set('menuId')}>
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <span className="label">ประเภท</span>
          <div className="flex gap-4 text-sm">
            {Object.entries(OPTION_TYPE).map(([v, { label, hint }]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="optionType" value={v} checked={form.optionType === v} onChange={set('optionType')} className="accent-primary-800" />
                {label} <span className="text-xs text-slate-400">({hint})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px_100px]">
          <div>
            <label className="label" htmlFor="opt-name">ชื่อตัวเลือก *</label>
            <input id="opt-name" className="input" value={form.name} onChange={set('name')} maxLength={100} placeholder="เช่น ไข่ดาว, พิเศษ" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="opt-price">ราคาเพิ่ม (บาท)</label>
            <input id="opt-price" type="number" min={0} step="0.01" className="input" value={form.extraPrice} onChange={set('extraPrice')} />
          </div>
          <div>
            <label className="label" htmlFor="opt-sort">ลำดับ</label>
            <input id="opt-sort" type="number" min={0} className="input" value={form.sortOrder} onChange={set('sortOrder')} />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {form.optionType === 'size' && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isDefault} onChange={set('isDefault')} className="accent-primary-800" />
              เป็นค่าเริ่มต้นของกลุ่มขนาด
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="accent-primary-800" />
            เปิดใช้งาน
          </label>
        </div>
      </form>
    </Modal>
  );
}
