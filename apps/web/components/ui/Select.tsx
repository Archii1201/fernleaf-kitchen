'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import { Field, fieldClass } from './Input';

export function Select({
  label,
  hint,
  className = '',
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} hint={hint} htmlFor={selectId} className={className}>
      <select id={selectId} className={`${fieldClass} appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9`} style={{ backgroundImage: CHEVRON }} {...rest}>
        {children}
      </select>
    </Field>
  );
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
