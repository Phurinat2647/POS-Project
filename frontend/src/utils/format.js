const currencyFmt = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
});
const numberFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 });

export const formatCurrency = (value) => currencyFmt.format(Number(value) || 0);

export const formatNumber = (value) => numberFmt.format(Number(value) || 0);

/** ยอดเงินแบบย่อสำหรับแกนกราฟ เช่น ฿1.2K */
export const formatCompactBaht = (value) =>
  `฿${new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0)}`;

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '-';

/** 'YYYY-MM-DD' -> 'จ. 7 พ.ย.' (ไม่แปลง timezone) */
export const formatShortDate = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
