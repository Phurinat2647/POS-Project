import { Tag } from 'lucide-react';
import Barcode from './Barcode';
import { optionText } from './OrderItems';
import { boxCode } from '../utils/boxLabels';
import { ORDER_TYPE } from '../utils/labels';
import { localName, t } from '../i18n';

/**
 * สติ๊กเกอร์ติดกล่อง 1 ดวง = 1 กล่อง ขนาด 60x40 มม. (ตัดข้อความที่ยาวเกินแทนการล้นไปดวงถัดไป)
 * มีบาร์โค้ด "<เลขออเดอร์>-<ลำดับกล่อง>" ให้จุดส่งมอบสแกน — อ่านจาก snapshot ของรายการ
 * box: { item, no, total } จาก buildBoxLabels()
 */
export default function BoxLabel({ box, order }) {
  const { item, no, total } = box;
  const code = boxCode(order.orderNo, no);
  const place = order.orderType === 'dine_in' && order.tableNo ? t('โต๊ะ {0}', [order.tableNo]) : ORDER_TYPE[order.orderType];
  const detail = [item.options.length > 0 && optionText(item.options), item.note && `* ${item.note}`].filter(Boolean);

  return (
    <article className="box-border flex h-[40mm] w-[60mm] flex-col overflow-hidden border border-dashed border-slate-400 bg-white px-[2.5mm] py-[1.5mm] text-[10px] leading-tight text-black print:break-after-page print:border-0 print:last:break-after-auto">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[13px] font-bold">#{order.orderNo.split('-')[1]}</span>
        <span className="min-w-0 flex-1 truncate">{place}</span>
        <span className="shrink-0 text-[12px] font-bold">
          <Tag size={9} className="mr-0.5 inline" />
          {no}/{total}
        </span>
      </div>
      <hr className="my-[0.5mm] border-t border-dashed border-black/60" />
      <div className="flex min-h-0 flex-1 flex-col justify-center text-center">
        <p className="line-clamp-2 text-[15px] leading-tight font-bold">{localName(item, 'menuName')}</p>
        {detail.length > 0 && <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold">{detail.join(' ')}</p>}
        {order.note && <p className="truncate text-[9px]">{t('หมายเหตุ:')} {order.note}</p>}
      </div>
      <div className="flex flex-col items-center">
        <Barcode value={code} heightMm={7} />
        <span className="text-[8px] tracking-wide">{code}</span>
      </div>
    </article>
  );
}
