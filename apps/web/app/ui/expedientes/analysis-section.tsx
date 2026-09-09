"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import {
  triggerAnalysis,
  fetchLatestAnalysis,
} from "@/app/actions/analysis";
import { parseBankStatements } from "@/app/lib/extraction";
import { Sparkles, Loader2, FolderPlus, FileCheck, CheckCircle2, AlertTriangle } from "lucide-react";
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
import PfaeValidationGates from "@/app/ui/expedientes/pfae-validation-gates";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AnalysisSectionProps {
  caseId: string;
  statusCode: string;
  /** All documents in the case (needed for conciliación cross-tab) */
  documents: Document[];
  /** PFAE vs SALARIED — mirrors the pattern used by DocumentUpload/ExtractionSection. */
  personType?: string;
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
  { id: "motor", label: "Cálculo financiero" },
  { id: "bancos", label: "Comparativa bancaria" },
];

const PFAE_VALIDATION_RULE_ID = "pfae-validation";
const SOLELY_SALARIED_RULE_CODE = "REGIMEN_EXCLUSIVAMENTE_ASALARIADO";
const SOLELY_SALARIED_FAIL_COPY =
  "este camino PFAE no aplica — cambie a asalariado";

/** Presentational only — never persisted, never mutates stored BankResult.status. */
function deriveSuppressViablePresentation(run: AnalysisRun): boolean {
  if (run.alerts?.some((alert) => alert.ruleCode === SOLELY_SALARIED_RULE_CODE)) {
    return true;
  }
  const rule = run.detail.ruleResults?.find(
    (result) => result.ruleId === PFAE_VALIDATION_RULE_ID,
  );
  return rule?.detail.pfaeValidation?.regime.outcome === "FAIL";
}

const SOURCE_LABELS: Record<string, string> = {
  "official-id": "INE",
  payroll: "Nómina",
  csf: "CSF",
  "tax-return": "Declaración",
  "bank-statement": "Edo. cuenta",
  "credit-bureau": "Buró",
  client: "Expediente",
};

const SOURCE_ICONS: Record<string, string> = {
  "official-id": "🆔",
  payroll: "💰",
  csf: "🏛️",
  "tax-return": "🧾",
  "bank-statement": "🏦",
  "credit-bureau": "📊",
  client: "📋",
};

/**
 * PersonType-aware required-document checklist. Single source of truth
 * consumed by both `hasMissingDocs` and `AnalysisConfirmModal`'s checklist
 * (mirrors `case-status-calculator.service.ts`'s PFAE/SALARIED branch) —
 * prevents the two from drifting out of sync.
 */
interface RequiredDocCheck {
  key: string;
  label: string;
  /** DocumentType codes that satisfy this check (any one is sufficient). */
  codes: string[];
}

