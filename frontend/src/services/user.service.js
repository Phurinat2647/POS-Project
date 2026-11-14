import api from './api';

/** จัดการผู้ใช้ (admin) */
export const getUsers = async () => (await api.get('/users')).data.data;

export const getRoles = async () => (await api.get('/users/roles')).data.data;

/** payload: { username, password, fullName, phone, role } */
export const createUser = async (payload) => (await api.post('/users', payload)).data;

/** payload: { fullName, phone, role, isActive } */
export const updateUser = async (id, payload) => (await api.put(`/users/${id}`, payload)).data;

export const resetUserPassword = async (id, password) => (await api.put(`/users/${id}/password`, { password })).data;

export const deleteUser = async (id) => (await api.delete(`/users/${id}`)).data;
