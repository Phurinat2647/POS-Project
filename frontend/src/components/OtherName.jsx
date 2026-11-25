import { getLang, localName } from '../i18n';

/**
 * ชื่ออีกภาษาเป็นบรรทัดรอง (หน้าจัดการเมนู/ตัวเลือก)
 * โหมดไทยแสดงชื่ออังกฤษ, โหมดอังกฤษแสดงชื่อไทย — ช่วยให้เห็นว่ารายการไหนยังไม่มีชื่ออังกฤษ
 */
export default function OtherName({ item, className = 'block line-clamp-1 text-xs text-slate-500' }) {
  const other = getLang() === 'en' ? item.name : item.nameEn;
  if (!other || other === localName(item)) return null;
  return <span className={className}>{other}</span>;
}
