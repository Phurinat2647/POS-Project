import api from './api';

const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false));

/** params: { search, lowOnly, includeInactive } */
export const getIngredients = async (params = {}) => (await api.get('/ingredients', { params: clean(params) })).data.data;

export const createIngredient = async (payload) => (await api.post('/ingredients', payload)).data;

export const updateIngredient = async (id, payload) => (await api.put(`/ingredients/${id}`, payload)).data;

export const deleteIngredient = async (id) => (await api.delete(`/ingredients/${id}`)).data;

/**
 * รับเข้า / เบิกออก / ปรับยอด
 * payload: { type: 'in'|'out'|'adjust', quantity (in/out), newBalance (adjust), unitCost? (in), note? }
 */
export const addStockTransaction = async (id, payload) => (await api.post(`/ingredients/${id}/transactions`, payload)).data;

/** params: { ingredientId, type, page, pageSize } -> { transactions, pagination } */
export const getStockTransactions = async (params = {}) =>
  (await api.get('/ingredients/transactions', { params: clean(params) })).data.data;
