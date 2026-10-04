export function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`shimmer rounded-[var(--radius)] ${className}`} aria-hidden="true" />;
}

export function SkeletonGrid({ count = 4, className = 'h-28' }: { count?: number; className?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={className} />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12" />
      ))}
    </div>
  );
}
