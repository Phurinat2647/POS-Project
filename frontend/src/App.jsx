import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CategoriesPage from './pages/CategoriesPage';
import MenusPage from './pages/MenusPage';
import MenuOptionsPage from './pages/MenuOptionsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ForbiddenPage from './pages/ForbiddenPage';
import SystemStatusPage from './pages/SystemStatusPage';
import FullPageLoader from './components/FullPageLoader';
import { ROLES } from './utils/roles';

// Dashboard ใช้ Recharts (ขนาดใหญ่) — โหลดเมื่อเปิดหน้าเท่านั้น
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

const { ADMIN, CASHIER, KITCHEN } = ROLES;

/** หน้าแรกตาม role: admin/cashier -> Dashboard, kitchen -> หน้าต้อนรับ (หน้าครัวมาใน Phase 3) */
function IndexPage() {
  const { user } = useAuth();
  if (user.role === KITCHEN) return <HomePage />;
  return (
    <Suspense fallback={<FullPageLoader />}>
      <DashboardPage />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route index element={<IndexPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route path="forbidden" element={<ForbiddenPage />} />

              <Route element={<ProtectedRoute roles={[ADMIN, CASHIER, KITCHEN]} />}>
                <Route path="menus" element={<MenusPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={[ADMIN]} />}>
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="menu-options" element={<MenuOptionsPage />} />
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
