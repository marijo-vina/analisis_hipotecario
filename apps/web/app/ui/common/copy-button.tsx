"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

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
      className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-all border shadow-2xs ${
        disabled
          ? "cursor-not-allowed border-gf-border/50 bg-gf-surface-dim text-gf-text-muted/50"
          : copied
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-gf-border bg-white text-gf-text hover:bg-gf-surface-dim hover:border-gf-border/80 active:scale-[0.98]"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span>Copiado</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-gf-text-muted" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
