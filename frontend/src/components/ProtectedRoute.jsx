import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import FullPageLoader from './FullPageLoader';

/**
 * ป้องกัน route ที่ต้องเข้าสู่ระบบ
 * - roles (ไม่บังคับ): จำกัดเฉพาะ role ที่กำหนด ถ้าไม่มีสิทธิ์จะไปหน้า /forbidden
 * ใช้เป็น layout route: <Route element={<ProtectedRoute roles={['admin']} />}>...</Route>
 */
export default function ProtectedRoute({ roles }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader text="กำลังตรวจสอบการเข้าสู่ระบบ..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;

  return <Outlet />;
}
