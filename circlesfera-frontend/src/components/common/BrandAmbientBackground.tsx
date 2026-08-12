/**
 * Global CircleSfera brand wash — same layers as the main app shell.
 * Keep Admin Panel / auth surfaces in sync with LayoutWrapper.
 */
export default function BrandAmbientBackground() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[var(--surface-base)] pointer-events-none">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 12% 12%, rgba(255, 87, 87, 0.10) 0%, transparent 50%),
            radial-gradient(circle at 88% 88%, rgba(140, 82, 255, 0.16) 0%, transparent 55%),
            linear-gradient(135deg, rgba(255, 87, 87, 0.06) 0%, rgba(140, 82, 255, 0.12) 100%)
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(5, 4, 10, 0.45) 100%)',
        }}
      />
    </div>
  );
}
