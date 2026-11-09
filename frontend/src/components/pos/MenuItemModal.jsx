import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import Modal from '../Modal';
import { formatCurrency } from '../../utils/format';
import { toBaht, toSatang } from '../../utils/money';

const QUICK_NOTES = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'ไม่ใส่ผัก', 'ไม่ใส่ผงชูรส', 'แยกข้าว'];
export const MAX_QTY = 99;

/** ราคาต่อหน่วย (สตางค์) = ราคาเมนู + ตัวเลือก */
export const lineUnitSatang = (line) =>
  toSatang(line.basePrice) + line.options.reduce((s, o) => s + toSatang(o.extraPrice), 0);

/** ตัวเลือกที่เลือกเรียงแบบคงที่ (ใช้เทียบว่ารายการเหมือนกันหรือไม่) */
export function buildLine(menu, { sizeId, toppingIds, quantity, note }) {
  const size = menu.sizes.find((s) => s.id === sizeId);
  const toppings = menu.toppings.filter((t) => toppingIds.includes(t.id));
  const options = [...(size ? [size] : []), ...toppings];
  return {
    menuId: menu.id,
    name: menu.name,
    basePrice: menu.price,
    sizeId: size?.id ?? null,
    toppingIds: toppings.map((t) => t.id),
    options,
    quantity,
    note: note.trim(),
  };
}

/**
 * เลือกขนาด / ท็อปปิ้ง / จำนวน / หมายเหตุ ก่อนเพิ่มลงตะกร้า
 * initial = รายการในตะกร้าที่กำลังแก้ไข (ถ้าไม่มีคือเพิ่มใหม่)
 * ใช้ key ภายนอกเพื่อรีเซ็ต state เมื่อเปลี่ยนเมนู
 */
export default function MenuItemModal({ menu, initial, onClose, onSubmit }) {
  const defaultSize = menu.sizes.find((s) => s.isDefault) || menu.sizes[0];
  const [sizeId, setSizeId] = useState(initial?.sizeId ?? defaultSize?.id ?? null);
  const [toppingIds, setToppingIds] = useState(initial?.toppingIds ?? []);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');

  const preview = buildLine(menu, { sizeId, toppingIds, quantity, note });
  const lineTotal = toBaht(lineUnitSatang(preview) * quantity);

  const toggleTopping = (id) =>
    setToppingIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addQuickNote = (text) =>
    setNote((n) => {
      const parts = n.split(',').map((s) => s.trim()).filter(Boolean);
      return parts.includes(text) ? n : [...parts, text].join(', ');
    });

  const submit = (e) => {
    e.preventDefault();
    onSubmit(preview);
  };

  return (
    <Modal
      open
      title={menu.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" form="menu-item-form" className="btn-primary">
            {initial ? 'บันทึก' : 'เพิ่มลงตะกร้า'} · {formatCurrency(lineTotal)}
          </button>
        </>
      }
    >
      <form id="menu-item-form" onSubmit={submit} className="space-y-5">
        <div className="text-sm text-slate-500">
          ราคาเริ่มต้น <span className="font-medium text-slate-800">{formatCurrency(menu.price)}</span>
          {menu.description && <p className="mt-1">{menu.description}</p>}
        </div>

        {menu.sizes.length > 0 && (
          <fieldset>
            <legend className="label">ขนาด <span className="font-normal text-slate-400">(เลือก 1 อย่าง)</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {menu.sizes.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    sizeId === s.id ? 'border-primary-700 bg-primary-50 font-medium' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="size" className="accent-primary-800" checked={sizeId === s.id} onChange={() => setSizeId(s.id)} />
                    {s.name}
                  </span>
                  {s.extraPrice > 0 && <span className="text-xs text-slate-500">+{s.extraPrice}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {menu.toppings.length > 0 && (
          <fieldset>
            <legend className="label">ท็อปปิ้ง <span className="font-normal text-slate-400">(เลือกได้หลายอย่าง)</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {menu.toppings.map((t) => {
                const checked = toppingIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      checked ? 'border-primary-700 bg-primary-50 font-medium' : 'border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="accent-primary-800" checked={checked} onChange={() => toggleTopping(t.id)} />
                      {t.name}
                    </span>
                    {t.extraPrice > 0 && <span className="text-xs text-slate-500">+{t.extraPrice}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <label className="label" htmlFor="item-note">หมายเหตุ</label>
          <input
            id="item-note"
            className="input"
            value={note}
            maxLength={255}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ไม่เผ็ด ไม่ใส่ผัก"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_NOTES.map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                onClick={() => addQuickNote(q)}
              >
                + {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="label mb-0">จำนวน</span>
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </div>
      </form>
    </Modal>
  );
}

export function QuantityStepper({ value, onChange, min = 1, small = false }) {
  const cls = small ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className={`${cls} inline-flex items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="ลดจำนวน"
      >
        <Minus size={small ? 14 : 16} />
      </button>
      <span className={`text-center font-semibold tabular-nums ${small ? 'w-7 text-sm' : 'w-10'}`}>{value}</span>
      <button
        type="button"
        className={`${cls} inline-flex items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY}
        aria-label="เพิ่มจำนวน"
      >
        <Plus size={small ? 14 : 16} />
      </button>
    </div>
  );
}
