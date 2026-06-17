"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCaseStatus } from "@/app/actions/cases";
import Button from "@/app/ui/common/button";

interface CaseStatus {
  code: string;
  name: string;
}

interface CaseStatusDropdownProps {
  caseId: string;
  currentCode: string;
  statuses: CaseStatus[];
}

/**
 * Client component for changing mortgage case status.
 *
 * Renders a status dropdown with a "Cambiar" submit button using
 * the institutional Button component. Calls the existing `updateCaseStatus`
 * server action and refreshes the page on success.
 */
export default function CaseStatusDropdown({
  caseId,
  currentCode,
  statuses,
}: CaseStatusDropdownProps) {
  const router = useRouter();
  const [selectedCode, setSelectedCode] = useState(currentCode);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    if (selectedCode === currentCode) return;

    setIsPending(true);
    setError(null);

    const result = await updateCaseStatus(caseId, selectedCode);

    if (result.errors?._form) {
      setError(result.errors._form);
      setIsPending(false);
    } else {
      setIsPending(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gf-border">
      <label
        htmlFor="status-select"
        className="block text-sm font-medium text-gf-text mb-2"
      >
        Cambiar estado
      </label>
      <div className="flex gap-2">
        <select
          id="status-select"
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
          disabled={isPending}
          className="block w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red disabled:opacity-50"
        >
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={isPending || selectedCode === currentCode}
          onClick={handleChange}
          loading={isPending}
        >
          Cambiar
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
