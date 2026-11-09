/**
 * ดาวน์โหลดไฟล์ CSV (UTF-8 + BOM เพื่อให้ Excel แสดงภาษาไทยถูกต้อง)
 * columns: [{ header, value: (row) => any }]
 */
export function downloadCsv(filename, columns, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(','), ...rows.map((r) => columns.map((c) => escape(c.value(r))).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
