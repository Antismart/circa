import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";

interface FieldWrapperProps {
  label: string;
  number?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, number, hint, children }: FieldWrapperProps) {
  return (
    <div className="field">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <label className="label flex items-baseline gap-2">
          {number && (
            <span className="font-mono text-[10px] text-ink-faint tracking-[0.08em]">
              {number}
            </span>
          )}
          <span>{label}</span>
        </label>
        {hint && (
          <span className="text-[10px] italic text-ink-faint">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement>;
export function TextInput(props: InputProps) {
  return <input {...props} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export function Textarea(props: TextareaProps) {
  return <textarea {...props} />;
}
