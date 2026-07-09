"use client";

import { useState, useEffect, useCallback } from "react";

import {
  triggerAnalysis,
  fetchLatestAnalysis,
  submitReviewDecision,
} from "@/app/actions/analysis";
import type {
  AnalysisRun,
  FieldComparison,
  ReviewDecision,
} from "@/app/lib/definitions";
import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";

// ── Tipos locales ────────────────────────────────────────────────────────────

interface AnalysisSectionProps {
  caseId: string;
  statusCode: string;
}

type UiState =
  | { phase: "loading" }
  | { phase: "idle" } // sin análisis previo
  | { phase: "analyzing" }
  | { phase: "result"; run: AnalysisRun }
  | { phase: "error"; message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  "official-id": "INE",
  payroll: "Nómina",
  "bank-statement": "Edo. cuenta",
  "credit-bureau": "Buró",
  client: "Expediente",
};

const SOURCE_ICONS: Record<string, string> = {
  "official-id": "🆔",
  payroll: "💰",
  "bank-statement": "🏦",
  "credit-bureau": "📊",
  client: "📋",
};

const OUTCOME_BADGE: Record<string, { label: string; className: string }> = {
  PASS: { label: "Cumple", className: "bg-green-100 text-green-800" },
  PARTIAL: {
    label: "Validación parcial",
    className: "bg-yellow-100 text-yellow-800",
  },
  FAIL: { label: "No cumple", className: "bg-red-100 text-red-800" },
};

