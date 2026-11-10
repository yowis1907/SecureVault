import { Link } from 'react-router';

/** A keyhole drawn from two shapes, next to the name set in the mono face. */
export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-[var(--radius-control)] text-text">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="text-accent">
        <rect
          x="1"
          y="1"
          width="20"
          height="20"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="11" cy="9" r="3" fill="currentColor" />
        <path d="M9.6 10.5h2.8l0.9 5.5h-4.6z" fill="currentColor" />
      </svg>
      <span className="font-mono text-base font-semibold tracking-tight">securevault</span>
    </Link>
  );
}
