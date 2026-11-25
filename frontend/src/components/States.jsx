import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { t } from '../i18n';

export function LoadingState({ text = t('กำลังโหลดข้อมูล...') }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="animate-spin" size={20} /> {text}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="text-danger" size={32} />
      <p className="text-sm text-slate-600">{message || t('โหลดข้อมูลไม่สำเร็จ')}</p>
      {onRetry && (
        <button className="btn-outline" onClick={onRetry}>
          <RefreshCw size={16} /> {t('ลองใหม่')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ text = t('ไม่มีข้อมูล'), children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-400">
      <Inbox size={32} />
      <p className="text-sm">{text}</p>
      {children}
    </div>
  );
}
