import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../contexts/AuthContext';
import { getCategories } from '../services/category.service';
import { createMenu, deleteMenu, getMenus, updateMenu, updateMenuStatus } from '../services/menu.service';
import { confirmDelete, showError, toastSuccess } from '../utils/alert';
import { formatCurrency } from '../utils/format';
import { MENU_STATUS } from '../utils/labels';

const MAX_IMAGE_MB = 5;

export default function MenusPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [categories, setCategories] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ categoryId: '', status: '', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // หน่วงการค้นหาเล็กน้อยระหว่างพิมพ์
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, list] = await Promise.all([getCategories(), getMenus(filters)]);
      setCategories(cats);
      setMenus(list);
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (menu) => {
    const next = menu.status === 'available' ? 'sold_out' : 'available';
    setBusyId(menu.id);
    try {
      const res = await updateMenuStatus(menu.id, next);
      setMenus((list) => list.map((m) => (m.id === menu.id ? res.data : m)).filter((m) => !filters.status || m.status === filters.status));
      toastSuccess(res.message);
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (menu) => {
    if (!(await confirmDelete(`ลบเมนู "${menu.name}"?`, 'ถ้าเมนูนี้เคยถูกขาย ระบบจะเก็บไว้เป็นประวัติแต่จะไม่แสดงในหน้าขาย'))) return;
    try {
      const res = await deleteMenu(menu.id);
      toastSuccess(res.message);
      load();
    } catch (err) {
      showError(err.userMessage);
    }
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="เมนูอาหาร"
        description={isAdmin ? 'เพิ่ม แก้ไข และกำหนดสถานะเมนู' : 'ตั้งสถานะเมนูพร้อมขาย / หมด'}
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setEditing({})} disabled={categories.length === 0}>
              <Plus size={16} /> เพิ่มเมนู
            </button>
          )
        }
      />

      <div className="card mb-4 flex flex-col gap-2 p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="ค้นหาชื่อเมนู"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="ค้นหาชื่อเมนู"
          />
        </div>
        <select className="input sm:w-48" value={filters.categoryId} onChange={setFilter('categoryId')} aria-label="หมวดหมู่">
          <option value="">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input sm:w-40" value={filters.status} onChange={setFilter('status')} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          <option value="available">พร้อมขาย</option>
          <option value="sold_out">หมด</option>
        </select>
      </div>

      {loading && menus.length === 0 ? (
        <div className="card">
          <LoadingState />
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : menus.length === 0 ? (
        <div className="card">
          <EmptyState text={filters.search || filters.categoryId || filters.status ? 'ไม่พบเมนูที่ตรงกับเงื่อนไข' : 'ยังไม่มีเมนู'} />
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">ทั้งหมด {menus.length} เมนู</p>
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${loading ? 'opacity-60' : ''}`}>
            {menus.map((m) => (
              <MenuCard
                key={m.id}
                menu={m}
                isAdmin={isAdmin}
                busy={busyId === m.id}
                onToggle={() => toggleStatus(m)}
                onEdit={() => setEditing(m)}
                onDelete={() => handleDelete(m)}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <MenuForm
          initial={editing}
          categories={categories}
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

function MenuImage({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}>
        <ImageOff size={28} />
      </div>
    );
  }
  return <img src={src} alt={alt} className={`object-cover ${className}`} onError={() => setFailed(true)} loading="lazy" />;
}

function MenuCard({ menu, isAdmin, busy, onToggle, onEdit, onDelete }) {
  const soldOut = menu.status === 'sold_out';
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative">
        <MenuImage src={menu.imageUrl} alt={menu.name} className={`aspect-[4/3] w-full ${soldOut ? 'grayscale' : ''}`} />
        <span className={`badge absolute left-2 top-2 ${MENU_STATUS[menu.status].className}`}>{MENU_STATUS[menu.status].label}</span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="text-xs text-slate-500">{menu.categoryName}</div>
        <div className="line-clamp-2 font-medium leading-snug">{menu.name}</div>
        <div className="mt-1 font-semibold text-primary-800 tabular-nums">{formatCurrency(menu.price)}</div>
        <div className="mt-auto flex items-center gap-1 pt-3">
          <button
            onClick={onToggle}
            disabled={busy}
            className={`btn flex-1 px-2 py-1.5 text-xs ${soldOut ? 'bg-primary-50 text-primary-800 hover:bg-primary-100' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
          >
            {soldOut ? 'เปิดขาย' : 'ตั้งเป็นหมด'}
          </button>
          {isAdmin && (
            <>
              <button className="btn-icon" onClick={onEdit} aria-label={`แก้ไข ${menu.name}`}>
                <Pencil size={16} />
              </button>
              <button className="btn-icon hover:text-danger" onClick={onDelete} aria-label={`ลบ ${menu.name}`}>
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuForm({ initial, categories, onClose, onSaved }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    categoryId: initial.categoryId ?? categories[0]?.id ?? '',
    name: initial.name ?? '',
    description: initial.description ?? '',
    price: initial.price ?? '',
    status: initial.status ?? 'available',
  });
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(initial.imageUrl || null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => () => imageFile && URL.revokeObjectURL(preview), [imageFile, preview]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`ไฟล์รูปภาพต้องมีขนาดไม่เกิน ${MAX_IMAGE_MB} MB`);
    setError(null);
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setPreview(null);
    setRemoveImage(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.categoryId) return setError('กรุณาเลือกหมวดหมู่');
    if (!form.name.trim()) return setError('กรุณากรอกชื่อเมนู');
    const price = Number(form.price);
    if (form.price === '' || !Number.isFinite(price) || price < 0) return setError('กรุณากรอกราคาเป็นตัวเลขที่ไม่ติดลบ');

    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, name: form.name.trim(), imageFile, removeImage: isEdit && removeImage && !imageFile };
      const res = isEdit ? await updateMenu(initial.id, payload) : await createMenu(payload);
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
      title={isEdit ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button className="btn-primary" type="submit" form="menu-form" disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </>
      }
    >
      <form id="menu-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-[180px_1fr]" noValidate>
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger sm:col-span-2">
            {error}
          </div>
        )}

        <div>
          <span className="label">รูปภาพ</span>
          <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-300">
            {preview ? (
              <>
                <img src={preview} alt="ตัวอย่างรูปเมนู" className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  aria-label="ลบรูปภาพ"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-50"
              >
                <ImagePlus size={28} />
                <span className="text-xs">เลือกรูปภาพ</span>
              </button>
            )}
          </div>
          {preview && (
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs text-primary-800 hover:underline">
              เปลี่ยนรูป
            </button>
          )}
          <p className="mt-1 text-xs text-slate-400">JPG, PNG, WEBP ไม่เกิน {MAX_IMAGE_MB} MB</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="menu-name">ชื่อเมนู *</label>
            <input id="menu-name" className="input" value={form.name} onChange={set('name')} maxLength={150} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="menu-cat">หมวดหมู่ *</label>
              <select id="menu-cat" className="input" value={form.categoryId} onChange={set('categoryId')}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="menu-price">ราคา (บาท) *</label>
              <input id="menu-price" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={form.price} onChange={set('price')} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="menu-desc">คำอธิบาย</label>
            <textarea id="menu-desc" rows={2} className="input" value={form.description} onChange={set('description')} maxLength={500} />
          </div>
          <div>
            <span className="label">สถานะ</span>
            <div className="flex gap-4 text-sm">
              {Object.entries(MENU_STATUS).map(([value, { label }]) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="status" value={value} checked={form.status === value} onChange={set('status')} className="accent-primary-800" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
