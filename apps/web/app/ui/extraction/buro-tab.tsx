"use client";

import { useState } from "react";

import type { Document } from "@/app/lib/definitions";
import type { ExtractionAlert } from "@/app/lib/extraction";
import {
  parseBuro,
  PaymentDueAmountSource,
  type ParsedCreditBureau,
  type ParsedCreditBureauCredit,
} from "@/app/lib/extraction";
import {
  updatePaymentDueManual,
  updateInquiries24mManual,
} from "@/app/actions/documents";
import EmptyState from "@/app/ui/common/empty-state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLASSIFICATION_LABELS: Record<string, string> = {
  REVOLVING: "Revolvente",
  FIXED_PAYMENT: "Pago fijo",
  MORTGAGE: "Hipotecario",
  AUTO: "Automotriz",
  PERSONAL_LOAN: "Préstamo personal",
  DEPARTMENT_STORE: "Tienda dep.",
  NON_BANK_SERVICE: "Servicio no bancario",
  UNKNOWN: "—",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
  UNKNOWN: "—",
};

function scoreBand(score: number): {
  label: string;
  border: string;
  text: string;
  dot: string;
} {
  if (score >= 680)
    return {
      label: "Riesgo bajo",
      border: "border-green-200",
      text: "text-green-700",
      dot: "bg-green-500",
    };
  if (score >= 600)
    return {
      label: "Riesgo medio",
      border: "border-yellow-200",
      text: "text-yellow-700",
      dot: "bg-yellow-500",
    };
  if (score >= 500)
    return {
      label: "Riesgo alto",
      border: "border-orange-200",
      text: "text-orange-700",
      dot: "bg-orange-500",
    };
  return {
    label: "Riesgo muy alto",
    border: "border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
  };
}

