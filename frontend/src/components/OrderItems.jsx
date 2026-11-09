import { formatCurrency } from '../utils/format';

/** ข้อความตัวเลือก เช่น "พิเศษ, ไข่ดาว" */
export const optionText = (options = []) => options.map((o) => o.name).join(', ');

/**
 * แสดงรายการอาหารในออเดอร์ (อ่านจาก snapshot ของ order_items / order_item_options)
 * size: 'md' ปกติ / 'lg' ตัวใหญ่สำหรับจอครัว
 */
export default function OrderItems({ items, showPrice = false, size = 'md' }) {
  const big = size === 'lg';
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.id} className={`flex gap-3 ${big ? 'py-2' : 'py-1.5'}`}>
          <span className={`shrink-0 font-semibold text-primary-800 ${big ? 'text-lg' : 'text-sm'}`}>{item.quantity}×</span>
          <div className="min-w-0 flex-1">
            <div className={`font-medium ${big ? 'text-base' : 'text-sm'}`}>{item.menuName}</div>
            {item.options.length > 0 && (
              <div className={`text-slate-500 ${big ? 'text-sm' : 'text-xs'}`}>{optionText(item.options)}</div>
            )}
            {item.note && (
              <div className={`font-medium text-danger ${big ? 'text-sm' : 'text-xs'}`}>* {item.note}</div>
            )}
          </div>
          {showPrice && <span className="shrink-0 text-sm tabular-nums">{formatCurrency(item.lineTotal)}</span>}
        </li>
      ))}
    </ul>
  );
}
