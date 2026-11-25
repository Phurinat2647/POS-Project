import { Languages } from 'lucide-react';
import { getLang, LANGUAGES, setLang, t } from '../i18n';

/** ปุ่มเลือกภาษา TH / EN — เปลี่ยนแล้วโหลดหน้าใหม่ (ตะกร้าและการเข้าสู่ระบบยังอยู่) */
export default function LanguageSwitcher({ className = '' }) {
  const current = getLang();
  return (
    <div
      role="group"
      aria-label={t('เปลี่ยนภาษา')}
      title={t('เปลี่ยนภาษา')}
      className={`inline-flex items-center gap-0.5 rounded-xl border border-slate-300 bg-white p-0.5 text-xs font-semibold ${className}`}
    >
      <Languages size={14} className="mx-1 hidden text-slate-400 sm:block" aria-hidden="true" />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={current === l.code}
          aria-label={l.name}
          onClick={() => setLang(l.code)}
          className={`rounded-lg px-2 py-1 transition ${
            current === l.code ? 'bg-primary-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
