import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import BoxLabel from '../components/BoxLabel';
import { ErrorState, LoadingState } from '../components/States';
import { getOrder } from '../services/order.service';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, buildBoxLabels } from '../utils/boxLabels';
import { t } from '../i18n';

/**
 * สติ๊กเกอร์กล่องของออเดอร์ (60x40 มม. 1 ดวงต่อกล่อง + บาร์โค้ด) — พิมพ์ที่ครัวเมื่อออเดอร์เข้า
 * ทุก role เปิดได้ (ไม่ต้องชำระเงินก่อน) · ?print=1 สั่งพิมพ์อัตโนมัติ (ใช้จาก utils/kitchenTicket.js ผ่าน iframe)
 */
export default function BoxLabelsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const printed = useRef(false);
  const embedded = window.self !== window.top;

  useEffect(() => {
    getOrder(id)
      .then(setOrder)
      .catch((err) => setError(err.userMessage));
  }, [id]);

  useEffect(() => {
    if (order && params.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300); // รอให้บาร์โค้ดวาดเสร็จ
    }
  }, [order, params]);

  if (error) return <ErrorState message={error} />;
  if (!order) return <LoadingState />;

  const boxes = buildBoxLabels(order.items);

  return (
    <div className="min-h-full bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; } html, body { margin: 0; } }`}</style>

      {!embedded && (
        <div className="mx-auto mb-4 flex flex-col items-center gap-2 print:hidden">
          <p className="text-sm text-slate-600">
            {t('สติ๊กเกอร์กล่อง')} {boxes.length} {t('ดวง (')}{LABEL_WIDTH_MM}x{LABEL_HEIGHT_MM} {t('มม.)')}
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => window.print()}>
              <Printer size={16} /> {t('พิมพ์สติ๊กเกอร์')}
            </button>
            <button className="btn-outline" onClick={() => window.close()}>
              <X size={16} /> {t('ปิด')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 print:block">
        {boxes.map((box) => (
          <BoxLabel key={box.key} box={box} order={order} />
        ))}
      </div>
    </div>
  );
}
