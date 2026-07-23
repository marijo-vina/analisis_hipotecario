"use client";

import { useState, useEffect, useCallback } from "react";

import {
  triggerAnalysis,
  fetchLatestAnalysis,
} from "@/app/actions/analysis";
import { parseBankStatements } from "@/app/lib/extraction";
import type {
  AnalysisRun,
  FieldComparison,
  Document,
} from "@/app/lib/definitions";
import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";
import EstadosConciliacion from "@/app/ui/extraction/estados-conciliacion";
import LiabilityCalculationSection from "@/app/ui/expedientes/liability-calculation-section";
import IncomeCalculationSection from "@/app/ui/expedientes/income-calculation-section";
import BankComparisonTab from "@/app/ui/expedientes/bank-comparison-tab";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AnalysisSectionProps {
  caseId: string;
  statusCode: string;
  /** All documents in the case (needed for conciliación cross-tab) */
  documents: Document[];
}

type TabId = "validaciones" | "motor" | "bancos";

type UiState =
  | { phase: "loading" }
  | { phase: "idle" }
  | { phase: "analyzing" }
  | { phase: "result"; run: AnalysisRun }
  | { phase: "observations"; run: AnalysisRun }
  | { phase: "error"; message: string };

// ── Constantes ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "validaciones", label: "Validaciones" },
  { id: "motor", label: "Motor financiero" },
  { id: "bancos", label: "Comparativa bancaria" },
];

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

