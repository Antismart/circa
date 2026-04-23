import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";

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

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
}

/** Native select styled to match the underline field aesthetic. */
export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={`appearance-none pr-7 cursor-pointer ${className ?? ""}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-0 bottom-2 text-ink-soft text-[11px]">
        ▾
      </span>
    </div>
  );
}

interface ComboboxProps extends InputHTMLAttributes<HTMLInputElement> {
  suggestions: string[];
  listId: string;
}

/**
 * Free-text input with a <datalist> of suggestions.
 * User may pick from the list or type anything.
 */
export function Combobox({ suggestions, listId, ...rest }: ComboboxProps) {
  return (
    <>
      <input {...rest} list={listId} />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
