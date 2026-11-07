import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SystemStatusPage from './pages/SystemStatusPage';

/**
 * Phase 1: มีเฉพาะหน้าตรวจสอบสถานะระบบ
 * Phase 2+: Login, Protected routes ตาม Role, MainLayout (Sidebar/Topbar) และหน้าโมดูลต่าง ๆ
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/system-status" element={<SystemStatusPage />} />
        <Route path="*" element={<Navigate to="/system-status" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
