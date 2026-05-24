'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/30 shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_4px_16px_-4px_rgba(139,92,246,0.4)] hover:shadow-[0_0_0_1px_rgba(139,92,246,0.6),0_8px_24px_-4px_rgba(139,92,246,0.5)]',
  secondary: 'bg-[var(--color-bg-surface-2)] hover:bg-[var(--color-bg-surface-3)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]',
  ghost: 'bg-transparent hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30',
  outline: 'bg-transparent hover:bg-violet-500/10 text-violet-300 border border-violet-500/40',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex items-center justify-center font-medium rounded-lg',
        'transition-all duration-150 ease-out',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
