import Link from 'next/link';
import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'navy' | 'ghost' | 'subtle' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--orange)] text-[var(--navy-dark)] shadow-[0_6px_16px_rgba(229,139,32,0.25)] hover:bg-[var(--orange-deep)]',
  navy: 'bg-[var(--navy)] text-white hover:bg-[var(--navy-dark)]',
  ghost: 'border border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--orange)] hover:text-[var(--orange-deep)]',
  subtle: 'text-[var(--navy)] hover:bg-[var(--cream-soft)]',
  danger: 'border border-[var(--danger)]/30 bg-white text-[var(--danger)] hover:bg-[var(--danger-soft)]',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-8 px-3 text-sm gap-1.5',
  md: 'min-h-10 px-4 gap-2',
  lg: 'min-h-14 px-6 text-lg gap-2.5',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className = '') {
  return `inline-flex items-center justify-center rounded-[var(--radius-sm)] font-semibold transition-[background-color,color,border-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  busy,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} className="h-4 w-4" />
      ) : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </Link>
  );
}
