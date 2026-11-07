import api from './api';

/** params: { categoryId, status, search } */
export const getMenus = async (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const { data } = await api.get('/menus', { params: clean });
  return data.data;
};

export const getMenu = async (id) => (await api.get(`/menus/${id}`)).data.data;

/** แปลงข้อมูลฟอร์มเป็น FormData (รองรับรูปภาพ) */
function toFormData({ categoryId, name, description, price, status, imageFile, removeImage }) {
  const fd = new FormData();
  fd.append('categoryId', categoryId);
  fd.append('name', name);
  fd.append('description', description || '');
  fd.append('price', price);
  fd.append('status', status);
  if (imageFile) fd.append('image', imageFile);
  if (removeImage) fd.append('removeImage', 'true');
  return fd;
}

export const createMenu = async (form) => (await api.post('/menus', toFormData(form))).data;

export const updateMenu = async (id, form) => (await api.put(`/menus/${id}`, toFormData(form))).data;

export const updateMenuStatus = async (id, status) => (await api.patch(`/menus/${id}/status`, { status })).data;

export const deleteMenu = async (id) => (await api.delete(`/menus/${id}`)).data;
