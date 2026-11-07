import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="card flex flex-col items-center p-8 text-center">
        <ShieldAlert className="mb-3 text-danger" size={40} />
        <h1 className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-1 text-sm text-slate-500">บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้</p>
        <Link to="/" className="btn-primary mt-6">
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
