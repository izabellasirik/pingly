export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--accent)" />
        <circle cx="32" cy="30" r="12" fill="none" stroke="#fff" strokeWidth="5" />
        <circle cx="32" cy="30" r="3.5" fill="#fff" />
        <path d="M24 45h16" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </svg>
      Pingly
    </span>
  );
}
