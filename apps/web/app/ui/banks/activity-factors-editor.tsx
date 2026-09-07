"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import type { BankActivityFactor } from "@/app/lib/definitions";
import {
  createActivityFactor,
  deleteActivityFactor,
  updateActivityFactor,
} from "@/app/actions/banks";

interface ActivityFactorsEditorProps {
  bankCode: string;
  factors: BankActivityFactor[];
}

export default function ActivityFactorsEditor({
  bankCode,
  factors,
}: ActivityFactorsEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankActivityFactor | null>(
    null,
  );
  const [pendingSave, setPendingSave] = useState<{
    factor: BankActivityFactor;
    dirtyFields: Record<string, unknown>;
  } | null>(null);

  const handleConfirmSave = () => {
    if (!pendingSave) return;
    const { factor, dirtyFields } = pendingSave;
    setError(null);

    startTransition(async () => {
      const result = await updateActivityFactor(bankCode, factor.id, dirtyFields);
      if (!result.ok) {
        setError(
          result.errors._form ?? "No se pudo guardar el giro. Intente de nuevo.",
        );
        return;
      }
      setPendingSave(null);
    });
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    setError(null);

    startTransition(async () => {
      const result = await deleteActivityFactor(bankCode, pendingDelete.id);
      if (!result.ok) {
        setError(
          result.errors._form ?? "No se pudo eliminar el giro. Intente de nuevo.",
        );
        return;
      }
      setPendingDelete(null);
    });
  };

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[860px]">
          <thead>
            <tr className="border-b border-gf-border bg-gf-surface-dim/60">
              <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                Giro
              </th>
              <th className="py-3 px-3 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                Alias SAT
              </th>
              <th className="py-3 px-3 text-xs font-semibold text-gf-text-muted uppercase tracking-wider w-[110px]">
                Factor
              </th>
              <th className="py-3 px-3 text-xs font-semibold text-gf-text-muted uppercase tracking-wider w-[140px]">
                Factor declaración
              </th>
              <th className="py-3 px-3 w-[160px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gf-border">
            {factors.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 px-4 text-center text-sm text-gf-text-muted"
                >
                  No hay giros configurados. Puede agregar un factor de
                  actividad; la tabla vacía es válida.
                </td>
              </tr>
            ) : (
              factors.map((factor) => (
                <FactorRow
                  key={factor.id}
                  factor={factor}
                  onRequestSave={(dirtyFields) =>
                    setPendingSave({ factor, dirtyFields })
                  }
                  onRequestDelete={() => setPendingDelete(factor)}
                />
              ))
            )}
            <AddFactorRow
              bankCode={bankCode}
              disabled={isPending}
              onError={setError}
            />
          </tbody>
        </table>
      </div>

      {pendingSave && (
        <ConfirmModal
          title="Confirmar cambio de giro"
          body={
            <>
              Está a punto de actualizar el giro{" "}
              <strong className="text-gf-text">{pendingSave.factor.nativeLabel}</strong>{" "}
              en <strong className="text-gf-text">{bankCode}</strong>. Los factores
              pueden ser mayores a 1 (por ejemplo 1.5).
            </>
          }
          confirmLabel={isPending ? "Guardando..." : "Confirmar y guardar"}
          isPending={isPending}
          onCancel={() => setPendingSave(null)}
          onConfirm={handleConfirmSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Eliminar giro"
          body={
            <>
              Se eliminará el giro{" "}
              <strong className="text-gf-text">{pendingDelete.nativeLabel}</strong>{" "}
              de <strong className="text-gf-text">{bankCode}</strong>. Esta acción no
              se puede deshacer.
            </>
          }
          confirmLabel={isPending ? "Eliminando..." : "Eliminar giro"}
          isPending={isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}

interface FactorRowProps {
  factor: BankActivityFactor;
  onRequestSave: (dirtyFields: Record<string, unknown>) => void;
  onRequestDelete: () => void;
}

function FactorRow({ factor, onRequestSave, onRequestDelete }: FactorRowProps) {
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setDirtyFields({});
  }, [factor]);

  const nativeLabel = (dirtyFields.nativeLabel as string | undefined) ?? factor.nativeLabel;
  const satAliases =
    (dirtyFields.satAliases as string[] | undefined) ?? parseAliases(factor.satAliases);
  const factorValue =
    dirtyFields.factor !== undefined
      ? coerceNumber(dirtyFields.factor)
      : coerceNumber(factor.factor);
  const factorTaxReturn =
    dirtyFields.factorTaxReturn !== undefined
      ? coerceNumber(dirtyFields.factorTaxReturn)
      : coerceNumber(factor.factorTaxReturn);

  const hasChanges = Object.keys(dirtyFields).length > 0;

  const updateField = (field: string, value: unknown) => {
    setDirtyFields((prev) => {
      const next = { ...prev, [field]: value };
      const original =
        field === "satAliases"
          ? parseAliases(factor.satAliases)
          : coerceNumber((factor as unknown as Record<string, unknown>)[field]) ??
            (factor as unknown as Record<string, unknown>)[field];

      if (field === "satAliases") {
        const current = Array.isArray(value) ? value.join("|") : "";
        const orig = (original as string[]).join("|");
        if (current === orig) delete next[field];
      } else if (value === original) {
        delete next[field];
      }
      return next;
    });
  };

  return (
    <tr className="h-[48px] hover:bg-gf-surface-dim/40 transition-colors">
      <td className="py-2 px-4">
        <input
          aria-label="Giro"
          type="text"
          value={nativeLabel}
          onChange={(e) => updateField("nativeLabel", e.target.value)}
          className="h-8 w-full min-w-[160px] rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
        />
      </td>
      <td className="py-2 px-3">
        <input
          aria-label="Alias SAT"
          type="text"
          value={satAliases.join(", ")}
          onChange={(e) => updateField("satAliases", parseAliases(e.target.value))}
          placeholder="medico, dentista"
          className="h-8 w-full rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
        />
      </td>
      <td className="py-2 px-3">
        <FactorInput
          ariaLabel="Factor"
          value={factorValue}
          onCommit={(v) => {
            if (v == null) return;
            updateField("factor", v);
          }}
        />
      </td>
      <td className="py-2 px-3">
        <FactorInput
          ariaLabel="Factor declaración"
          value={factorTaxReturn}
          onCommit={(v) => updateField("factorTaxReturn", v)}
          placeholder="—"
        />
      </td>
      <td className="py-2 px-3 text-right whitespace-nowrap">
        {hasChanges && (
          <button
            type="button"
            onClick={() => onRequestSave(dirtyFields)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gf-red hover:bg-gf-red-dark text-white rounded-full transition-colors shadow-xs mr-1.5"
          >
            <Check className="w-3 h-3" />
            Guardar
          </button>
        )}
        <button
          type="button"
          onClick={onRequestDelete}
          aria-label={`Eliminar giro ${factor.nativeLabel}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

interface AddFactorRowProps {
  bankCode: string;
  disabled: boolean;
  onError: (message: string | null) => void;
}

function AddFactorRow({ bankCode, disabled, onError }: AddFactorRowProps) {
  const [isPending, startTransition] = useTransition();
  const [nativeLabel, setNativeLabel] = useState("");
  const [aliasesDraft, setAliasesDraft] = useState("");
  const [factorDraft, setFactorDraft] = useState("");
  const [taxDraft, setTaxDraft] = useState("");

  const factorValue = parseFactor(factorDraft);
  const canAdd =
    nativeLabel.trim().length > 0 && factorValue != null && !isPending && !disabled;

  const handleAdd = () => {
    if (!canAdd || factorValue == null) return;
    onError(null);

    startTransition(async () => {
      const result = await createActivityFactor(bankCode, {
        nativeLabel: nativeLabel.trim(),
        satAliases: parseAliases(aliasesDraft),
        factor: factorValue,
        factorTaxReturn: parseFactor(taxDraft),
      });

      if (!result.ok) {
        onError(
          result.errors._form ??
            result.errors.nativeLabel ??
            result.errors.factor ??
            "No se pudo agregar el giro. Intente de nuevo.",
        );
        return;
      }

      setNativeLabel("");
      setAliasesDraft("");
      setFactorDraft("");
      setTaxDraft("");
    });
  };

  return (
    <tr className="bg-gf-surface-dim/30">
      <td className="py-2 px-4">
        <input
          aria-label="Nuevo giro"
          type="text"
          value={nativeLabel}
          onChange={(e) => setNativeLabel(e.target.value)}
          placeholder="Nombre del giro"
          className="h-8 w-full min-w-[160px] rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
        />
      </td>
      <td className="py-2 px-3">
        <input
          aria-label="Alias SAT del nuevo giro"
          type="text"
          value={aliasesDraft}
          onChange={(e) => setAliasesDraft(e.target.value)}
          placeholder="alias1, alias2"
          className="h-8 w-full rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
        />
      </td>
      <td className="py-2 px-3">
        <input
          aria-label="Factor del nuevo giro"
          type="text"
          inputMode="decimal"
          value={factorDraft}
          onChange={(e) => setFactorDraft(sanitizeFactorDraft(e.target.value))}
          placeholder="1.5"
          className="h-8 w-full rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text tabular-nums focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
        />
      </td>
      <td className="py-2 px-3">
        <input
          aria-label="Factor declaración del nuevo giro"
          type="text"
          inputMode="decimal"
          value={taxDraft}
          onChange={(e) => setTaxDraft(sanitizeFactorDraft(e.target.value))}
          placeholder="—"
          className="h-8 w-full rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text tabular-nums focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
        />
      </td>
      <td className="py-2 px-3 text-right">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
        >
          <Plus className="w-3 h-3" />
          {isPending ? "Agregando..." : "Agregar"}
        </button>
      </td>
    </tr>
  );
}

interface FactorInputProps {
  value: number | null;
  onCommit: (value: number | null) => void;
  ariaLabel: string;
  placeholder?: string;
}

function FactorInput({
  value,
  onCommit,
  ariaLabel,
  placeholder = "0.6",
}: FactorInputProps) {
  const [draft, setDraft] = useState(value == null ? "" : formatFactor(value));

  useEffect(() => {
    setDraft(value == null ? "" : formatFactor(value));
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(sanitizeFactorDraft(e.target.value))}
      onBlur={() => onCommit(parseFactor(draft))}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(parseFactor(draft));
      }}
      className="h-8 w-full rounded-[10px] border border-gf-border bg-white px-2 text-sm text-gf-text tabular-nums focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
    />
  );
}

interface ConfirmModalProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  isPending,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="factor-confirm-title"
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3 text-amber-600">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 id="factor-confirm-title" className="text-lg font-bold text-gf-text">
            {title}
          </h3>
        </div>
        <p className="text-sm text-gf-text-muted">{body}</p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-xs font-semibold rounded-full border border-gf-border text-gf-text hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors shadow-xs"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function coerceNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseFactor(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatFactor(value: number): string {
  return String(Number(value));
}

export function sanitizeFactorDraft(raw: string): string {
  return raw.replace(/[^\d.,]/g, "");
}

export function parseAliases(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // fall through to comma-separated
    }
  }
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
