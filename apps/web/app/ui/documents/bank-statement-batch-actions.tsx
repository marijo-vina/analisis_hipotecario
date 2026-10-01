"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RotateCw } from "lucide-react";
import type { Document } from "@/app/lib/definitions";
import {
  processDocument,
  extractBankStatement,
} from "@/app/actions/documents";
import { mapWithConcurrency } from "@/app/lib/concurrency";

const BATCH_CONCURRENCY = 3;

const PENDING_STATUSES = new Set([
  "UPLOADED",
  "OCR_ERROR",
  "ERROR",
  "EXTRACTION_ERROR",
]);

interface BankStatementBatchActionsProps {
  caseId: string;
  documents: Document[];
}

interface BatchItemResult {
  documentId: string;
  originalName: string;
  ok: boolean;
  error?: string;
}

/**
 * Batch OCR + bank-statement extraction with limited concurrency.
 * Prefer pending/error docs; if none, reprocess already PROCESSED ones.
 */
export default function BankStatementBatchActions({
  caseId,
  documents,
}: BankStatementBatchActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { targets, mode } = useMemo(() => {
    const bankStatements = documents.filter(
      (d) =>
        d.documentType.code === "BANK_STATEMENT" &&
        d.documentStatus.code !== "PROCESSING",
    );
    const pending = bankStatements.filter((d) =>
      PENDING_STATUSES.has(d.documentStatus.code),
    );
    if (pending.length > 0) {
      return { targets: pending, mode: "pending" as const };
    }
    const processed = bankStatements.filter(
      (d) => d.documentStatus.code === "PROCESSED",
    );
    return { targets: processed, mode: "reprocess" as const };
  }, [documents]);

  const handleBatch = useCallback(async () => {
    if (targets.length === 0 || loading) return;

    setLoading(true);
    setError(null);
    setSummary(null);
    setProgress({ done: 0, total: targets.length });

    const results = await mapWithConcurrency(
      targets,
      BATCH_CONCURRENCY,
      async (doc): Promise<BatchItemResult> => {
        const needsForce =
          doc.documentStatus.code === "PROCESSED" ||
          doc.documentStatus.code === "OCR_ERROR" ||
          doc.documentStatus.code === "ERROR" ||
          doc.documentStatus.code === "EXTRACTION_ERROR" ||
          mode === "reprocess";

        try {
          await processDocument(caseId, doc.id, needsForce);
          await extractBankStatement(caseId, doc.id);
          setProgress((prev) => ({
            done: (prev?.done ?? 0) + 1,
            total: targets.length,
          }));
          return { documentId: doc.id, originalName: doc.originalName, ok: true };
        } catch (err) {
          setProgress((prev) => ({
            done: (prev?.done ?? 0) + 1,
            total: targets.length,
          }));
          return {
            documentId: doc.id,
            originalName: doc.originalName,
            ok: false,
            error: err instanceof Error ? err.message : "Error desconocido",
          };
        }
      },
    );

    const failed = results.filter((r) => !r.ok);
    const succeeded = results.length - failed.length;

    if (failed.length === 0) {
      setSummary(
        mode === "reprocess"
          ? `Se reprocesaron ${succeeded} estado(s) de cuenta.`
          : `Se procesaron ${succeeded} estado(s) de cuenta.`,
      );
    } else if (succeeded === 0) {
      setError(
        `Falló el procesamiento de todos los documentos (${failed.length}).`,
      );
    } else {
      setError(
        `${succeeded} ok, ${failed.length} con error. Revisa: ${failed
          .slice(0, 2)
          .map((f) => f.originalName)
          .join(", ")}${failed.length > 2 ? "…" : ""}`,
      );
      setSummary(null);
    }

    setLoading(false);
    setProgress(null);
    router.refresh();
  }, [caseId, targets, mode, loading, router]);

  if (targets.length === 0) return null;

  const label =
    mode === "reprocess"
      ? `Reprocesar todos (${targets.length})`
      : `Procesar todos (${targets.length})`;

  return (
    <div className="mb-3 space-y-1.5">
      <button
        type="button"
        onClick={handleBatch}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold border border-gf-red/30 bg-gf-red-soft text-gf-red rounded-lg px-2.5 py-2 hover:bg-gf-red hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          mode === "reprocess"
            ? "Reprocesar todos los estados de cuenta en paralelo (máx. 3 a la vez)"
            : "Procesar todos los estados de cuenta pendientes en paralelo (máx. 3 a la vez)"
        }
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : mode === "reprocess" ? (
          <RotateCw className="w-3.5 h-3.5" strokeWidth={2} />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current" />
        )}
        <span>
          {loading && progress
            ? `Procesando ${progress.done}/${progress.total}…`
            : label}
        </span>
      </button>
      {summary && (
        <p className="text-[11px] text-emerald-700 leading-snug">{summary}</p>
      )}
      {error && (
        <p className="text-[11px] text-red-600 leading-snug">{error}</p>
      )}
    </div>
  );
}
