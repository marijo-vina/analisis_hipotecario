import type { ReactNode } from 'react';

interface FormFieldProps {
  /** Label text displayed above the input */
  label: string;
  /** Name attribute, also used as htmlFor on the label */
  name: string;
  /** Inline validation error message (red text below field) */
  error?: string;
  /** Input element(s) to render inside the field */
  children: ReactNode;
  /** Extra props forwarded to the inner input (optional convenience) */
  inputProps?: Record<string, unknown>;
  /** Whether the field is required (adds visual indicator) */
  required?: boolean;
}

/**
 * Server-presentational FormField wrapper.
 *
 * Provides consistent spacing, label, and inline error display.
 * The actual input element is passed via `children` so it works
 * with any form control (text input, select, textarea, etc.).
 * Input styling (height 42px, border #F0C9CF, radius 8px,
 * focus border #B0002A) should be applied by the parent form
 * to the input element passed as children.
 */
export default function FormField({
  label,
  name,
  error,
  children,
  required = false,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-gf-text font-medium text-sm"
      >
        {label}
        {required && <span className="text-gf-red ml-0.5" aria-hidden="true">*</span>}
      </label>
      <div className="w-full">
        {children}
      </div>
      {error && (
        <p className="text-red-600 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
