interface ErrorMessageProps {
  message?: string;
  className?: string;
}

/**
 * Reusable error display component.
 *
 * Server Component — renders a styled error banner when `message` is provided.
 * Returns `null` when there is nothing to show, keeping the DOM clean.
 */
export default function ErrorMessage({
  message,
  className,
}: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 ${className ?? ""}`}
    >
      {message}
    </div>
  );
}