const FIELD_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  MATCH: { label: "Coincide", className: "bg-green-50 text-green-700" },
  MISMATCH: { label: "No coincide", className: "bg-red-50 text-red-700" },
  NOT_AVAILABLE: {
    label: "No disponible",
    className: "bg-gray-100 text-gray-500",
  },
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function AnalysisSection({
  caseId,
  statusCode,
  documents,
}: AnalysisSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>("validaciones");
  const [state, setState] = useState<UiState>({ phase: "loading" });

  // Determinar si el resultado tiene observaciones
  const isObservations = useCallback((run: AnalysisRun): boolean => {
    const bv = run.detail.bankViability;
    if (!bv) return false;
    if (run.outcome === "PARTIAL") return true;
    return bv.productMatches.some(
      (m) => m.status === "CONDITIONED" || m.status === "REQUIRES_REVIEW",
    );
  }, []);

  // Cargar último análisis al montar
  const loadLatest = useCallback(async () => {
    setState({ phase: "loading" });
    const res = await fetchLatestAnalysis(caseId);
    if (!res.success) {
      setState({ phase: "error", message: res.error ?? "Error" });
      return;
    }
    if (res.data) {
      setState(
        isObservations(res.data)
          ? { phase: "observations", run: res.data }
          : { phase: "result", run: res.data },
      );
    } else {
      setState({ phase: "idle" });
    }
  }, [caseId, isObservations]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Disparar análisis
  const handleAnalyze = async () => {
    setState({ phase: "analyzing" });
    const res = await triggerAnalysis(caseId);
    if (!res.success || !res.data) {
      setState({ phase: "error", message: res.error ?? "Error" });
      return;
    }
    await loadLatest();
  };

  // Conciliación data
  const bankStatementDocs = documents.filter(
    (d) => d.documentType.code === "BANK_STATEMENT",
  );
  const payrollDocs = documents.filter(
    (d) => d.documentType.code === "PAYROLL_RECEIPT",
  );
  const bankParsed = parseBankStatements(bankStatementDocs);

  // ── Button label/variant based on phase ─────────────────────────────────
  const headerButton = (() => {
    switch (state.phase) {
      case "idle":
        return (
          <Button variant="primary" type="button" onClick={handleAnalyze}>
            Analizar expediente
          </Button>
        );
      case "result":
      case "observations":
        return (
          <Button variant="primary" type="button" onClick={handleAnalyze}>
            Re-ejecutar análisis
          </Button>
        );
      case "analyzing":
        return (
          <Button variant="primary" type="button" disabled>
            Analizando...
          </Button>
        );
      case "error":
        return (
          <Button variant="primary" type="button" onClick={handleAnalyze}>
            Reintentar análisis
          </Button>
        );
      default:
        return null;
    }
  })();

  const isAnalyzing = state.phase === "analyzing";

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mb-4 mt-8">
      {/* ── Header row: título + botón ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gf-text">
          Análisis del expediente
        </h2>
        {headerButton}
      </div>

      {/* ── Stepper — visible during analyzing or error ─────────────────── */}
      {(state.phase === "analyzing" || state.phase === "error") && (
        <AnalysisStepper
          phase={state.phase}
          failedPhase={state.phase === "error" ? "validaciones" : undefined}
        />
      )}

      {/* ── Compact status bar — visible after completion ───────────────── */}
      {(state.phase === "result" || state.phase === "observations") && (
        <CompactStatusBar
          phase={state.phase}
          timestamp={state.run.createdAt}
        />
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-gf-border mb-4 mt-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (!isAnalyzing) setActiveTab(tab.id);
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-gf-red text-gf-red"
                : "border-transparent text-gf-text-muted hover:text-gf-text"
            } ${isAnalyzing ? "pointer-events-none opacity-50" : ""}`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1 border-b-2 border-transparent" />
      </div>

      {/* ── Contenido del tab ───────────────────────────────────────────── */}
      {isAnalyzing ? (
        <p className="text-sm text-gf-text-muted py-8 text-center">
          Los resultados se publicarán al finalizar las tres fases.
        </p>
      ) : (
        <>
          {activeTab === "validaciones" && (
            <ValidacionesTab
              caseId={caseId}
              state={state}
              allDeposits={bankParsed.allDeposits}
              payrollDocs={payrollDocs}
            />
          )}

          {activeTab === "motor" && (
            <>
              <LiabilityCalculationSection caseId={caseId} />
              <div className="mt-6" />
              <IncomeCalculationSection caseId={caseId} />
            </>
          )}

          {activeTab === "bancos" && (
            <BankComparisonTab
              bankViability={
                state.phase === "result" || state.phase === "observations"
                  ? state.run.detail?.bankViability
                  : undefined
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Tab Validaciones ──────────────────────────────────────────────────────────

function ValidacionesTab({
  caseId,
  state,
  allDeposits,
  payrollDocs,
}: {
  caseId: string;
  state: UiState;
  allDeposits: ReturnType<typeof parseBankStatements>["allDeposits"];
  payrollDocs: Document[];
}) {
  return (
    <div className="space-y-6">
      {/* ── A) Validación de identidad ──────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gf-text mb-3">
          Validación de identidad
        </h3>
        <IdentityValidationSection
          state={state}
        />
      </section>

      {/* ── B) Conciliación nómina vs banco ─────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gf-text mb-3">
          Conciliación nómina vs banco
        </h3>
        {allDeposits.length > 0 && payrollDocs.length > 0 ? (
          <EstadosConciliacion
            caseId={caseId}
            allDeposits={allDeposits}
            payrollDocs={payrollDocs}
          />
        ) : (
          <Card>
            <p className="text-sm text-gf-text-muted">
              Sin datos suficientes para conciliación. Se requieren estados de
              cuenta y recibos de nómina procesados.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

// ── Sección: Validación de identidad ──────────────────────────────────────────

function IdentityValidationSection({
  state,
}: {
  state: UiState;
}) {
  if (state.phase === "loading") {
    return (
      <Card>
        <p className="text-sm text-gf-text-muted animate-pulse">
          Cargando análisis...
        </p>
      </Card>
    );
  }

  if (state.phase === "error") {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{state.message}</p>
      </Card>
    );
  }

  if (state.phase === "idle" || state.phase === "analyzing") {
    return (
      <Card>
        <p className="text-sm text-gf-text-muted">
          Sin analizar — ejecuta las validaciones para comparar identidad entre
          documentos.
        </p>
      </Card>
    );
  }

  const { run } = state as { phase: "result" | "observations"; run: AnalysisRun };

  return (
    <div className="space-y-4">
      {/* ── Resumen de identidad (discrepancias) ────────────────────────── */}
      <IdentitySummaryCard
        fields={run.detail.fields}
        sources={run.detail.sources}
      />

      {/* ── Tabla comparativa completa ──────────────────────────────────── */}
      <ValidationTable
        sources={run.detail.sources}
        fields={run.detail.fields}
      />
    </div>
  );
}

// ── Tabla comparativa (colapsable) ────────────────────────────────────────────

function ValidationTable({
  sources,
  fields,
}: {
  sources: string[];
  fields: FieldComparison[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="!p-0 overflow-hidden">
      {/* ── Toggle button ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gf-bg-hover transition-colors"
      >
        <svg
          className={`h-4 w-4 text-gf-text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="text-xs font-medium text-gf-text-muted uppercase tracking-wide">
          {expanded ? "Ocultar detalles" : "Ver detalles"}
        </span>
        <span className="text-[10px] text-gf-text-muted/60">
          — comparativa completa de todos los documentos
        </span>
      </button>

      {/* ── Collapsible table ──────────────────────────────────────────── */}
      {expanded && (
        <div className="overflow-x-auto border-t border-gf-border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gf-bg-secondary">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gf-text-muted uppercase tracking-wide w-[170px] border-b border-gf-border">
                  Documento
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gf-text-muted uppercase tracking-wide border-b border-gf-border">
                  NOMBRE
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gf-text-muted uppercase tracking-wide border-b border-gf-border">
                  RFC
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gf-text-muted uppercase tracking-wide border-b border-gf-border">
                  CURP
                </th>
              </tr>
            </thead>
            <tbody>
              {sources
                .filter((s) => s in SOURCE_LABELS)
                .map((source) => (
                <tr
                  key={source}
                  className="border-b border-gf-border/60 hover:bg-gf-bg-hover transition-colors"
                >
                  <td className="px-4 py-2.5">
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
                    const field = fields.find(
                      (f) => f.fieldName === fieldName,
                    );
                    const value = field?.originalValue[source];
                    const isMismatch =
                      field?.status === "MISMATCH" && value != null;
                    return (
                      <td key={fieldName} className="px-4 py-2.5">
                        {value != null ? (
                          <span
                            className={`text-xs ${isMismatch ? "text-gf-red font-medium" : "text-gf-text"}`}
                          >
                            {value}
                          </span>
                        ) : source === "client" &&
                          fieldName !== "fullName" ? (
                          <span className="text-xs text-blue-600 italic">
                            No capturado
                          </span>
                        ) : (
                          <span className="text-xs text-gf-text-muted italic">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── IdentitySummaryCard ───────────────────────────────────────────────────────

function IdentitySummaryCard({
  fields,
}: {
  fields: FieldComparison[];
  sources: string[];
}) {
  const matchCount = fields.filter(
    (f) =>
      Object.values(f.normalizedValue).some((v) => v !== null) &&
      f.status === "MATCH",
  ).length;
  const mismatchCount = fields.filter((f) => f.status === "MISMATCH").length;
  const unavailableCount = fields.filter(
    (f) => f.status === "NOT_AVAILABLE",
  ).length;
  const hasIssues = mismatchCount > 0;
  const mismatches = fields.filter((f) => f.status === "MISMATCH");
  const [showDetails, setShowDetails] = useState(hasIssues);

  // Build discrepancy table rows
  const discrepancyRows = mismatches.map((mismatch) => {
    const alertList = mismatch.alerts;
    let observation = "Requiere revisión";
    if (alertList.includes("DOCUMENT_CONFLICT")) observation = "Conflicto entre documentos";
    else if (alertList.includes("EXPEDIENTE_VS_DOCUMENTOS")) observation = "Expediente vs documentos";
    else if (alertList.includes("NAME_ORDER_DIFF")) observation = "Validación parcial — orden distinto";
    else if (alertList.includes("NAME_NONSTANDARD_CHAR")) observation = "Carácter no estándar";

    const fieldLabel =
      mismatch.fieldName === "fullName" ? "NOMBRE" : mismatch.fieldName.toUpperCase();

    const getVal = (source: string) => mismatch.originalValue[source] ?? "—";

    return { fieldLabel, observation, mismatch, getVal };
  });

  const COLUMNS = [
    { key: "payroll", label: "NÓMINA" },
    { key: "official-id", label: "INE" },
    { key: "bank-statement", label: "EDO. CUENTA" },
    { key: "credit-bureau", label: "BURÓ" },
    { key: "client", label: "EXPEDIENTE" },
  ] as const;

  return (
    <Card
      className={
        hasIssues
          ? "border-red-200 bg-red-50/30"
          : "border-green-200 bg-green-50/30"
      }
    >
      {/* Header — collapsible */}
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="w-full flex items-center gap-4 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gf-text">{matchCount} coinciden</span>
        </div>
        <span className="text-xs text-gf-text-muted">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-gf-text">{mismatchCount} discrepancias</span>
        </div>
        <span className="text-xs text-gf-text-muted">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-xs text-gf-text">{unavailableCount} no comparable</span>
        </div>
        {hasIssues && (
          <svg
            className={`ml-auto h-4 w-4 text-gf-text-muted transition-transform ${showDetails ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* ── Tabla de discrepancias (colapsable) ────────────────────────── */}
      {hasIssues && showDetails && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white/60">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gf-text uppercase border-b border-gf-border/60">CAMPO</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="text-left px-3 py-2 text-xs font-semibold text-gf-text uppercase border-b border-gf-border/60">{col.label}</th>
                ))}
                <th className="text-left px-3 py-2 text-xs font-semibold text-gf-text uppercase border-b border-gf-border/60 whitespace-nowrap">OBSERVACIÓN</th>
              </tr>
            </thead>
            <tbody>
              {discrepancyRows.map((row) => (
                <tr key={row.mismatch.fieldName} className="border-b border-gf-border/40 hover:bg-white/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-semibold text-gf-red uppercase">{row.fieldLabel}</td>
                  {COLUMNS.map((col) => {
                    const val = row.getVal(col.key);
                    const isClient = col.key === "client";
                    const normVal = row.mismatch.normalizedValue[col.key];
                    const isPresent = normVal != null;
                    return (
                      <td key={col.key} className="px-3 py-2">
                        {isPresent ? (
                          <span className="text-xs text-gf-text">{val}</span>
                        ) : isClient && row.mismatch.fieldName !== "fullName" ? (
                          <span className="text-xs text-blue-600 italic">No capturado</span>
                        ) : (
                          <span className="text-xs text-gf-text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                      row.mismatch.alerts.includes("DOCUMENT_CONFLICT") ? "bg-red-50 text-red-700" :
                      row.mismatch.alerts.includes("NAME_ORDER_DIFF") ? "bg-blue-50 text-blue-700" :
                      row.mismatch.alerts.includes("NAME_NONSTANDARD_CHAR") ? "bg-amber-50 text-amber-700" :
                      "bg-yellow-50 text-yellow-700"
                    }`}>{row.observation}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gf-text-muted mt-3">La asesora debe revisar cada discrepancia y decidir si requiere ajuste en los documentos o si es un falso positivo.</p>
        </div>
      )}

      {fields.some((f) => f.alerts.includes("CLIENT_FIELD_OMITTED")) && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-700">
            Completar RFC/CURP en datos del cliente con base en documentos
            validados.
          </p>
        </div>
      )}

      {!hasIssues && (
        <p className="text-[11px] text-green-700">
          Todos los campos comparables coinciden entre documentos.
        </p>
      )}
    </Card>
  );
}

// ── AnalysisStepper ─────────────────────────────────────────────────────────

function AnalysisStepper({
  phase,
  failedPhase,
}: {
  phase: "analyzing" | "error";
  failedPhase?: string;
}) {
  const steps = [
    { key: "validaciones", label: "Validaciones" },
    { key: "motor", label: "Motor financiero" },
    { key: "comparativa", label: "Comparativa bancaria" },
  ];

  return (
    <div className="flex items-center justify-center gap-0 py-4">
      {steps.map((step, i) => {
        const isError = phase === "error" && failedPhase === step.key;

        const circleColor = isError
          ? "bg-red-500 text-white"
          : "bg-gray-200 text-gray-400";
        const labelColor = isError ? "text-red-600" : "text-gf-text-muted";
        const lineColor = "bg-gray-200";

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${circleColor}`}
              >
                {isError ? "✕" : i + 1}
              </div>
              <span className={`text-[11px] mt-1 whitespace-nowrap ${labelColor}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-14 h-[3px] mx-1 mb-5 ${lineColor}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CompactStatusBar ─────────────────────────────────────────────────────────

function CompactStatusBar({
  phase,
  timestamp,
}: {
  phase: "result" | "observations";
  timestamp: string;
}) {
  const date = new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (phase === "observations") {
    return (
      <div
        className="flex items-center h-8 px-4 rounded text-xs font-medium text-amber-800"
        style={{ backgroundColor: "#FFFBEB" }}
      >
        ⚠ Análisis completado con observaciones — {date}
      </div>
    );
  }

  return (
    <div
      className="flex items-center h-8 px-4 rounded text-xs font-medium text-green-800"
      style={{ backgroundColor: "#ECFDF5" }}
    >
      ✓ Análisis completado el {date} · 3 fases exitosas
    </div>
  );
}
