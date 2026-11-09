import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import CategoriesPage from './pages/CategoriesPage';
import MenusPage from './pages/MenusPage';
import MenuOptionsPage from './pages/MenuOptionsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ForbiddenPage from './pages/ForbiddenPage';
import SystemStatusPage from './pages/SystemStatusPage';
import PosPage from './pages/PosPage';
import OrdersPage from './pages/OrdersPage';
import KitchenPage from './pages/KitchenPage';
import InventoryPage from './pages/InventoryPage';
import SettingsPage from './pages/SettingsPage';
import ReceiptPage from './pages/ReceiptPage';
import FullPageLoader from './components/FullPageLoader';
import { ROLES } from './utils/roles';

// Dashboard ใช้ Recharts (ขนาดใหญ่) — โหลดเมื่อเปิดหน้าเท่านั้น
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

const { ADMIN, CASHIER, KITCHEN } = ROLES;

/** หน้าแรกตาม role: admin/cashier -> Dashboard, kitchen -> หน้าครัว */
function IndexPage() {
  const { user } = useAuth();
  if (user.role === KITCHEN) return <Navigate to="/kitchen" replace />;
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
            {/* ใบเสร็จ: หน้าเปล่าสำหรับพิมพ์ (ไม่มี Sidebar) */}
            <Route element={<ProtectedRoute roles={[ADMIN, CASHIER]} />}>
              <Route path="orders/:id/receipt" element={<ReceiptPage />} />
            </Route>

            <Route element={<MainLayout />}>
              <Route index element={<IndexPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route path="forbidden" element={<ForbiddenPage />} />

              <Route element={<ProtectedRoute roles={[ADMIN, CASHIER, KITCHEN]} />}>
                <Route path="menus" element={<MenusPage />} />
                <Route path="kitchen" element={<KitchenPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={[ADMIN, CASHIER]} />}>
                <Route path="pos" element={<PosPage />} />
                <Route path="orders" element={<OrdersPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={[ADMIN, KITCHEN]} />}>
                <Route path="inventory" element={<InventoryPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={[ADMIN]} />}>
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="menu-options" element={<MenuOptionsPage />} />
                <Route path="system-status" element={<SystemStatusPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route
                  path="reports"
                  element={
                    <Suspense fallback={<FullPageLoader />}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
