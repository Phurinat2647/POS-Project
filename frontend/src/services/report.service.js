import api from './api';

/** รายงานยอดขาย from..to (YYYY-MM-DD รวมทั้งสองวัน) */
export const getSalesReport = async ({ from, to }) => (await api.get('/reports/sales', { params: { from, to } })).data.data;