function formatMxn(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
  })}`;
}

function mopBadgeColor(code: string): string {
  if (code === "0" || code === "" || code === "1")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (code === "2")
    return "bg-amber-50 text-amber-700 border border-amber-200";
  if (code === "U" || code === "-") return "bg-gray-100 text-gray-600 border border-gray-200";
  return "bg-red-50 text-red-700 border border-red-200";
}

// Classification chip colors
function classificationChipColor(cls: string): string {
  switch (cls) {
    case "REVOLVING":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "FIXED_PAYMENT":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "MORTGAGE":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "AUTO":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "DEPARTMENT_STORE":
      return "bg-pink-50 text-pink-700 border-pink-200";
    case "NON_BANK_SERVICE":
      return "bg-teal-50 text-teal-700 border-teal-200";
    default:
      return "bg-gray-50 text-gray-500 border-gray-200";
  }
}

function statusChipColor(status: string): string {
  return status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-gray-100 text-gray-600 border border-gray-200";
}

// ---------------------------------------------------------------------------
// 1. Header
// ---------------------------------------------------------------------------

function BuroHeader({ parsed }: { parsed: ParsedCreditBureau }) {
  const isProcessed =
    parsed.statusCode === "PROCESSED" ||
    parsed.statusCode === "DATA_EXTRACTED";

  return (
    <div className="flex items-center justify-between rounded-xl border border-gf-border bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gf-text">
            Buró de crédito
          </h2>
          {isProcessed && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              Procesado
            </span>
          )}
        </div>
        <p className="text-xs text-gf-text-muted">
          Datos extraídos del Reporte de Buró de Crédito Especial
        </p>
      </div>

      {parsed.consultationDate && (
        <span className="text-xs font-medium text-gf-text-muted">
          Consulta: {parsed.consultationDate}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. KPI Row (inline inquiries editor)
// ---------------------------------------------------------------------------

function EditableInquiriesKpi({
  effectiveValue,
  isManual,
  caseId,
  documentId,
  onSave,
}: {
  effectiveValue: number | null;
  isManual: boolean;
  caseId: string;
  documentId: string;
  onSave: (manual: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const displayValue = effectiveValue != null ? `${effectiveValue}` : "—";
  const subText = isManual ? "Manual · 24 meses" : "Últimos 24 meses";

  async function handleSave() {
    const parsed = parseInt(editValue, 10);
    if (isNaN(parsed)) return;
    setSaving(true);
    try {
      await updateInquiries24mManual(caseId, documentId, parsed);
      onSave(parsed);
      setEditing(false);
    } catch {
      // Error: stay in edit mode so user can retry
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setEditValue("");
  }

  function handleStartEdit() {
    setEditValue(effectiveValue != null ? String(effectiveValue) : "");
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-0.5 rounded-lg border border-blue-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
            className="w-16 rounded border border-slate-300 px-1 py-0.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
          />
          <span className="text-xs text-slate-500">consultas</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "··" : "✓"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
      </div>
    </div>
  );
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-800">
          {displayValue}
        </span>
        <span className="text-xs text-slate-500">consultas</span>
        <button
          type="button"
          onClick={handleStartEdit}
          className="ml-auto inline-flex items-center rounded px-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Editar consultas 24 meses"
        >
          ✎
        </button>
      </div>
      <div className="flex items-center gap-1">
        {isManual && (
          <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
            🟢 Manual
          </span>
        )}
        <span className="text-[11px] text-slate-400">{subText}</span>
      </div>
    </div>
  );
}

/** Formats a numeric string with thousand-separator commas (e.g. "1450000" → "1,450,000"). */
function formatWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function KpiRow({
  parsed,
  caseId,
  onInquiriesUpdate,
}: {
  parsed: ParsedCreditBureau;
  caseId: string;
  onInquiriesUpdate: (manual: number | null) => void;
}) {
  const s = parsed.summary;
  const score = parsed.score;
  const scoreIsNull = score == null || parsed.scoreIsExcluded;

  if (!s) return null;

  const band = score != null && !parsed.scoreIsExcluded
    ? scoreBand(score)
    : null;

  const inquiriesEffective =
    parsed.inquiries24mEffective ?? parsed.numberOfInquiries;

  return (
    <div className="flex gap-4 rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      {[
        {
          label: "Score",
          value: scoreIsNull ? "—" : `${score}`,
          sub: scoreIsNull ? "No disponible" : band?.label ?? "—",
          accent: band?.label.includes("alto") || band?.label.includes("muy alto") ? "red" as const
            : band?.label.includes("medio") ? "orange" as const : "neutral" as const,
        },
        { label: "activos", value: `${s.activeCredits}`, sub: "Créditos activos", accent: "neutral" as const },
        { label: "cerrados", value: `${s.closedCredits}`, sub: "Créditos cerrados", accent: "neutral" as const },
      ].map((kpi) => (
        <div key={kpi.label} className="flex flex-1 flex-col gap-1">
          <span className={`text-[26px] font-bold ${kpi.accent === "red" ? "text-red-600" : kpi.accent === "orange" ? "text-amber-600" : "text-gf-text"}`}>
            {kpi.value}
          </span>
          <span className="text-[11px] text-gf-text-soft">{kpi.label}</span>
          <span className="text-[11px] text-gf-text-muted">{kpi.sub}</span>
        </div>
      ))}
      <div className="w-px bg-gf-border" />
      <EditableInquiriesKpi
        effectiveValue={inquiriesEffective}
        isManual={parsed.inquiries24mManual != null}
        caseId={caseId}
        documentId={parsed.documentId}
        onSave={onInquiriesUpdate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Diagnosis Card
// ---------------------------------------------------------------------------

function DiagnosisCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const r = parsed.riskSummary;

  let riskLevel: "Alto" | "Medio" | "Bajo" = "Bajo";
  let riskMessage = "Sin indicadores de riesgo detectados.";

  if (r) {
    if (r.hasWriteOff || r.hasFraudFlag || r.hasSeriousDelinquency) {
      riskLevel = "Alto";
      riskMessage = "Revisar comportamiento crediticio antes de continuar.";
    } else if (r.hasMinorDelinquency || r.hasPreventiveKeys || r.possibleHomonym) {
      riskLevel = "Medio";
      riskMessage = "Se recomienda revisar el historial crediticio con atención.";
    }
  }

  const bgColor =
    riskLevel === "Alto"
      ? "bg-red-50 border-red-200"
      : riskLevel === "Medio"
        ? "bg-amber-50 border-amber-200"
        : "bg-emerald-50 border-emerald-200";

  const chipColor =
    riskLevel === "Alto"
      ? "bg-red-100 text-red-700"
      : riskLevel === "Medio"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  return (
    <div className={`rounded-[var(--radius-md)] border ${bgColor} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-[13px] font-semibold text-gf-text">
          Diagnóstico preliminar de Buró
        </h3>
        <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[10px] font-semibold ${chipColor}`}>
          Riesgo {riskLevel.toLowerCase()}
        </span>
        </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Risk Chips
// ---------------------------------------------------------------------------

function RiskChips({ parsed }: { parsed: ParsedCreditBureau }) {
  const r = parsed.riskSummary;
  if (!r) return null;

  const chips: { label: string; active: boolean; critical: boolean }[] = [
    { label: "Quebranto", active: r.hasWriteOff, critical: true },
    { label: "Fraude", active: r.hasFraudFlag, critical: true },
    {
      label: "Mora grave",
      active: r.hasSeriousDelinquency,
      critical: true,
    },
    {
      label: "Atrasos menores",
      active: r.hasMinorDelinquency,
      critical: false,
    },
    {
      label: "Claves preventivas",
      active: r.hasPreventiveKeys,
      critical: false,
    },
    {
      label: "Homónimo",
      active: r.possibleHomonym === true,
      critical: false,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const activeClass = chip.active
          ? chip.critical
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-400";

        const prefix = chip.active ? "⚠" : "✓";
        const label = chip.active
          ? chip.label
          : `Sin ${chip.label.toLowerCase()}`;

        return (
          <span
            key={chip.label}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${activeClass}`}
          >
            {prefix} {label}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Credits Table (enhanced)
