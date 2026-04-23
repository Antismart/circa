interface StampProps {
  label?: string;
  sublabel?: string;
}

export function Stamp({ label = "Verified on Hedera", sublabel }: StampProps) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="stamp">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2 6.2L4.8 9L10 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{label}</span>
      </div>
      {sublabel && (
        <span className="font-mono text-[9px] tracking-[0.15em] text-accent/70 mt-1">
          {sublabel}
        </span>
      )}
    </div>
  );
}
