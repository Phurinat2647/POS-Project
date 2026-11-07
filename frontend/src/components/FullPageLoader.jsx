import { Loader2 } from 'lucide-react';

export default function FullPageLoader({ text = 'กำลังโหลด...' }) {
  return (
    <div className="flex min-h-full items-center justify-center gap-3 p-8 text-slate-500">
      <Loader2 className="animate-spin" size={20} /> {text}
    </div>
  );
}
