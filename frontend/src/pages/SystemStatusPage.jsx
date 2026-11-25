import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Database, Server, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { getHealth } from '../services/health.service';
import { formatDateTime } from '../utils/format';
import { t } from '../i18n';

/**
 * หน้าตรวจสอบสถานะระบบ (Phase 1)
 * ใช้ยืนยันว่า Frontend -> Backend -> MySQL เชื่อมต่อกันได้จริง
 * จะถูกแทนที่ด้วยหน้า Login/Dashboard ใน Phase 2
 */
export default function SystemStatusPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await getHealth());
    } catch (err) {
      setHealth(null);
      setError(err.userMessage || t('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const db = health?.database;

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-800 text-white">
            <UtensilsCrossed size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Food POS</h1>
            <p className="text-sm text-slate-500">{t('ตรวจสอบสถานะการเชื่อมต่อระบบ')}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8 text-slate-500">
            <RefreshCw className="animate-spin" size={18} /> {t('กำลังตรวจสอบ...')}
          </div>
        ) : (
          <ul className="space-y-3">
            <StatusRow
              icon={Server}
              label="Backend API"
              ok={!error}
              detail={error ? error : t('เชื่อมต่อสำเร็จ')}
            />
            <StatusRow
              icon={Database}
              label={t('ฐานข้อมูล MySQL')}
              ok={!!db?.connected}
              detail={db?.connected ? db.version : db?.error || t('ไม่ทราบสถานะ')}
            />
            <StatusRow
              icon={Database}
              label={t('โครงสร้างตาราง')}
              ok={!!db?.schemaReady}
              detail={
                db?.schemaReady
                  ? t('ตารางครบถ้วน')
                  : db?.missingTables?.length
                    ? t('ขาดตาราง: {0}', [db.missingTables.join(', ')])
                    : t('ยังตรวจสอบไม่ได้ - รัน npm run db:setup')
              }
            />
          </ul>
        )}

        {db?.serverTime && (
          <p className="mt-4 text-xs text-slate-500">{t('เวลาเซิร์ฟเวอร์ฐานข้อมูล:')} {formatDateTime(db.serverTime)}</p>
        )}

        <button className="btn-primary mt-6 w-full" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {t('ตรวจสอบอีกครั้ง')}
        </button>
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, ok, detail }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
      <Icon size={20} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="break-words text-sm text-slate-500">{detail}</p>
      </div>
      {ok ? (
        <span className="badge bg-primary-100 text-primary-800">
          <CheckCircle2 size={14} /> {t('ปกติ')}
        </span>
      ) : (
        <span className="badge bg-red-100 text-danger">
          <XCircle size={14} /> {t('ผิดปกติ')}
        </span>
      )}
    </li>
  );
}
