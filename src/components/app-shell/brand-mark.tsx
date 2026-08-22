/**
 * The Hotel Ivory Towers mark: two classical columns on a shared base.
 *
 * Replaces the generic concierge "sparkle" that every AI product ships with.
 * Twin columns read as "towers" and carry an ivory / old-world-hotel weight
 * the sparkle never did, and the shape stays legible down to a 16px favicon —
 * two verticals, two capitals, one base, nothing that turns to mush when small.
 *
 * Drawn in currentColor so it inherits whatever it sits on (the ivory
 * foreground on the primary chip in the sidebar, a single tone in the tab
 * icon), and carries no colour of its own.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {/* Capitals — the wider slab crowning each column. */}
      <rect x="5.4" y="4.6" width="5.2" height="1.9" rx="0.6" />
      <rect x="13.4" y="4.6" width="5.2" height="1.9" rx="0.6" />
      {/* Column shafts, slightly tapered feel via rounded tops. */}
      <rect x="6.7" y="6.5" width="2.6" height="11.4" rx="0.5" />
      <rect x="14.7" y="6.5" width="2.6" height="11.4" rx="0.5" />
      {/* A single fluting line down each shaft — the classical detail that
          makes it read as a column rather than a plain bar. */}
      <rect x="7.8" y="8" width="0.5" height="8" rx="0.25" opacity="0.45" />
      <rect x="15.8" y="8" width="0.5" height="8" rx="0.25" opacity="0.45" />
      {/* Shared base / stylobate. */}
      <rect x="4.6" y="18" width="14.8" height="2" rx="0.7" />
    </svg>
  );
}
