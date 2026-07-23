/** Shared loading skeleton for admin SplitView list panes. */
export function AdminListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }, (_, i) => `sk-${i}`).map((id) => (
        <div
          key={id}
          className="h-20 rounded-xl border border-white/10 bg-white/5 animate-pulse"
        />
      ))}
    </div>
  );
}

/** Shared loading skeleton for admin SplitView detail panes. */
export function AdminDetailSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-2/3 rounded-lg bg-white/10" />
      <div className="h-4 w-1/2 rounded-lg bg-white/5" />
      <div className="h-48 rounded-xl bg-white/5 border border-white/10" />
      <div className="h-24 rounded-xl bg-white/5 border border-white/10" />
    </div>
  );
}