// ---------------------------------------------------------------------------

function CreditRow({
  credit,
  creditNumber,
  displayNumber,
  caseId,
  documentId,
  onPaymentDueUpdate,
}: {
  credit: ParsedCreditBureauCredit;
  creditNumber: number;  // original flat index in parsed.credits[]
  displayNumber: number; // 1-based row number shown to the user
  caseId: string;
  documentId: string;
  onPaymentDueUpdate: (creditIndex: number, manualValue: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mopExpanded, setMopExpanded] = useState(false);

  const isRisky =
    credit.hasWriteOff ||
    credit.hasFraudFlag ||
    credit.hasSeriousDelinquency;

  const isWarning = !isRisky && credit.hasLatePayments;
  const isClosed = credit.isClosed;

  const rowBg = isRisky
    ? "bg-red-50/60"
    : isWarning
      ? "bg-amber-50/40"
      : isClosed
        ? "bg-gf-bg/50 opacity-60"
        : credit.needsManualReview
          ? "bg-amber-50/30"
          : "odd:bg-white even:bg-gf-bg/30";

  // Build MOP badges
  const MAX_VISIBLE_MOP = 12;
  const allMopCodes: string[] = (() => {
    if (credit.mopCodes.length > 0) return credit.mopCodes;
    if (credit.paymentHistory) {
      return credit.paymentHistory
        .replace(/\s/g, "")
        .split("")
        .filter((c) => /^[0-9U\-]$/.test(c));
    }
    return [];
  })();

  const effectiveForDisplay =
    credit.paymentDueAmountEffective ?? credit.paymentDueAmount ?? null;

  async function handleSave() {
    // Strip thousand separators before parsing
    const parsed = parseFloat(editValue.replace(/,/g, ""));
    if (isNaN(parsed)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updatePaymentDueManual(caseId, documentId, creditNumber, parsed);
      onPaymentDueUpdate(creditNumber, parsed);
      setEditing(false);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Error al guardar el monto",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setEditValue("");
  }

  function handleStartEdit() {
    const raw = effectiveForDisplay != null ? String(effectiveForDisplay) : "";
    setEditValue(formatWithCommas(raw));
    setEditing(true);
  }

  function renderStateBadge() {
    if (credit.needsManualReview) {
      return (
        <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title="Requiere revisión manual">
          🟡 Revisar
        </span>
      );
    }
    if (credit.paymentDueAmountSource === PaymentDueAmountSource.UNCONFIRMED) {
      return (
        <span className="text-[10px] text-red-500" title="Monto a pagar no confirmado">
          No confirmado
        </span>
      );
    }
    if (credit.paymentDueAmountSource === PaymentDueAmountSource.MANUAL) {
      return (
        <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700" title="Editado manualmente">
          ✏️ Manual
        </span>
      );
    }
    if (credit.paymentDueAmountSource === PaymentDueAmountSource.BAND_MATCH) {
      return (
        <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-600" title="Extracción por coordenadas">
          ✅ Coord.
        </span>
      );
    }
    if (credit.paymentDueAmountSource === PaymentDueAmountSource.RESCUE) {
      return (
        <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Rescate por coordenadas — verificar">
          ⚠️ Rescate
        </span>
      );
    }
    if (
      credit.paymentDueAmountSource === PaymentDueAmountSource.CONFIRMED_AUTO ||
      credit.paymentDueAmountSource === PaymentDueAmountSource.LAYOUT
    ) {
      return (
        <span className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500" title="Confirmado automáticamente">
          ⚪ Auto
        </span>
      );
    }
    if (
      credit.paymentDueAmountSource === PaymentDueAmountSource.GEMINI &&
      !credit.paymentDueAmountConfirmed
    ) {
      return (
        <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700" title="Extraído por Gemini, sin confirmar">
          🤖 Gemini
        </span>
      );
    }
    return null;
  }

  return (
    <tr className={`border-b border-gf-border/50 ${rowBg} text-[13px]`}>
      {/* # */}
      <td className="py-2.5 pl-4 pr-1 w-8">
        <span className="text-[13px] font-semibold text-gf-text-muted">
          {displayNumber}.
        </span>
      </td>

      {/* Institution */}
      <td className="py-2.5 px-1">
        <span className="font-semibold text-gf-text">
          {credit.institution ?? "—"}
        </span>
      </td>

      {/* Type chip */}
      <td className="py-2.5 px-1">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${classificationChipColor(credit.classification)}`}>
          {CLASSIFICATION_LABELS[credit.classification] ?? credit.classification}
        </span>
      </td>

      {/* Status chip */}
      <td className="py-2.5 px-1 text-center">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${statusChipColor(credit.status)}`}>
          {STATUS_LABELS[credit.status] ?? credit.status}
        </span>
      </td>

      {/* Saldo actual */}
      <td className="py-2.5 px-1 text-right font-mono tabular-nums text-gf-text">
        {formatMxn(credit.currentBalance)}
      </td>

      {/* Monto a pagar */}
      <td className="py-2.5 px-1 text-right tabular-nums text-gf-text">
        {isClosed ? (
          <span className="text-gf-text-soft">—</span>
        ) : editing ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={editValue}
              onChange={(e) => setEditValue(formatWithCommas(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              autoFocus
              className="w-28 rounded border border-gf-border px-1.5 py-0.5 text-right font-mono text-[13px] text-gf-text focus:border-blue-400 focus:outline-none"
            />
            <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "··" : "✓"}
            </button>
            <button type="button" onClick={handleCancel} disabled={saving} className="inline-flex items-center rounded bg-gf-bg px-1.5 py-0.5 text-[10px] font-medium text-gf-text-muted hover:bg-gf-border/50 disabled:opacity-50">
              ✕
            </button>
            {saveError && (
              <span className="text-[10px] text-red-600 ml-1">{saveError}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 justify-end">
            {effectiveForDisplay != null ? (
              <span className="font-semibold">{formatMxn(effectiveForDisplay)}</span>
            ) : (
              <span title="Dato pendiente" className="text-gf-text-soft">—</span>
            )}
            {renderStateBadge()}
            <button type="button" onClick={handleStartEdit} className="inline-flex items-center rounded px-0.5 text-[11px] text-gf-text-soft hover:bg-gf-bg hover:text-gf-text-muted" title="Editar monto a pagar">
              ✎
            </button>
          </span>
        )}
      </td>

      {/* Límite / crédito */}
      <td className="py-2.5 px-1 text-right font-mono tabular-nums text-gf-text">
        {formatMxn(credit.creditLimit)}
      </td>

      {/* MOP — collapsible button */}
      <td className="py-2.5 px-1">
        {allMopCodes.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setMopExpanded(!mopExpanded)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gf-border bg-white px-2.5 py-1 text-[10px] font-medium text-gf-text-muted hover:bg-gf-bg transition-colors"
            >
              <span>{allMopCodes.length} MOPs</span>
              <span className={`text-[9px] transition-transform ${mopExpanded ? "rotate-90" : ""}`}>▸</span>
            </button>
            {mopExpanded && (
              <div className="mt-1.5 flex flex-wrap gap-0.5 max-w-[200px]">
                {allMopCodes.map((code, i) => (
                  <span
                    key={i}
                    className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-sm text-[10px] font-bold ${mopBadgeColor(code)}`}
                    title={`MOP ${code}`}
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-gf-text-soft">—</span>
        )}
      </td>

      {/* Flags */}
      <td className="py-2.5 pl-1 pr-4 text-center">
        <div className="flex justify-center gap-0.5">
          {credit.hasWriteOff && <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700" title="Quebranto">Q</span>}
          {credit.hasFraudFlag && <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700" title="Fraude">F</span>}
          {credit.hasSeriousDelinquency && <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700" title="Mora grave">M</span>}
          {credit.hasLatePayments && !credit.hasSeriousDelinquency && <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-amber-100 text-[10px] font-bold text-amber-700" title="Atraso">A</span>}
          {!credit.hasLatePayments && !credit.hasWriteOff && !credit.hasFraudFlag && !credit.hasSeriousDelinquency && <span className="text-[11px] text-emerald-600">✓</span>}
        </div>
      </td>
    </tr>
  );
}

// ── Banking / Non-banking split ─────────────────────────────────────────
// Uses Gemini's classification field (backed by coordinate extraction's
// section-type detection from PDF labels). More reliable than institution
// name heuristics (e.g., "AMEX" matches both banking AMEXCO BANK and
// non-banking AMEX services / AMEX COMPANY).
function isBankingCredit(credit: ParsedCreditBureauCredit): boolean {
  return credit.classification !== "NON_BANK_SERVICE";
}

function SectionHeader({
  title,
  count,
  accent,
}: {
  title: string;
  count: number;
  accent: "red" | "purple";
}) {
  const barColor = accent === "red" ? "bg-[#dc2626]" : "bg-[#7c3aed]";
  const badgeBg = accent === "red" ? "bg-[#fef2f2]" : "bg-[#f5f3ff]";
  const badgeText = accent === "red" ? "text-[#b0002a]" : "text-[#7c3aed]";

  return (
    <div className="flex items-center gap-2">
      <div className={`h-[18px] w-[3px] rounded-sm ${barColor}`} />
      <h3 className="text-[15px] font-semibold text-gf-text">{title}</h3>
      <span className={`inline-flex items-center rounded-xl px-2.5 py-0.5 text-[11px] font-semibold ${badgeBg} ${badgeText}`}>
        {count} créditos
      </span>
    </div>
  );
}

function CreditTableSection({
  title,
  credits,
  accent,
  caseId,
  documentId,
  onPaymentDueUpdate,
}: {
  title: string;
  credits: { credit: ParsedCreditBureauCredit; idx: number }[];
  accent: "red" | "purple";
  caseId: string;
  documentId: string;
  onPaymentDueUpdate: (creditIndex: number, manualValue: number | null) => void;
}) {
  if (credits.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader title={title} count={credits.length} accent={accent} />

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-gf-border bg-gf-surface shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gf-border bg-gf-bg text-left text-xs font-semibold text-gf-text">
                <th className="py-2.5 pl-4 pr-1 w-8">#</th>
                <th className="py-2.5 px-1">Institución</th>
                <th className="py-2.5 px-1">Tipo</th>
                <th className="py-2.5 px-1 text-center">Estado</th>
                <th className="py-2.5 px-1 text-right">Saldo actual</th>
                <th className="py-2.5 px-1 text-right">Monto a pagar</th>
                <th className="py-2.5 px-1 text-right">Límite / crédito</th>
                <th className="py-2.5 px-1">MOP</th>
                <th className="py-2.5 pl-1 pr-4 text-center">Flags</th>
              </tr>
            </thead>
            <tbody>
              {credits.map(({ credit, idx }, i) => (
                <CreditRow
                  key={idx}
                  credit={credit}
                  creditNumber={idx}
                  displayNumber={i + 1}
                  caseId={caseId}
                  documentId={documentId}
                  onPaymentDueUpdate={onPaymentDueUpdate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CreditsTable({
  parsed,
  caseId,
  onPaymentDueUpdate,
}: {
  parsed: ParsedCreditBureau;
  caseId: string;
  onPaymentDueUpdate: (creditIndex: number, manualValue: number | null) => void;
}) {
  if (parsed.credits.length === 0) return null;

  // Tag each credit with its original flat index so the callback
  // always uses the correct position in parsed.credits[], regardless
  // of how the banking / non-banking split reorders them.
  const indexed = parsed.credits.map((credit, idx) => ({ credit, idx }));
  const bankingCredits = indexed.filter(({ credit }) => isBankingCredit(credit));
  const nonBankingCredits = indexed.filter(({ credit }) => !isBankingCredit(credit));

  return (
    <div className="flex flex-col gap-5">
      <CreditTableSection
        title="Créditos Bancarios"
        credits={bankingCredits}
        accent="red"
        caseId={caseId}
        documentId={parsed.documentId}
        onPaymentDueUpdate={onPaymentDueUpdate}
      />
      <CreditTableSection
        title="Créditos No Bancarios"
        credits={nonBankingCredits}
        accent="purple"
        caseId={caseId}
        documentId={parsed.documentId}
        onPaymentDueUpdate={onPaymentDueUpdate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Borrower Info + Alerts (sidebar)
// ---------------------------------------------------------------------------

function BorrowerInfoCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const b = parsed.borrower;

  return (
    <div className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <h3 className="text-[13px] font-semibold text-gf-text mb-3">
        Datos del acreditado
      </h3>

      {b ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between">
            <span className="text-[11px] text-gf-text-soft">Nombre</span>
            <span className="text-[12px] font-medium text-gf-text">
              {b.fullName ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px] text-gf-text-soft">RFC</span>
            <span className="text-[12px] font-mono text-gf-text">
              {b.rfc ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px] text-gf-text-soft">Nacimiento</span>
            <span className="text-[12px] font-medium text-gf-text">
              {b.birthDate ?? "—"}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-gf-text-muted">Sin datos del acreditado</p>
      )}

      {(parsed.consultationDate || (parsed.inquiries24mEffective ?? parsed.numberOfInquiries) != null) && (
        <>
          <div className="my-3 border-t border-gf-border" />
          <div className="flex flex-col gap-2.5">
            {parsed.consultationDate && (
              <div className="flex justify-between">
                <span className="text-[11px] text-gf-text-soft">Fecha consulta</span>
                <span className="text-[12px] font-medium text-gf-text">{parsed.consultationDate}</span>
              </div>
            )}
            {(parsed.inquiries24mEffective ?? parsed.numberOfInquiries) != null && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gf-text-soft">Consultas 24m</span>
                <span className="text-[12px] font-medium text-gf-text">
                  {parsed.inquiries24mEffective ?? parsed.numberOfInquiries}
                  {parsed.inquiries24mManual != null && (
                    <span className="ml-1.5 inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                      ✏️ Manual
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-3 text-[10px] text-gf-text-soft leading-tight">
        Datos extraídos automáticamente; validar contra el reporte original.
      </p>
    </div>
  );
}

function CompactAlertItem({ alert }: { alert: ExtractionAlert }) {
  const isCritical = alert.severity === "CRITICAL";

  return (
    <div
      className={`flex items-start gap-1.5 rounded px-2 py-1.5 ${
        isCritical ? "bg-red-50" : "bg-amber-50"
      }`}
    >
      <span
        className={`mt-px text-[10px] ${
          isCritical ? "text-red-500" : "text-amber-500"
        }`}
      >
        ●
      </span>
      <span
        className={`text-[13px] leading-tight ${
          isCritical ? "text-red-800" : "text-amber-800"
        }`}
      >
        {alert.message}
      </span>
    </div>
  );
}

function CompactAlerts({ parsed }: { parsed: ParsedCreditBureau }) {
  if (parsed.alerts.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gf-text">Alertas</h3>
        <span className="inline-flex items-center rounded-xl bg-[#fef2f2] px-2.5 py-0.5 text-[10px] font-semibold text-[#dc2626]">
          {parsed.alerts.length} alerta{parsed.alerts.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {parsed.alerts.slice(0, 6).map((alert, i) => (
          <CompactAlertItem key={i} alert={alert} />
        ))}
        {parsed.alerts.length > 6 && (
          <button type="button" className="text-[11px] text-gf-text-muted hover:text-gf-text mt-1">
            Ver {parsed.alerts.length - 6} alertas más
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BuroTabProps {
  documents: Document[];
  caseId: string;
}

export default function BuroTab({ documents, caseId }: BuroTabProps) {
  const [parsed, setParsed] = useState(() => parseBuro(documents));

  // ── Local state update after PATCH payment-due ────────────────────────
  function handlePaymentDueUpdate(
    creditIndex: number,
    manualValue: number | null,
  ) {
    setParsed((prev) => {
      if (!prev) return prev;
      const newCredits = [...prev.credits];
      const credit = { ...newCredits[creditIndex] };
      credit.paymentDueAmountManual = manualValue;
      credit.paymentDueAmountManualOverride = manualValue;
      credit.paymentDueAmountSource = PaymentDueAmountSource.MANUAL;
      credit.paymentDueAmountConfirmed = true;
      credit.needsManualReview = false;
      credit.paymentDueAmountEffective = manualValue;
      credit.paymentDueAmount = manualValue;
      newCredits[creditIndex] = credit;
      return { ...prev, credits: newCredits };
    });
  }

  // ── Local state update after PATCH inquiries ──────────────────────────
  function handleInquiriesUpdate(manual: number | null) {
    setParsed((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        inquiries24mManual: manual,
        inquiries24mConfirmed: true,
        inquiries24mEffective: manual,
        numberOfInquiries: manual ?? prev.numberOfInquiries,
      };
    });
  }

  if (!parsed) {
    return (
      <EmptyState message="Los datos del buró de crédito se mostrarán aquí una vez que se suba y procese el reporte." />
    );
  }

  if (!parsed.hasData) {
    return (
      <EmptyState message="El reporte de buró está cargado pero aún no ha sido procesado. Usa &quot;Procesar&quot; y luego &quot;Extraer datos&quot; en el explorador de documentos." />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BuroHeader parsed={parsed} />
      <KpiRow parsed={parsed} caseId={caseId} onInquiriesUpdate={handleInquiriesUpdate} />
      <DiagnosisCard parsed={parsed} />
      <RiskChips parsed={parsed} />

      <div className="flex gap-5">
        <div className="flex-1 min-w-0">
          <CreditsTable
            parsed={parsed}
            caseId={caseId}
            onPaymentDueUpdate={handlePaymentDueUpdate}
          />
        </div>
        <div className="flex w-64 shrink-0 flex-col gap-4">
          <BorrowerInfoCard parsed={parsed} />
          <CompactAlerts parsed={parsed} />
        </div>
      </div>
    </div>
  );
}
