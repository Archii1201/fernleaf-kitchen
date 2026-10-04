const PALETTES = [
  { bg: '#f5eddd', plate: '#fffdf8', accent: '#f4a340', leaf: '#4f8a63' },
  { bg: '#e9edf3', plate: '#fffdf8', accent: '#183153', leaf: '#4f8a63' },
  { bg: '#fbe9d2', plate: '#fffdf8', accent: '#e58b20', leaf: '#6d9b78' },
];

function hash(seed: string): number {
  let value = 0;
  for (const char of seed) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}

/** Illustrated plate used whenever a dish has no photo or the photo fails. */
export function FoodPlaceholder({
  seed = '',
  label,
  className = 'h-40 w-full',
}: {
  seed?: string;
  label?: string;
  className?: string;
}) {
  const palette = PALETTES[hash(seed) % PALETTES.length];
  const initials = (label ?? seed)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: palette.bg }} role="img" aria-label={label ? `${label} (no photo)` : 'No photo'}>
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="100" cy="64" r="46" fill={palette.plate} />
        <circle cx="100" cy="64" r="46" fill="none" stroke={palette.accent} strokeOpacity="0.25" strokeWidth="1.5" />
        <circle cx="100" cy="64" r="34" fill="none" stroke={palette.accent} strokeOpacity="0.15" strokeWidth="1" />
        <path d="M72 64c10-14 22-18 34-12" fill="none" stroke={palette.leaf} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M108 52c4 6 10 8 18 6-2-8-8-12-18-6Z" fill={palette.leaf} opacity="0.85" />
        <circle cx="88" cy="74" r="5" fill={palette.accent} opacity="0.8" />
        <circle cx="112" cy="76" r="3.5" fill={palette.accent} opacity="0.55" />
        <path d="M30 22v30M24 22v12a6 6 0 0 0 12 0V22" fill="none" stroke={palette.accent} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
        <path d="M172 22c-6 6-6 22 0 26v24" fill="none" stroke={palette.accent} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {initials ? (
        <span className="serif absolute bottom-2 right-3 text-sm font-semibold tracking-widest text-[var(--navy)]/40">{initials}</span>
      ) : null}
    </div>
  );
}
