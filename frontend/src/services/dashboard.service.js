import api from './api';

export const getDashboardSummary = async () => {
  const { data } = await api.get('/dashboard/summary');
  return data.data;
};
