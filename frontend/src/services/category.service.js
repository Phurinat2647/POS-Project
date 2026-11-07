import api from './api';

export const getCategories = async ({ includeInactive = false } = {}) => {
  const { data } = await api.get('/categories', { params: includeInactive ? { includeInactive: 1 } : {} });
  return data.data;
};

export const createCategory = async (payload) => (await api.post('/categories', payload)).data;

export const updateCategory = async (id, payload) => (await api.put(`/categories/${id}`, payload)).data;

export const deleteCategory = async (id) => (await api.delete(`/categories/${id}`)).data;
