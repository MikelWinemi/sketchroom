export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 22c4-10 8-12 16-12" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="9" cy="10" r="2.2" fill="white" />
    </svg>
  );
}
