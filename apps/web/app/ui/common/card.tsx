import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-gf-surface border border-gf-border rounded-[var(--radius-md)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 ${className}`}
    >
      {children}
    </div>
  );
}
