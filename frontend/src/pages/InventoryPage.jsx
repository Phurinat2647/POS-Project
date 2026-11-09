import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, History, Loader2, Pencil, Plus, Scale, Search, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../contexts/AuthContext';
import {
  addStockTransaction,
  createIngredient,
  deleteIngredient,
  getIngredients,
  getStockTransactions,
  updateIngredient,
} from '../services/inventory.service';
import { confirmDelete, showError, toastSuccess } from '../utils/alert';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/format';

export const STOCK_TYPE = {
  in: { label: 'รับเข้า', icon: ArrowDownToLine, className: 'bg-green-100 text-green-800', sign: '+' },
  out: { label: 'เบิกออก', icon: ArrowUpFromLine, className: 'bg-orange-100 text-orange-800', sign: '−' },
  adjust: { label: 'ปรับยอด', icon: Scale, className: 'bg-indigo-100 text-indigo-800', sign: '±' },
};

/** คลังวัตถุดิบ — admin/kitchen ทำรายการรับเข้า/เบิกออก/ปรับยอด, admin เพิ่ม/แก้ไข/ลบวัตถุดิบ */
export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', lowOnly: false, includeInactive: false });
  const [stock, setStock] = useState(null); // { ingredient, type }
  const [editing, setEditing] = useState(null); // ingredient | 'new'
  const [history, setHistory] = useState(null); // { ingredient? }

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getIngredients(filters));
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (ing) => setItems((list) => list.map((i) => (i.id === ing.id ? ing : i)));

  const handleDelete = async (ing) => {
    if (!(await confirmDelete(`ลบวัตถุดิบ "${ing.name}"?`, 'ถ้ามีประวัติการเคลื่อนไหว ระบบจะปิดใช้งานแทนการลบ'))) return;
    try {
      const res = await deleteIngredient(ing.id);
      toastSuccess(res.message);
      load();
    } catch (err) {
      showError(err.userMessage);
    }
  };

  const lowCount = items.filter((i) => i.isActive && i.isLow).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="คลังวัตถุดิบ"
        description="รับเข้า / เบิกออก / ปรับยอดตามที่นับได้จริง — ทุกรายการถูกบันทึกเป็นประวัติ"
        actions={
          <>
            <button className="btn-outline" onClick={() => setHistory({})}>
              <History size={16} /> ประวัติทั้งหมด
            </button>
            {isAdmin && (
              <button className="btn-primary" onClick={() => setEditing('new')}>
                <Plus size={16} /> เพิ่มวัตถุดิบ
              </button>
            )}
          </>
        }
      />

      <div className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="ค้นหาวัตถุดิบ" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary-800"
            checked={filters.lowOnly}
            onChange={(e) => setFilters((f) => ({ ...f, lowOnly: e.target.checked }))}
          />
          เฉพาะใกล้หมด
        </label>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary-800"
              checked={filters.includeInactive}
              onChange={(e) => setFilters((f) => ({ ...f, includeInactive: e.target.checked }))}
            />
            แสดงที่ปิดใช้งาน
          </label>
        )}
      </div>

      {!loading && !error && lowCount > 0 && !filters.lowOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} /> มีวัตถุดิบใกล้หมด {lowCount} รายการ (คงเหลือ ≤ ขั้นต่ำ)
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState text="ไม่พบวัตถุดิบ" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((ing) => (
              <li key={ing.id} className={`flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center ${ing.isActive ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ing.name}</span>
                    {!ing.isActive && <span className="badge bg-slate-200 text-slate-600">ปิดใช้งาน</span>}
                    {ing.isActive && ing.isLow && (
                      <span className="badge bg-red-100 text-red-700">
                        <AlertTriangle size={12} /> ใกล้หมด
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    ขั้นต่ำ {formatNumber(ing.minQuantity)} {ing.unit}
                    {ing.costPerUnit != null && ` · ต้นทุน ${formatCurrency(ing.costPerUnit)}/${ing.unit}`}
                    {ing.lastMovementAt && ` · เคลื่อนไหวล่าสุด ${formatDateTime(ing.lastMovementAt)}`}
                  </div>
                </div>
                <div className={`text-lg font-semibold tabular-nums md:w-40 md:text-right ${ing.isLow ? 'text-danger' : ''}`}>
                  {formatNumber(ing.quantity)} <span className="text-sm font-normal text-slate-500">{ing.unit}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {ing.isActive &&
                    Object.entries(STOCK_TYPE).map(([type, t]) => (
                      <button key={type} className="btn-outline px-2.5 py-1.5" onClick={() => setStock({ ingredient: ing, type })}>
                        <t.icon size={15} /> {t.label}
                      </button>
                    ))}
                  <button className="btn-icon" title="ประวัติ" aria-label="ประวัติ" onClick={() => setHistory({ ingredient: ing })}>
                    <History size={16} />
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn-icon" title="แก้ไข" aria-label="แก้ไข" onClick={() => setEditing(ing)}>
                        <Pencil size={16} />
                      </button>
                      {ing.isActive && (
                        <button className="btn-icon hover:text-danger" title="ลบ" aria-label="ลบ" onClick={() => handleDelete(ing)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {stock && (
        <StockModal
          {...stock}
          onClose={() => setStock(null)}
          onDone={(ing) => {
            replace(ing);
            setStock(null);
          }}
        />
      )}
      {editing && (
        <IngredientFormModal
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {history && <HistoryModal ingredient={history.ingredient} onClose={() => setHistory(null)} />}
    </div>
  );
}

function StockModal({ ingredient, type, onClose, onDone }) {
  const [value, setValue] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const t = STOCK_TYPE[type];

  const num = Number(value);
  const preview =
    value === '' || !Number.isFinite(num)
      ? null
      : type === 'in'
        ? (Math.round(ingredient.quantity * 1000) + Math.round(num * 1000)) / 1000
        : type === 'out'
          ? (Math.round(ingredient.quantity * 1000) - Math.round(num * 1000)) / 1000
          : num;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await addStockTransaction(ingredient.id, {
        type,
        quantity: type === 'adjust' ? undefined : value,
        newBalance: type === 'adjust' ? value : undefined,
        unitCost: type === 'in' && unitCost !== '' ? unitCost : undefined,
        note: note.trim() || null,
      });
      toastSuccess(res.message);
      onDone(res.data.ingredient);
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${t.label} · ${ingredient.name}`}
      onClose={onClose}
      busy={saving}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="submit" form="stock-form" className="btn-primary" disabled={saving || value === ''}>
            {saving && <Loader2 size={16} className="animate-spin" />} บันทึก{t.label}
          </button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          คงเหลือปัจจุบัน <b className="text-slate-800">{formatNumber(ingredient.quantity)} {ingredient.unit}</b>
        </p>
        <div>
          <label className="label" htmlFor="qty">
            {type === 'adjust' ? 'ยอดที่นับได้จริง' : 'จำนวน'} ({ingredient.unit})
          </label>
          <input
            id="qty"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            className="input py-3 text-lg"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
          />
          {preview != null && (
            <p className={`mt-1 text-sm ${preview < 0 ? 'text-danger' : 'text-slate-500'}`}>
              {preview < 0 ? 'คงเหลือไม่พอ' : `คงเหลือหลังบันทึก ${formatNumber(preview)} ${ingredient.unit}`}
            </p>
          )}
        </div>
        {type === 'in' && (
          <div>
            <label className="label" htmlFor="cost">ต้นทุนต่อหน่วย (บาท, ถ้ามี)</label>
            <input id="cost" type="number" inputMode="decimal" min="0" step="0.01" className="input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="note">หมายเหตุ</label>
          <input
            id="note"
            className="input"
            maxLength={255}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === 'in' ? 'เช่น ซื้อจากตลาด' : type === 'out' ? 'เช่น ใช้ทำอาหารวันนี้ / เสีย' : 'เช่น นับสต็อกสิ้นวัน'}
          />
        </div>
      </form>
    </Modal>
  );
}

function IngredientFormModal({ ingredient, onClose, onSaved }) {
  const isNew = !ingredient;
  const [form, setForm] = useState({
    name: ingredient?.name ?? '',
    unit: ingredient?.unit ?? '',
    quantity: '',
    minQuantity: ingredient?.minQuantity ?? '',
    costPerUnit: ingredient?.costPerUnit ?? '',
    isActive: ingredient?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, minQuantity: form.minQuantity === '' ? 0 : form.minQuantity, quantity: form.quantity === '' ? 0 : form.quantity };
      const res = isNew ? await createIngredient(payload) : await updateIngredient(ingredient.id, payload);
      toastSuccess(res.message);
      onSaved();
    } catch (err) {
      showError(err.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={isNew ? 'เพิ่มวัตถุดิบ' : `แก้ไข · ${ingredient.name}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="submit" form="ingredient-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} บันทึก
          </button>
        </>
      }
    >
      <form id="ingredient-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="ing-name">ชื่อวัตถุดิบ <span className="text-danger">*</span></label>
          <input id="ing-name" className="input" maxLength={150} required value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label" htmlFor="ing-unit">หน่วยนับ <span className="text-danger">*</span></label>
          <input id="ing-unit" className="input" maxLength={20} required placeholder="เช่น กิโลกรัม, ฟอง, ลิตร" value={form.unit} onChange={set('unit')} />
        </div>
        {isNew && (
          <div>
            <label className="label" htmlFor="ing-qty">ยอดคงเหลือเริ่มต้น</label>
            <input id="ing-qty" type="number" min="0" step="0.001" className="input" value={form.quantity} onChange={set('quantity')} placeholder="0" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="ing-min">จำนวนขั้นต่ำ (แจ้งเตือน)</label>
          <input id="ing-min" type="number" min="0" step="0.001" className="input" value={form.minQuantity} onChange={set('minQuantity')} placeholder="0" />
        </div>
        <div>
          <label className="label" htmlFor="ing-cost">ต้นทุนต่อหน่วย (บาท)</label>
          <input id="ing-cost" type="number" min="0" step="0.01" className="input" value={form.costPerUnit ?? ''} onChange={set('costPerUnit')} />
        </div>
        {!isNew && (
          <>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="accent-primary-800" checked={form.isActive} onChange={set('isActive')} /> เปิดใช้งาน
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">ยอดคงเหลือแก้ไขผ่าน "รับเข้า / เบิกออก / ปรับยอด" เท่านั้น เพื่อให้มีประวัติตรวจสอบได้</p>
          </>
        )}
      </form>
    </Modal>
  );
}

function HistoryModal({ ingredient, onClose }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getStockTransactions({ ingredientId: ingredient?.id, type, page, pageSize: 20 }));
    } catch (err) {
      setError(err.userMessage);
    }
  }, [ingredient, type, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal open size="lg" title={ingredient ? `ประวัติ · ${ingredient.name}` : 'ประวัติการเคลื่อนไหวทั้งหมด'} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[['', 'ทั้งหมด'], ...Object.entries(STOCK_TYPE).map(([k, t]) => [k, t.label])].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setType(k);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${type === k ? 'bg-primary-800 text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingState />
      ) : data.transactions.length === 0 ? (
        <EmptyState text="ยังไม่มีประวัติ" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.transactions.map((t) => {
              const s = STOCK_TYPE[t.type];
              return (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${s.className}`}>{s.label}</span>
                      {!ingredient && <span className="font-medium">{t.ingredientName}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(t.createdAt)} · {t.createdByName || '-'}
                      {t.unitCost != null && ` · ${formatCurrency(t.unitCost)}/${t.unit}`}
                    </div>
                    {t.note && <div className="text-xs text-slate-600">{t.note}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums">
                      {t.type === 'adjust' ? 'ปรับเป็น ' : s.sign}
                      {formatNumber(t.type === 'adjust' ? t.balanceAfter : t.quantity)} {t.unit}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.type === 'adjust' ? `ส่วนต่าง ${formatNumber(t.quantity)}` : `คงเหลือ ${formatNumber(t.balanceAfter)}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {data.pagination.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">หน้า {data.pagination.page}/{data.pagination.totalPages}</span>
              <div className="flex gap-2">
                <button className="btn-outline px-2.5 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="หน้าก่อน">
                  <ChevronLeft size={16} />
                </button>
                <button className="btn-outline px-2.5 py-1.5" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} aria-label="หน้าถัดไป">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
