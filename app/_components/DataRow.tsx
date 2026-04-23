import type { ReactNode } from "react";

interface DataRowProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
  align?: "default" | "top";
}

export function DataRow({ label, value, mono, align = "default" }: DataRowProps) {
  return (
    <div
      className={`flex gap-6 py-2.5 border-b border-rule ${
        align === "top" ? "items-start" : "items-baseline"
      }`}
    >
      <dt className="label shrink-0 w-[108px]">{label}</dt>
      <dd
        className={`flex-1 min-w-0 ${
          mono ? "font-mono text-[13px]" : "text-[14px]"
        } text-ink numeral break-words`}
      >
        {value}
      </dd>
    </div>
  );
}
