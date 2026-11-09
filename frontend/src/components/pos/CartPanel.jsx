import { AlertTriangle, Loader2, Pencil, Send, ShoppingBag, Trash2, Utensils, X } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { toBaht } from '../../utils/money';
import { ORDER_TYPE } from '../../utils/labels';
import { QuantityStepper, lineUnitSatang } from './MenuItemModal';

const TYPE_ICON = { dine_in: Utensils, takeaway: ShoppingBag };

/**
 * ตะกร้าสินค้าหน้า POS — ยอดที่แสดงเป็นยอดโดยประมาณ ยอดจริงคำนวณโดย Backend ตอนส่งออเดอร์
 * unavailable: Set ของ menuId ที่หมด/ถูกปิดหลังจากเพิ่มลงตะกร้า
 */
export default function CartPanel({
  lines,
  unavailable,
  form,
  onFormChange,
  onQuantity,
  onEdit,
  onRemove,
  onClear,
  onSubmit,
  submitting,
  onClose,
}) {
  const totalSatang = lines.reduce((s, l) => s + lineUnitSatang(l) * l.quantity, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const hasUnavailable = lines.some((l) => unavailable.has(l.menuId));
  const set = (k) => (e) => onFormChange({ ...form, [k]: e.target.value });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">
          ตะกร้า <span className="text-sm font-normal text-slate-500">({itemCount} รายการ)</span>
        </h2>
        <div className="flex items-center gap-2">
          {lines.length > 0 && (
            <button type="button" className="text-sm text-slate-500 hover:text-danger" onClick={onClear} disabled={submitting}>
              ล้างทั้งหมด
            </button>
          )}
          {onClose && (
            <button type="button" className="btn-icon" onClick={onClose} disabled={submitting} aria-label="ปิดตะกร้า">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ORDER_TYPE).map(([value, label]) => {
            const Icon = TYPE_ICON[value];
            const active = form.orderType === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onFormChange({ ...form, orderType: value })}
                className={`btn border ${active ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <Icon size={16} /> {label}
              </button>
            );
          })}
        </div>
        {form.orderType === 'dine_in' && (
          <input className="input" placeholder="เลขโต๊ะ (ถ้ามี)" maxLength={20} value={form.tableNo} onChange={set('tableNo')} />
        )}
      </div>

      <div className="min-h-32 flex-1 overflow-y-auto px-4 py-2">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีรายการ — แตะเมนูเพื่อเพิ่ม</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => {
              const soldOut = unavailable.has(l.menuId);
              return (
                <li key={l.key} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{l.name}</div>
                      {l.options.length > 0 && (
                        <div className="text-xs text-slate-500">{l.options.map((o) => o.name).join(', ')}</div>
                      )}
                      {l.note && <div className="text-xs text-danger">* {l.note}</div>}
                      {soldOut && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-danger">
                          <AlertTriangle size={12} /> เมนูนี้หมดแล้ว กรุณานำออก
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrency(toBaht(lineUnitSatang(l) * l.quantity))}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <QuantityStepper small value={l.quantity} onChange={(q) => onQuantity(l.key, q)} />
                    <div className="flex">
                      {!soldOut && (
                        <button type="button" className="btn-icon h-8 w-8" onClick={() => onEdit(l)} aria-label="แก้ไข">
                          <Pencil size={15} />
                        </button>
                      )}
                      <button type="button" className="btn-icon h-8 w-8 hover:text-danger" onClick={() => onRemove(l.key)} aria-label="ลบ">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-200 px-4 py-3">
        <textarea
          className="input resize-none"
          rows={2}
          maxLength={500}
          placeholder="หมายเหตุออเดอร์ (ถ้ามี)"
          value={form.note}
          onChange={set('note')}
        />
        <div className="flex items-end justify-between">
          <span className="text-sm text-slate-500">ยอดรวม</span>
          <span className="text-2xl font-semibold text-primary-800 tabular-nums">{formatCurrency(toBaht(totalSatang))}</span>
        </div>
        <button
          type="button"
          className="btn-primary w-full py-3 text-base"
          disabled={!lines.length || hasUnavailable || submitting}
          onClick={onSubmit}
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          ส่งออเดอร์เข้าครัว
        </button>
      </div>
    </div>
  );
}
