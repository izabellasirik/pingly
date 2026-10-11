export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-24" />
      ))}
    </div>
  );
}

export function LineSkeleton({ className = "h-8 w-48" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
