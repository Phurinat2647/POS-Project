import axios from 'axios';

export const TOKEN_KEY = 'food_pos_token';

/**
 * Axios instance กลางสำหรับเรียก REST API
 * - แนบ JWT token อัตโนมัติ
 * - แปลง error ให้มีข้อความภาษาไทยที่อ่านง่าย
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* storage ไม่พร้อมใช้งาน */
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED'
        ? 'หมดเวลาการเชื่อมต่อกับเซิร์ฟเวอร์'
        : error.response
          ? `เกิดข้อผิดพลาด (${error.response.status})`
          : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    error.userMessage = message;
    // Phase 2: จัดการ 401 -> ล้าง token และพาไปหน้า Login
    return Promise.reject(error);
  }
);

export default api;
