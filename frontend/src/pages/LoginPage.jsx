import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogIn, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FullPageLoader from '../components/FullPageLoader';

export default function LoginPage() {
  const { user, status, sessionMessage, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from?.pathname || '/';

  if (status === 'loading') return <FullPageLoader text="กำลังตรวจสอบการเข้าสู่ระบบ..." />;
  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.userMessage || 'เข้าสู่ระบบไม่สำเร็จ');
      setSubmitting(false);
    }
  };

  const message = error || sessionMessage;

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-primary-50 to-surface p-4">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-800 text-white">
            <UtensilsCrossed size={28} />
          </div>
          <h1 className="text-xl font-semibold">Food POS</h1>
          <p className="text-sm text-slate-500">เข้าสู่ระบบเพื่อใช้งาน</p>
        </div>

        {message && (
          <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              ชื่อผู้ใช้
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
            {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}
