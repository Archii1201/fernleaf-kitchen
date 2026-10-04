'use client';

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const fieldClass =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#a3a8b3] focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(244,163,64,0.18)] disabled:opacity-60';

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 text-sm ${className}`}>
      <label htmlFor={htmlFor} className="font-semibold text-[var(--navy)]">
        {label}
      </label>
      {children}
      {hint ? <span className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  className = '',
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      <input id={inputId} className={fieldClass} {...rest} />
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  className = '',
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      <textarea id={inputId} rows={3} className={fieldClass} {...rest} />
    </Field>
  );
}

export function Checkbox({
  label,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded accent-[var(--orange-deep)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} bg-white pl-9`}
      />
    </label>
  );
}
