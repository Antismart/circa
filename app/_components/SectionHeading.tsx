interface SectionHeadingProps {
  number: string;
  title: string;
  subtitle?: string;
}

export function SectionHeading({ number, title, subtitle }: SectionHeadingProps) {
  return (
    <header className="mb-6">
      <div className="flex items-baseline gap-4 border-b border-rule pb-2">
        <span className="font-mono text-[11px] text-ink-faint tracking-[0.08em] numeral">
          {number}
        </span>
        <h2 className="label text-ink flex-1">{title}</h2>
        {subtitle && (
          <span className="text-[10px] tracking-[0.18em] uppercase text-ink-faint hidden sm:inline">
            {subtitle}
          </span>
        )}
      </div>
    </header>
  );
}
