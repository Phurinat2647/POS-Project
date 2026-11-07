import api from './api';

export const login = async (username, password) => {
  const { data } = await api.post('/auth/login', { username, password });
  return data.data; // { token, expiresIn, user }
};

export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data.data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const { data } = await api.put('/auth/change-password', { currentPassword, newPassword });
  return data;
};
