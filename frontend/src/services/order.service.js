import api from './api';

/** params: { status ('pending,preparing'), paymentStatus, date (YYYY-MM-DD), search, page, pageSize } */
export const getOrders = async (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const { data } = await api.get('/orders', { params: clean });
  return data.data; // { orders, pagination }
};

export const getOrder = async (id) => (await api.get(`/orders/${id}`)).data.data;

/** คิวครัว: { active: [...], recentCompleted: [...] } */
export const getKitchenQueue = async () => (await api.get('/orders/kitchen')).data.data;

/**
 * ส่งเฉพาะ menuId / optionIds / quantity / note — Backend คำนวณราคาเอง
 * payload: { orderType, tableNo, note, items: [{ menuId, optionIds, quantity, note }] }
 */
export const createOrder = async (payload) => (await api.post('/orders', payload)).data;

/**
 * รับชำระเงิน — Backend คำนวณยอดใหม่จาก DB
 * payload: { method: 'cash'|'promptpay', receivedAmount?, referenceNo?, discount?: { type: 'amount'|'percent', value } }
 */
export const payOrder = async (id, payload) => (await api.post(`/orders/${id}/payment`, payload)).data;

/** ใบเสร็จ: { shop, order } (เฉพาะออเดอร์ที่ชำระแล้ว) */
export const getReceipt = async (id) => (await api.get(`/orders/${id}/receipt`)).data.data;

/** เปิดใบเสร็จในแท็บใหม่ (print=1 สั่งพิมพ์อัตโนมัติ) */
export const openReceipt = (id, { print = true } = {}) =>
  window.open(`/orders/${id}/receipt${print ? '?print=1' : ''}`, '_blank', 'noopener');

/** status: preparing | completed | cancelled */
export const updateOrderStatus = async (id, status) => (await api.patch(`/orders/${id}/status`, { status })).data;
