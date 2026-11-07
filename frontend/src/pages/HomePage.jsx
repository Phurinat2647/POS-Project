import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/format';

/**
 * หน้าแรกหลังเข้าสู่ระบบ (ข้อมูลจาก /api/auth/me)
 * จะถูกแทนด้วย Dashboard ในส่วนถัดไปของ Phase 2
 */
export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">สวัสดี, {user.fullName}</h1>
        <p className="mt-1 text-sm text-slate-500">ยินดีต้อนรับเข้าสู่ระบบ Food POS</p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">ชื่อผู้ใช้</dt>
            <dd className="font-medium">{user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">ตำแหน่ง</dt>
            <dd>
              <span className="badge bg-primary-100 text-primary-800">{user.roleDisplayName}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">เข้าสู่ระบบล่าสุด</dt>
            <dd className="font-medium">{formatDateTime(user.lastLoginAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
