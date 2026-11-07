import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, Home, KeyRound, LogOut, Menu, UtensilsCrossed, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../utils/roles';

/**
 * เมนูใน Sidebar — roles ว่าง = ทุก role
 * เพิ่มรายการของโมดูลใหม่ที่นี่เมื่อพัฒนาเสร็จ (Dashboard, เมนู, POS ฯลฯ)
 */
const NAV_ITEMS = [
  { to: '/', label: 'หน้าหลัก', icon: Home, end: true },
  { to: '/system-status', label: 'สถานะระบบ', icon: Activity, roles: [ROLES.ADMIN] },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const items = NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(user.role));

  const handleLogout = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'ออกจากระบบ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#166534',
    });
    if (isConfirmed) logout();
  };

  return (
    <div className="flex min-h-full">
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-900 text-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2 font-semibold">
            <UtensilsCrossed size={22} /> Food POS
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="ปิดเมนู">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive ? 'bg-white/15 font-medium' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10"
          >
            <LogOut size={18} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="btn-outline px-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.fullName}</div>
              <div className="text-xs text-slate-500">{user.roleDisplayName}</div>
            </div>
            <NavLink to="/change-password" className="btn-outline px-2.5" title="เปลี่ยนรหัสผ่าน">
              <KeyRound size={18} />
            </NavLink>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
