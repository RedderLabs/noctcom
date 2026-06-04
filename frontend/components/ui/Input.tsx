'use client';

import { forwardRef, useState, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, leftIcon, rightAddon, className, type, id, ...rest },
  ref,
) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-text-primary opacity-75 mb-1.5 tracking-wide uppercase"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          className={cn(
            'w-full h-11 bg-bg-surface text-text-primary',
            'border border-border-subtle rounded-lg',
            'placeholder:text-text-muted',
            'transition-all duration-150 ease-out',
            'hover:border-border-strong',
            'focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]',
            leftIcon ? 'pl-10' : 'pl-3.5',
            isPassword || rightAddon ? 'pr-10' : 'pr-3.5',
            error && 'border-red-500/50 focus:border-red-500/70 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.12)]',
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
        {rightAddon && !isPassword && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightAddon}</span>
        )}
      </div>
      {(error || hint) && (
        <p className={cn(
          'mt-1.5 text-xs',
          error ? 'text-red-400' : 'text-text-tertiary',
        )}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
