import axios from 'axios';

export const TOKEN_KEY = 'food_pos_token';
/** event ที่ยิงเมื่อ API ตอบ 401 (token หมดอายุ/ไม่ถูกต้อง) — AuthContext ฟังเพื่อออกจากระบบ */
export const UNAUTHORIZED_EVENT = 'food-pos:unauthorized';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage ไม่พร้อมใช้งาน
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage ไม่พร้อมใช้งาน */
  }
}

/**
 * Axios instance กลางสำหรับเรียก REST API
 * - แนบ JWT token อัตโนมัติ
 * - แปลง error ให้มีข้อความภาษาไทยที่อ่านง่าย (error.userMessage)
 * - 401 -> ล้าง token และแจ้ง AuthContext ให้กลับไปหน้า Login
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
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

    // 401 จากหน้า login คือรหัสผ่านผิด ไม่ใช่ session หมดอายุ
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      setToken(null);
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { message } }));
    }
    return Promise.reject(error);
  }
);

export default api;
