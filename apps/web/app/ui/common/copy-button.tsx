"use client";

import { useState, useCallback } from "react";

interface CopyButtonProps {
  /** Text to copy to clipboard. */
  value: string;
  /** Label shown before copying. */
  label?: string;
  /** If true, button is disabled (value not available). */
  disabled?: boolean;
}

/**
 * Inline copy button for manual validation data.
 *
 * Shows "Copiar" → copies to clipboard → shows "Copiado" for 1.5 s.
 * Disabled when value is not available.
 */
export default function CopyButton({
  value,
  label = "Copiar",
  disabled = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API may fail silently in some contexts
    }
  }, [value, disabled]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors border ${
        disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
          : copied
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
      }`}
    >
      {copied ? (
        <>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Copiado
        </>
      ) : (
        <>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
