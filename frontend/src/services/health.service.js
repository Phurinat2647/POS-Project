import api from './api';

export const getHealth = async () => {
  try {
    const { data } = await api.get('/health');
    return data;
  } catch (err) {
    // /api/health ส่ง 503 พร้อมรายละเอียดเมื่อฐานข้อมูลใช้งานไม่ได้
    if (err.response?.data?.database) return err.response.data;
    throw err;
  }
};
