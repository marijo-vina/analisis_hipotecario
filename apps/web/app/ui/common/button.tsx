import type { ReactNode } from 'react';
import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps {
  variant: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<
  ButtonVariant,
  { base: string; hover: string }
> = {
  primary: {
    base: 'bg-gf-red text-white',
    hover: 'hover:bg-gf-red-dark',
  },
  secondary: {
    base: 'bg-white text-gf-text border border-gf-border',
    hover: 'hover:bg-gray-50',
  },
  destructive: {
    base: 'bg-red-600 text-white',
    hover: 'hover:bg-red-700',
  },
};

export default function Button({
  variant,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  href,
  children,
}: ButtonProps) {
  const { base, hover } = VARIANT_CLASSES[variant];

  const className = [
    base,
    hover,
    'rounded-[var(--radius-sm)]',
    'font-semibold',
    'px-5',
    'py-2.5',
    'text-sm',
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-2',
    'transition-colors',
    'duration-150',
    disabled || loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = loading ? (
    <>
      <svg
        className="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span>Cargando...</span>
    </>
  ) : (
    children
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={className}
    >
      {content}
    </button>
  );
}
