import api from './api';

/** params: { scope, categoryId, menuId, optionType } */
export const getMenuOptions = async (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const { data } = await api.get('/menu-options', { params: clean });
  return data.data;
};

export const createMenuOption = async (payload) => (await api.post('/menu-options', payload)).data;

export const updateMenuOption = async (id, payload) => (await api.put(`/menu-options/${id}`, payload)).data;

export const deleteMenuOption = async (id) => (await api.delete(`/menu-options/${id}`)).data;

/** วัตถุดิบของตัวเลือก: { extraPercent, items: [{ ingredientId, name, unit, quantity, stock, isActive }] } */
export const getOptionRecipe = async (id) => (await api.get(`/menu-options/${id}/recipe`)).data.data;

/** { extraPercent, items: [{ ingredientId, quantity } | { name, unit, quantity }] } — แทนที่ทั้งหมด */
export const saveOptionRecipe = async (id, payload) => (await api.put(`/menu-options/${id}/recipe`, payload)).data;
