/** The product's mark: two lifelines and one arrow on the marker yellow of the current step. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect width="24" height="24" rx="6.5" fill="var(--marker)" />
      <g fill="none" stroke="var(--on-marker)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 5.5v13M17.5 5.5v13" strokeWidth="1.7" />
        <path d="M6.5 12h10M13.4 9l3.1 3-3.1 3" strokeWidth="2" />
      </g>
    </svg>
  );
}
