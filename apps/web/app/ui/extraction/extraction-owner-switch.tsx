"use client";

import { Building2, User } from "lucide-react";

export type ExtractionOwner = "SHAREHOLDER" | "COMPANY";

const OPTIONS: {
  id: ExtractionOwner;
  label: string;
  icon: typeof User;
}[] = [
  { id: "SHAREHOLDER", label: "Persona física · Accionista", icon: User },
  { id: "COMPANY", label: "Persona moral · Empresa", icon: Building2 },
];

interface ExtractionOwnerSwitchProps {
  owner: ExtractionOwner;
  onChange: (owner: ExtractionOwner) => void;
}

/**
 * Chooses whose extracted reading is on screen.
 * Selected state uses the institutional soft container from design.md
 * (primary-container), not a solid primary button.
 */
export default function ExtractionOwnerSwitch({
  owner,
  onChange,
}: ExtractionOwnerSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label="De quién ver la lectura"
      className="inline-flex flex-wrap gap-2"
    >
      {OPTIONS.map((option) => {
        const selected = owner === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition-colors ${
              selected
                ? "border-[#F3C4CB] bg-gf-red-soft text-gf-red"
                : "border-gf-border bg-white text-gf-text-muted hover:bg-gf-surface hover:text-gf-text"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