function getRequiredDocChecks(personType?: string): RequiredDocCheck[] {
  const identity: RequiredDocCheck = {
    key: "identity",
    label: "Identificación oficial (INE/Pasaporte)",
    codes: ["INE", "PASSPORT"],
  };
  const bankStatement: RequiredDocCheck = {
    key: "bank-statement",
    label: "Estado de cuenta bancario",
    codes: ["BANK_STATEMENT"],
  };
  const creditBureau: RequiredDocCheck = {
    key: "credit-bureau",
    label: "Buró de crédito / Score",
    codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
  };

  if (personType === "PFAE") {
    return [
      identity,
      { key: "csf", label: "Constancia de Situación Fiscal (CSF)", codes: ["CSF"] },
      { key: "tax-return", label: "Declaración anual", codes: ["TAX_RETURN"] },
      bankStatement,
      creditBureau,
    ];
  }

  return [
    identity,
    { key: "payroll", label: "Recibo de nómina", codes: ["PAYROLL_RECEIPT"] },
    bankStatement,
    creditBureau,
  ];
}

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
  personType,
}: AnalysisSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>("validaciones");
  const [state, setState] = useState<UiState>({ phase: "loading" });

  const hasUploadedDocs = documents.length > 0;
  const hasProcessedDocs = documents.some(
    (d) => d.documentStatus.code === "PROCESSED",
  );

  // Determinar si el resultado tiene observaciones
  const isObservations = useCallback((run: AnalysisRun): boolean => {
    const bv = run.detail.bankViability;
    if (!bv) return false;
    if (run.outcome === "PARTIAL") return true;
    return bv.bankResults.some(
      (m) => m.status === "CONDITIONED" || m.status === "REQUIRES_REVIEW",
    );
  }, []);

  // Cargar último análisis al montar. Quiet path keeps the current result
  // painted while GET /analysis/latest runs (source-switch refresh).
  const loadLatest = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!options?.quiet) {
        setState({ phase: "loading" });
      }
      const res = await fetchLatestAnalysis(caseId);
      if (!res.success) {
        if (options?.quiet) return;
        setState({ phase: "error", message: res.error ?? "Error" });
        return;
      }
      if (res.data) {
        setState(
          isObservations(res.data)
            ? { phase: "observations", run: res.data }
            : { phase: "result", run: res.data },
        );
      } else if (!options?.quiet) {
        setState({ phase: "idle" });
      }
    },
    [caseId, isObservations],
  );

  const quietLoadLatest = useCallback(() => {
    void loadLatest({ quiet: true });
  }, [loadLatest]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Disparar análisis con comprobación de confirmación (Propuesta 2)
  const requiredDocChecks = useMemo(
    () => getRequiredDocChecks(personType),
    [personType],
  );
  const hasMissingDocs = useMemo(() => {
    const hasUnprocessed = documents.some(
      (d) => d.documentStatus.code !== "PROCESSED",
    );
    const hasMissingRequired = requiredDocChecks.some(
      (check) =>
        !documents.some(
          (d) =>
            check.codes.includes(d.documentType.code) &&
            d.documentStatus.code === "PROCESSED",
        ),
    );
    return hasMissingRequired || hasUnprocessed;
  }, [documents, requiredDocChecks]);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const handleAnalyzeClick = () => {
    if (!hasProcessedDocs) return;
    if (hasMissingDocs) {
      setConfirmModalOpen(true);
    } else {
      executeAnalysis();
    }
  };

  const executeAnalysis = async () => {
    setConfirmModalOpen(false);
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
  const peinadoWarn = bankParsed.statements.some((statement) => {
    const status = statement.financialDepuration?.integrityCheck?.status;
    return status === "MINOR_DIFFERENCE" || status === "CRITICAL_DISCREPANCY";
  });

  // ── Button label/variant based on phase ─────────────────────────────────
  const headerButton = (() => {
    if (!hasProcessedDocs) {
      return (
        <button
          type="button"
          disabled
          title="Se requiere procesar al menos un documento antes de ejecutar el análisis"
          className="bg-gray-100 text-gray-400 border border-gray-200 px-4 h-9 rounded-xl font-semibold text-xs sm:text-sm cursor-not-allowed inline-flex items-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5 opacity-50" />
          <span>Analizar expediente</span>
        </button>
      );
    }

    switch (state.phase) {
      case "idle":
        return (
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="bg-gf-red hover:bg-gf-red-dark text-white px-4 h-9 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition-all inline-flex items-center gap-2 active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Analizar expediente</span>
          </button>
        );
      case "result":
      case "observations":
        return (
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="bg-gf-red hover:bg-gf-red-dark text-white px-4 h-9 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition-all inline-flex items-center gap-2 active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Re-ejecutar análisis</span>
          </button>
        );
      case "analyzing":
        return (
          <button
            type="button"
            disabled
            className="bg-gf-red/60 text-white px-4 h-9 rounded-xl font-semibold text-xs sm:text-sm transition-all inline-flex items-center gap-2 cursor-not-allowed"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Analizando...</span>
          </button>
        );
      case "error":
        return (
          <button
            type="button"
            onClick={handleAnalyzeClick}
            className="bg-gf-red hover:bg-gf-red-dark text-white px-4 h-9 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition-all inline-flex items-center gap-2 active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reintentar análisis</span>
          </button>
        );
      default:
        return null;
    }
  })();

  const isAnalyzing = state.phase === "analyzing";

  // ── Onboarding Cards cuando falta información ───────────────────────────
  if (!hasUploadedDocs) {
    return (
      <div className="bg-white border border-gf-border rounded-xl p-8 shadow-xs text-center space-y-3 my-8">
        <div className="w-12 h-12 rounded-full bg-gf-red-soft text-gf-red flex items-center justify-center mx-auto">
          <FolderPlus className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-base font-bold text-gf-text">
            Paso 1: Sube la documentación del cliente
          </h3>
          <p className="text-xs text-gf-text-muted leading-relaxed">
            Este expediente aún no cuenta con documentos subidos. Usa el botón <span className="font-semibold text-gf-text">+ Agregar</span> o el panel lateral izquierdo para cargar la identificación, nómina o estados de cuenta.
          </p>
        </div>
      </div>
    );
  }

  if (!hasProcessedDocs) {
    return (
      <div className="bg-white border border-gf-border rounded-xl p-8 shadow-xs text-center space-y-3 my-8">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
          <FileCheck className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-base font-bold text-gf-text">
            Paso 2: Procesa los documentos cargados
          </h3>
          <p className="text-xs text-gf-text-muted leading-relaxed">
            Los documentos han sido subidos pero aún no se han procesado. Haz clic en el icono de procesamiento (<span className="font-semibold text-gf-text">▶ Procesar</span>) en el panel lateral de cada documento para extraer su información.
          </p>
        </div>
      </div>
    );
  }

  const processedCount = documents.filter(
    (d) => d.documentStatus.code === "PROCESSED",
  ).length;

  // ── Render Normal de Análisis ───────────────────────────────────────────

  return (
    <div className="mb-4 mt-8">
      {/* ── Header row: título + botón compacto ───────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gf-text">
            Análisis del expediente
          </h2>
        </div>
        {state.phase !== "idle" && (
          <div className="self-start sm:self-auto">
            {headerButton}
          </div>
        )}
      </div>

      {state.phase === "idle" ? (
        <div className="flex flex-col items-center justify-center bg-white border border-dashed border-gf-border rounded-xl p-10 shadow-xs mt-6 mb-8 text-center">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900 flex flex-col items-center gap-3 mb-6 max-w-lg shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-bold text-base">Paso 3: Análisis de Viabilidad Bancaria</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Para obtener una comparativa bancaria precisa y cálculos correctos, asegúrate de haber subido y procesado los comprobantes de ingresos y documentos de identidad.
            </p>
            <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-full mt-1">
              {processedCount}/{documents.length} documentos procesados
            </span>
          </div>
          <div className="scale-110">
            {headerButton}
          </div>
        </div>
      ) : (
        <>

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

      {/* ── Tabs (Distribuidos uniformemente a lo ancho de la sección) ────── */}
      <div role="tablist" aria-label="Secciones de análisis del expediente" className="border-b border-gf-border mb-6 mt-4 w-full">
        <nav className="flex w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (!isAnalyzing) setActiveTab(tab.id);
                }}
                className={`flex-1 pb-3 pt-2 text-sm transition-all border-b-2 text-center ${
                  isActive
                    ? "border-gf-red text-gf-red font-bold"
                    : "border-transparent text-gf-text-muted hover:text-gf-text hover:border-gf-border font-semibold"
                } ${isAnalyzing ? "pointer-events-none opacity-50" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
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
              personType={personType}
            />
          )}

          {activeTab === "motor" && (
            <>
              <LiabilityCalculationSection caseId={caseId} />
              <div className="mt-6" />
              <IncomeCalculationSection
                caseId={caseId}
                personType={personType}
                onSourceSwitched={quietLoadLatest}
                peinadoWarn={peinadoWarn}
              />
            </>
          )}

          {activeTab === "bancos" && (
            <BankComparisonTab
              bankViability={
                state.phase === "result" || state.phase === "observations"
                  ? state.run.detail?.bankViability
                  : undefined
              }
              suppressViablePresentation={
                personType === "PFAE" &&
                (state.phase === "result" || state.phase === "observations") &&
                deriveSuppressViablePresentation(state.run)
              }
              overlayMessage={SOLELY_SALARIED_FAIL_COPY}
            />
          )}
        </>
      )}
        </>
      )}

      {/* ── Modal de Confirmación Pre-Análisis (Propuesta 2) ───────────── */}
      <AnalysisConfirmModal
        isOpen={confirmModalOpen}
        documents={documents}
        personType={personType}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={executeAnalysis}
      />
    </div>
  );
}

// ── Tab Validaciones ──────────────────────────────────────────────────────────

function ValidacionesTab({
  caseId,
  state,
  allDeposits,
  payrollDocs,
  personType,
}: {
  caseId: string;
  state: UiState;
  allDeposits: ReturnType<typeof parseBankStatements>["allDeposits"];
  payrollDocs: Document[];
  personType?: string;
}) {
  const isPFAE = personType === "PFAE";

  return (
    <div className="space-y-6">
      {/* ── A) Validación de identidad ──────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gf-text mb-3">
          Validación de identidad
        </h3>
        <IdentityValidationSection
          state={state}
          personType={personType}
        />
      </section>

      {isPFAE && (
        <section>
          <h3 className="text-sm font-semibold text-gf-text mb-3">
            Validaciones PFAE
          </h3>
          <PfaeValidationGates
            run={
              state.phase === "result" || state.phase === "observations"
                ? state.run
                : undefined
            }
          />
        </section>
      )}

      {/* ── B) Conciliación nómina vs banco — no aplica para PFAE (sin nómina) ── */}
      {!isPFAE && (
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
      )}
    </div>
  );
}

// ── Sección: Validación de identidad ──────────────────────────────────────────

function IdentityValidationSection({
  state,
  personType,
}: {
  state: UiState;
  personType?: string;
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
        personType={personType}
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

/** PersonType-aware discrepancy-table columns — PFAE swaps Nómina for CSF + Declaración. */
function getIdentityColumns(personType?: string) {
  if (personType === "PFAE") {
    return [
      { key: "csf", label: "CSF" },
      { key: "tax-return", label: "DECLARACIÓN" },
      { key: "official-id", label: "INE" },
      { key: "bank-statement", label: "EDO. CUENTA" },
      { key: "credit-bureau", label: "BURÓ" },
      { key: "client", label: "EXPEDIENTE" },
    ] as const;
  }
  return [
    { key: "payroll", label: "NÓMINA" },
    { key: "official-id", label: "INE" },
    { key: "bank-statement", label: "EDO. CUENTA" },
    { key: "credit-bureau", label: "BURÓ" },
    { key: "client", label: "EXPEDIENTE" },
  ] as const;
}

function IdentitySummaryCard({
  fields,
  personType,
}: {
  fields: FieldComparison[];
  sources: string[];
  personType?: string;
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

  const COLUMNS = getIdentityColumns(personType);

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
    { key: "motor", label: "Cálculo financiero" },
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

// ── AnalysisConfirmModal (Propuesta 2: Modal de confirmación pre-análisis) ───

function AnalysisConfirmModal({
  isOpen,
  documents,
  personType,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  documents: Document[];
  personType?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  const requiredDocChecks = getRequiredDocChecks(personType);
  const checklist = requiredDocChecks.map((check) => ({
    ...check,
    ready: documents.some(
      (d) =>
        check.codes.includes(d.documentType.code) &&
        d.documentStatus.code === "PROCESSED",
    ),
  }));
  const unprocessedCount = documents.filter(
    (d) => d.documentStatus.code !== "PROCESSED",
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-gf-border shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gf-text">
              ¿Deseas ejecutar el análisis ahora?
            </h3>
            <p className="text-xs text-gf-text-muted mt-1 leading-relaxed">
              Para obtener un análisis de capacidad y conciliación bancaria óptimo, se requiere al menos 1 documento procesado de cada categoría:
            </p>
          </div>
        </div>

        <div className="bg-gf-surface border border-gf-border/60 rounded-xl p-3.5 space-y-2 text-xs">
          {checklist.map((check, i) => (
            <div key={check.key} className="flex items-center justify-between">
              <span className="text-gf-text font-medium">
                {i + 1}. {check.label}:
              </span>
              <span className={check.ready ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                {check.ready ? "✓ Procesado" : "⚠ Pendiente"}
              </span>
            </div>
          ))}
          {unprocessedCount > 0 && (
            <div className="pt-1.5 border-t border-gf-border/40 flex items-center justify-between text-amber-800 font-medium">
              <span>Archivos sin procesar:</span>
              <span className="font-bold">{unprocessedCount} archivo(s)</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gf-border bg-white text-gf-text text-xs font-bold hover:bg-gf-surface-dim transition-colors"
          >
            Cancelar y revisar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-gf-red text-white text-xs font-bold hover:bg-gf-red-dark transition-colors shadow-2xs"
          >
            Continuar análisis
          </button>
        </div>
      </div>
    </div>
  );
}
