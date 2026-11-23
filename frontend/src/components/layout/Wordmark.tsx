import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router';

/** A lock in a dark rounded square, next to the name. */
export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-xl text-text">
      <span
        aria-hidden="true"
        className="flex size-[30px] items-center justify-center rounded-[9px] bg-text text-bg"
      >
        <LockKeyhole size={16} strokeWidth={2} />
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-tight">SecureVault</span>
    </Link>
  );
}
