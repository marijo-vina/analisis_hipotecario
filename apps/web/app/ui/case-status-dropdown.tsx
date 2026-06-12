'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCaseStatus } from '@/app/actions/cases';

interface CaseStatus {
  code: string;
  name: string;
}

interface CaseStatusDropdownProps {
  caseId: string;
  currentCode: string;
  statuses: CaseStatus[];
}

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
    <div className="mt-4">
      <label
        htmlFor="status-select"
        className="block text-sm font-medium text-slate-700"
      >
        Cambiar estado
      </label>
      <div className="mt-1 flex gap-2">
        <select
          id="status-select"
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
          className="block w-full rounded-md border-slate-300 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          disabled={isPending}
        >
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleChange}
          disabled={isPending || selectedCode === currentCode}
          className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Cambiando...' : 'Cambiar'}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