const FIELD_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  MATCH: { label: "Coincide", className: "bg-green-50 text-green-700" },
  MISMATCH: {
    label: "No coincide",
    className: "bg-red-50 text-red-700",
  },
  NOT_AVAILABLE: {
    label: "No disponible",
    className: "bg-gray-100 text-gray-500",
  },
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function AnalysisSection({
  caseId,
  statusCode,
}: AnalysisSectionProps) {
  const [state, setState] = useState<UiState>({ phase: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Cargar el último análisis al montar
  const loadLatest = useCallback(async () => {
    setState({ phase: "loading" });
    const res = await fetchLatestAnalysis(caseId);
    if (!res.success) {
      setState({ phase: "error", message: res.error ?? "Error desconocido" });
      return;
    }
    if (res.data) {
      setState({ phase: "result", run: res.data });
    } else {
      setState({ phase: "idle" });
    }
  }, [caseId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Disparar análisis
  const handleAnalyze = async () => {
    setState({ phase: "analyzing" });
    setActionError(null);
    const res = await triggerAnalysis(caseId);
    if (!res.success || !res.data) {
      setState({ phase: "error", message: res.error ?? "Error" });
      return;
    }
    // Recargar para obtener el run completo con alerts
    await loadLatest();
  };

  // Decisión de revisión
  const handleReviewDecision = async (
    action: ReviewDecision["action"],
    justification?: string,
  ) => {
    if (!isResultState(state)) return;
    setReviewSubmitting(true);
    setActionError(null);
    const res = await submitReviewDecision(
      caseId,
      state.run.id,
      action,
      justification,
    );
    setReviewSubmitting(false);
    if (!res.success) {
      setActionError(res.error ?? "Error");
      return;
    }
    await loadLatest();
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <div className="mb-4">
        <AnalysisDivider />
        <Card>
          <p className="text-sm text-gf-text-muted animate-pulse">
            Cargando análisis...
          </p>
        </Card>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mb-4">
        <AnalysisDivider />
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{state.message}</p>
          <Button
            variant="secondary"
            type="button"
            onClick={loadLatest}
          >
            Reintentar
          </Button>
        </Card>
      </div>
    );
  }

  if (state.phase === "idle" || state.phase === "analyzing") {
    const isAnalyzing = state.phase === "analyzing";
    return (
      <div className="mb-4">
        <AnalysisDivider />
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gf-text">
                Análisis del expediente
              </h3>
              <p className="text-xs text-gf-text-muted mt-1">
                Sin analizar — Ejecuta el análisis para validar la identidad
                del cliente.
              </p>
            </div>
            <Button
              variant="primary"
              type="button"
              disabled={isAnalyzing}
              onClick={handleAnalyze}
            >
              {isAnalyzing ? "Analizando..." : "Analizar expediente"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // state.phase === "result"
  const { run } = state;
  return (
    <div className="mb-4 space-y-4">
      <AnalysisDivider />

      {/* ── Barra de estado operativo ──────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <StatusBadge
          label="Estado operativo"
          value={statusCode === "REQUIRES_REVIEW" ? "Requiere revisión" : statusCode}
          variant="operational"
        />
        <StatusBadge
          label="Validación"
          value={OUTCOME_BADGE[run.outcome]?.label ?? run.outcome}
          variant={run.outcome === "FAIL" ? "fail" : run.outcome === "PARTIAL" ? "partial" : "pass"}
        />
      </div>

      {/* ── Origen del problema (si hay FAIL/PARTIAL) ──────────────────── */}
      {run.outcome !== "PASS" && (
        <ProblemOrigin fields={run.detail.fields} />
      )}

      {/* ── Tabla comparativa ──────────────────────────────────────────── */}
      <ValidationTable
        sources={run.detail.sources}
        fields={run.detail.fields}
      />

      {/* ── Resumen de identidad ───────────────────────────────────────── */}
      <IdentitySummaryCard fields={run.detail.fields} />

      {/* ── Acciones de asesora ────────────────────────────────────────── */}
      <ActionsGroup
        onReviewDecision={handleReviewDecision}
        isSubmitting={reviewSubmitting}
        error={actionError}
        hasExistingDecision={
          (run.reviewDecisions?.length ?? 0) > 0
        }
      />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function AnalysisDivider() {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex-1 h-px bg-gf-red/20" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gf-text-muted whitespace-nowrap">
        Análisis del expediente
      </span>
      <div className="flex-1 h-px bg-gf-red/20" />
    </div>
  );
}

function StatusBadge({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "operational" | "pass" | "partial" | "fail";
}) {
  const colors: Record<string, string> = {
    operational: "bg-yellow-50 border-yellow-200 text-yellow-800",
    pass: "bg-green-50 border-green-200 text-green-800",
    partial: "bg-yellow-50 border-yellow-200 text-yellow-800",
    fail: "bg-red-50 border-red-200 text-red-800",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${colors[variant]}`}
    >
      <span className="text-xs text-gf-text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ProblemOrigin({ fields }: { fields: FieldComparison[] }) {
  const mismatches = fields.filter((f) => f.status === "MISMATCH");
  if (mismatches.length === 0) return null;

  // Tomar la primera discrepancia para mostrar
  const first = mismatches[0];
  const sources = Object.keys(first.normalizedValue).filter(
    (k) => first.normalizedValue[k] !== null,
  );
  const docSource = sources.find((s) => s !== "client") ?? sources[0];

  return (
    <Card className="border-red-200 bg-white">
      <div className="flex items-start gap-6 flex-wrap">
        <div>
          <p className="text-[10px] text-gf-text-muted uppercase tracking-wide">
            Documento con discrepancia
          </p>
          <p className="text-sm font-medium text-gf-text">
            {SOURCE_LABELS[docSource] ?? docSource}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gf-text-muted uppercase tracking-wide">
            Campo afectado
          </p>
          <p className="text-sm font-semibold text-gf-red uppercase">
            {first.fieldName}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gf-text-muted uppercase tracking-wide">
            Valor en documento
          </p>
          <p className="text-sm font-medium text-gf-red">
            {docSource ? (first.originalValue[docSource] ?? "—") : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gf-text-muted uppercase tracking-wide">
            Valor esperado
          </p>
          <p className="text-sm font-medium text-green-700">
            {first.normalizedValue["client"] ?? "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ValidationTable({
  sources,
  fields,
}: {
  sources: string[];
  fields: FieldComparison[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gf-bg-secondary rounded-t-lg">
            <th className="text-left px-3 py-2 text-xs font-medium text-gf-text-muted uppercase tracking-wide w-[170px]">
              Documento
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gf-text-muted uppercase tracking-wide">
              Nombre
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gf-text-muted uppercase tracking-wide">
              RFC
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gf-text-muted uppercase tracking-wide">
              CURP
            </th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gf-text-muted uppercase tracking-wide w-[130px]">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr
              key={source}
              className="border-b border-gf-border last:border-0 hover:bg-gf-bg-hover transition-colors"
            >
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs">
                    {SOURCE_ICONS[source] ?? "📄"}
                  </span>
                  <span className="text-xs font-medium text-gf-text">
                    {SOURCE_LABELS[source] ?? source}
                  </span>
                </span>
              </td>
              {(["fullName", "rfc", "curp"] as const).map((fieldName) => {
                const field = fields.find((f) => f.fieldName === fieldName);
                const value = field?.originalValue[source];
                const status = field?.status;
                const isMismatch =
                  status === "MISMATCH" && value != null;
                return (
                  <td key={fieldName} className="px-3 py-2.5">
                    {value != null ? (
                      <span
                        className={`text-xs ${
                          isMismatch
                            ? "text-gf-red font-medium"
                            : "text-gf-text"
                        }`}
                      >
                        {value}
                      </span>
                    ) : (
                      <span className="text-xs text-gf-text-muted italic">
                        —
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5">
                <FieldStatusBadge fields={fields} source={source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldStatusBadge({
  fields,
  source,
}: {
  fields: FieldComparison[];
  source: string;
}) {
  // Determinar estado por fuente: si TODOS los campos son MATCH → Coincide,
  // si alguno es MISMATCH → No coincide,
  // si todos son NOT_AVAILABLE → No disponible
  const statuses = fields.map((f) => f.status);
  if (statuses.every((s) => s === "NOT_AVAILABLE")) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
        No disponible
      </span>
    );
  }
  if (statuses.some((s) => s === "MISMATCH")) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">
        No coincide
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">
      Coincide
    </span>
  );
}

function IdentitySummaryCard({ fields }: { fields: FieldComparison[] }) {
  const matchCount = fields.filter((f) =>
    Object.values(f.normalizedValue).some(
      (v) => v !== null,
    ) && f.status === "MATCH",
  ).length;
  const mismatchCount = fields.filter((f) => f.status === "MISMATCH").length;
  const unavailableCount = fields.filter(
    (f) => f.status === "NOT_AVAILABLE",
  ).length;

  const hasIssues = mismatchCount > 0;

  return (
    <Card
      className={hasIssues ? "border-red-200 bg-red-50/30" : "border-green-200 bg-green-50/30"}
    >
      {/* MiniStats */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gf-text">
            {matchCount} coinciden
          </span>
        </div>
        <span className="text-xs text-gf-text-muted">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-gf-text">
            {mismatchCount} discrepancias
          </span>
        </div>
        <span className="text-xs text-gf-text-muted">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-xs text-gf-text">
            {unavailableCount} no comparable
          </span>
        </div>
      </div>

      {hasIssues && (
        <p className="text-[11px] text-gf-text-muted">
          Si existieran múltiples discrepancias, se mostrarían aquí con detalle
          de cada campo y documento afectado.
        </p>
      )}

      {!hasIssues && (
        <p className="text-[11px] text-green-700">
          Todos los campos comparables coinciden entre documentos.
        </p>
      )}
    </Card>
  );
}

function ActionsGroup({
  onReviewDecision,
  isSubmitting,
  error,
  hasExistingDecision,
}: {
  onReviewDecision: (
    action: ReviewDecision["action"],
    justification?: string,
  ) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  hasExistingDecision: boolean;
}) {
  const [showJustification, setShowJustification] = useState(false);
  const [justification, setJustification] = useState("");

  if (hasExistingDecision) {
    return (
      <Card className="bg-gf-bg-secondary">
        <p className="text-sm text-gf-text-muted">
          Ya se registró una decisión para este análisis.
        </p>
      </Card>
    );
  }

  return (
    <Card className="bg-gf-bg-secondary">
      <p className="text-xs text-gf-text-muted mb-3">¿Qué deseas hacer?</p>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="secondary"
          type="button"
          disabled={isSubmitting}
          onClick={() =>
            (document.getElementById("documentos") as HTMLElement)?.scrollIntoView({ behavior: "smooth" })
          }
        >
          📄 Revisar documentos
        </Button>

        <Button
          variant="secondary"
          type="button"
          disabled={isSubmitting}
          onClick={() => onReviewDecision("CONFIRM_ISSUE")}
        >
          {isSubmitting ? "..." : "✅ Confirmar"}
        </Button>

        {!showJustification ? (
          <Button
            variant="secondary"
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowJustification(true)}
          >
            ✅ Marcar como falso positivo
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <input
              type="text"
              className="px-2 py-1 text-sm border border-gf-border rounded"
              placeholder="Justificación"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
            <Button
              variant="primary"
              type="button"
              disabled={isSubmitting || !justification.trim()}
              onClick={() => {
                onReviewDecision("MARK_FALSE_POSITIVE", justification);
                setShowJustification(false);
                setJustification("");
              }}
            >
              Confirmar
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowJustification(false)}
            >
              Cancelar
            </Button>
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="destructive"
          type="button"
          disabled={isSubmitting}
          onClick={() => onReviewDecision("CANCEL_CASE")}
        >
          ⚠️ Cancelar expediente
        </Button>
      </div>

      {error && (
        <p className="text-xs text-gf-red mt-2">{error}</p>
      )}

      <p className="text-[11px] text-gf-text-muted mt-3">
        La cancelación requerirá confirmación mediante un modal.
      </p>
    </Card>
  );
}

// ── Type guard ────────────────────────────────────────────────────────────

function isResultState(
  state: UiState,
): state is { phase: "result"; run: AnalysisRun } {
  return state.phase === "result";
}
