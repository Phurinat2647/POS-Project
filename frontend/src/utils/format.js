const currencyFmt = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
});

export const formatCurrency = (value) => currencyFmt.format(Number(value) || 0);

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '-';
