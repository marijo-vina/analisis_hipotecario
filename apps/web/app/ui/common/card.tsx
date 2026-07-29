import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white border border-gf-border rounded-[12px] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] p-6 ${className}`}
    >
      {children}
    </div>
  );
}
