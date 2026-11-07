import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UNAUTHORIZED_EVENT, getToken, setToken } from '../services/api';
import * as authService from '../services/auth.service';

const AuthContext = createContext(null);

/**
 * เก็บสถานะผู้ใช้ที่เข้าสู่ระบบ
 * - ตอนเปิดแอป ถ้ามี token จะเรียก /auth/me เพื่อตรวจสอบกับ Backend จริง
 * - status: 'loading' | 'authenticated' | 'guest'
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'guest'));
  const [sessionMessage, setSessionMessage] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    authService
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        // 401 ล้าง token ใน interceptor แล้ว; error อื่น (เช่น เซิร์ฟเวอร์ล่ม) ให้กลับไปหน้า Login พร้อมข้อความ
        if (err.response?.status !== 401) setSessionMessage(err.userMessage);
        setUser(null);
        setStatus('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // token หมดอายุระหว่างใช้งาน
  useEffect(() => {
    const onUnauthorized = (e) => {
      setUser(null);
      setStatus('guest');
      setSessionMessage(e.detail?.message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const { token, user: me } = await authService.login(username, password);
    setToken(token);
    setUser(me);
    setStatus('authenticated');
    setSessionMessage(null);
    return me;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('guest');
    setSessionMessage(null);
  }, []);

  const hasRole = useCallback((...roles) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, status, sessionMessage, login, logout, hasRole }),
    [user, status, sessionMessage, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องใช้ภายใน <AuthProvider>');
  return ctx;
}
