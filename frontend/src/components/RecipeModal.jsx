import { useCallback, useEffect, useId, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { ErrorState, LoadingState } from './States';
import { getMenuRecipe, saveMenuRecipe } from '../services/menu.service';
import { getIngredients } from '../services/inventory.service';
import { toastSuccess } from '../utils/alert';
import { formatNumber } from '../utils/format';

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * สูตรวัตถุดิบของเมนู (ต่อ 1 จาน) — ใช้ตัดสต็อกอัตโนมัติเมื่อส่งออเดอร์เข้าครัว
 * readOnly: ครัวดูได้อย่างเดียว, admin แก้ไขได้
 * ช่องวัตถุดิบพิมพ์ได้เอง (มีรายชื่อแนะนำ) — ถ้าเป็นชื่อใหม่ต้องใส่หน่วยนับ แล้ว backend สร้างวัตถุดิบให้ตอนบันทึกสูตร
 */
export default function RecipeModal({ menu, readOnly, onClose, onSaved }) {
  const listId = useId();
  const unitListId = useId();
  const [rows, setRows] = useState([]); // [{ key, name, quantity, unit (ใช้เมื่อเป็นวัตถุดิบใหม่) }]
  const [ingredients, setIngredients] = useState([]); // รวมที่ปิดใช้งาน (ใช้ตรวจชื่อ)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [recipe, ings] = await Promise.all([
        getMenuRecipe(menu.id),
        readOnly ? Promise.resolve([]) : getIngredients({ includeInactive: true }),
      ]);
      setIngredients(ings);
      setRows(
        recipe.map((r) => ({
          key: `r-${r.ingredientId}`,
          name: r.name,
          quantity: String(r.quantity),
          unit: '',
          readUnit: r.unit,
          isActive: r.isActive,
        }))
      );
    } catch (err) {
      setLoadError(err.userMessage);
    } finally {
      setLoading(false);
    }
  }, [menu.id, readOnly]);

  useEffect(() => {
    load();
  }, [load]);

  /** วัตถุดิบที่ชื่อตรงกับที่พิมพ์ (ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่างหัวท้าย) */
  const match = (name) => ingredients.find((i) => norm(i.name) === norm(name));
  const activeIngredients = ingredients.filter((i) => i.isActive);
  const units = [...new Set(ingredients.map((i) => i.unit))].sort();

  const update = (key, field, value) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: `new-${Date.now()}`, name: '', quantity: '', unit: '' }]);
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));

  const save = async () => {
    const items = rows.filter((r) => r.name.trim() || r.quantity);
    const payload = [];
    for (const [i, r] of items.entries()) {
      const label = `รายการที่ ${i + 1}`;
      if (!r.name.trim()) return setError(`กรุณาพิมพ์ชื่อวัตถุดิบ${label}`);
      if (!(Number(r.quantity) > 0)) return setError(`ปริมาณ${label} ต้องมากกว่า 0`);
      const found = match(r.name);
      if (found && !found.isActive) {
        return setError(`วัตถุดิบ "${found.name}" ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าคลังวัตถุดิบ หรือลบออกจากสูตร`);
      }
      if (found) payload.push({ ingredientId: found.id, quantity: Number(r.quantity) });
      else {
        if (!r.unit.trim()) return setError(`กรุณาใส่หน่วยนับของวัตถุดิบใหม่ "${r.name.trim()}"`);
        payload.push({ name: r.name.trim(), unit: r.unit.trim(), quantity: Number(r.quantity) });
      }
    }
    if (new Set(items.map((r) => norm(r.name))).size !== items.length) return setError('มีวัตถุดิบซ้ำกันในสูตร');

    setSaving(true);
    setError(null);
    try {
      const res = await saveMenuRecipe(menu.id, payload);
      const newCount = payload.filter((p) => !p.ingredientId).length;
      toastSuccess(newCount ? `${res.message} (เพิ่มวัตถุดิบใหม่ ${newCount} รายการในคลัง)` : res.message);
      onSaved?.(); // สถานะเมนูอาจเปลี่ยนเป็น "หมด" ถ้าวัตถุดิบไม่พอ
      onClose();
    } catch (err) {
      setError(err.userMessage);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`สูตรวัตถุดิบ — ${menu.name}`}
      onClose={onClose}
      busy={saving}
      footer={
        readOnly ? (
          <button className="btn-outline" onClick={onClose}>
            ปิด
          </button>
        ) : (
          <>
            <button className="btn-outline" onClick={onClose} disabled={saving}>
              ยกเลิก
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || loading || !!loadError}>
              {saving ? 'กำลังบันทึก...' : 'บันทึกสูตร'}
            </button>
          </>
        )
      }
    >
      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            ปริมาณที่ใช้ต่อ <b>1 จาน</b> — ระบบตัดสต็อกอัตโนมัติเมื่อส่งออเดอร์เข้าครัว และคืนสต็อกเมื่อยกเลิกออเดอร์
            {!readOnly && ' (วัตถุดิบไม่พอทำ 1 จาน เมนูจะถูกตั้งเป็นหมดจนกว่าจะรับเข้า)'}
          </p>
          {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}

          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              ยังไม่มีสูตร — เมนูนี้จะไม่ตัดสต็อก
            </div>
          )}

          {readOnly ? (
            rows.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {rows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className={r.isActive === false ? 'text-slate-400 line-through' : ''}>{r.name}</span>
                    <span className="tabular-nums">
                      {formatNumber(r.quantity)} {r.readUnit}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <datalist id={listId}>
                {activeIngredients.map((ing) => (
                  <option key={ing.id} value={ing.name}>
                    {ing.unit}
                  </option>
                ))}
              </datalist>
              <datalist id={unitListId}>
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>

              {rows.map((r, i) => {
                const found = r.name.trim() ? match(r.name) : null;
                const isNew = r.name.trim() && !found;
                return (
                  <div key={r.key} className="rounded-xl border border-slate-200 p-2.5 sm:border-0 sm:p-0">
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <input
                        className="input w-full min-w-0 sm:flex-1"
                        list={listId}
                        value={r.name}
                        onChange={(e) => update(r.key, 'name', e.target.value)}
                        placeholder="พิมพ์ชื่อวัตถุดิบ หรือเลือกจากรายการ"
                        aria-label={`ชื่อวัตถุดิบรายการที่ ${i + 1}`}
                        maxLength={150}
                        autoFocus={r.key.startsWith('new-')}
                      />
                      <div className="flex flex-1 items-center gap-1.5 sm:w-48 sm:flex-none">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.001"
                          className="input w-24 min-w-0 text-right"
                          value={r.quantity}
                          onChange={(e) => update(r.key, 'quantity', e.target.value)}
                          aria-label={`ปริมาณรายการที่ ${i + 1}`}
                          placeholder="ปริมาณ"
                        />
                        {isNew ? (
                          <input
                            className="input min-w-0 flex-1"
                            list={unitListId}
                            value={r.unit}
                            onChange={(e) => update(r.key, 'unit', e.target.value)}
                            placeholder="หน่วย"
                            aria-label={`หน่วยนับของวัตถุดิบใหม่รายการที่ ${i + 1}`}
                            maxLength={20}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 break-words text-xs leading-tight text-slate-500">{found?.unit || ''}</span>
                        )}
                      </div>
                      <button
                        className="btn-icon shrink-0 hover:text-danger"
                        onClick={() => removeRow(r.key)}
                        aria-label={`ลบรายการที่ ${i + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {isNew && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-primary-800">
                        <Sparkles size={12} /> วัตถุดิบใหม่ — จะถูกเพิ่มในคลัง (คงเหลือ 0) เมื่อบันทึกสูตร
                      </p>
                    )}
                    {found && !found.isActive && (
                      <p className="mt-1 text-xs text-danger">วัตถุดิบนี้ถูกปิดใช้งาน — เปิดใช้งานที่หน้าคลังวัตถุดิบ หรือลบออกจากสูตร</p>
                    )}
                  </div>
                );
              })}
              <button className="btn-outline w-full" onClick={addRow}>
                <Plus size={16} /> เพิ่มวัตถุดิบ
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
