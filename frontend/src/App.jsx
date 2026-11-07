import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ForbiddenPage from './pages/ForbiddenPage';
import SystemStatusPage from './pages/SystemStatusPage';
import { ROLES } from './utils/roles';

/**
 * Phase 2 (Authentication): Login + Protected routes ตาม Role + MainLayout
 * โมดูลถัดไป (Dashboard, เมนู/หมวดหมู่, POS ฯลฯ) ให้เพิ่มใต้ <ProtectedRoute roles={[...]}>
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route index element={<HomePage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route path="forbidden" element={<ForbiddenPage />} />

              <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
                <Route path="system-status" element={<SystemStatusPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
