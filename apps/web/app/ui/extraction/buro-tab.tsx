"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit2,
  HelpCircle,
  Info,
  Smile,
  Meh,
  Frown,
  X,
} from "lucide-react";
import type { Document } from "@/app/lib/definitions";
import type { ExtractionAlert } from "@/app/lib/extraction";
import {
  parseBuro,
  PaymentDueAmountSource,
  type ParsedCreditBureau,
  type ParsedCreditBureauCredit,
} from "@/app/lib/extraction";
import {
  computeGlobalUtilization,
  computeRowUtilization,
  maskLastFour,
  UTILIZATION_BANDS,
  type UtilizationBand,
  type UtilizationBandId,
} from "@/app/lib/bureau-utilization";
import {
  updatePaymentDueManual,
  updateInquiries24mManual,
} from "@/app/actions/documents";
import EmptyState from "@/app/ui/common/empty-state";
import ExtractionOwnerSwitch, {
  type ExtractionOwner,
} from "@/app/ui/extraction/extraction-owner-switch";

// ---------------------------------------------------------------------------
// Helpers & Constants
// ---------------------------------------------------------------------------

const CLASSIFICATION_LABELS: Record<string, string> = {
  REVOLVING: "Revolvente",
  FIXED_PAYMENT: "Pago fijo",
  MORTGAGE: "Hipotecario",
  AUTO: "Automotriz",
  PERSONAL_LOAN: "Préstamo personal",
  DEPARTMENT_STORE: "Tienda dep.",
  NON_BANK_SERVICE: "Servicio no bancario",
  OTHER: "Otros",
  OTROS: "Otros",
  OTRO: "Otros",
  UNKNOWN: "—",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
  UNKNOWN: "—",
};

function scoreBand(score: number): {
  label: string;
  chipBg: string;
  chipText: string;
} {
  if (score >= 680)
    return {
      label: "Riesgo bajo",
      chipBg: "bg-emerald-50 border-emerald-200",
      chipText: "text-emerald-700",
    };
  if (score >= 600)
    return {
      label: "Riesgo medio",
      chipBg: "bg-amber-50 border-amber-200",
      chipText: "text-amber-700",
    };
  if (score >= 500)
    return {
      label: "Riesgo alto",
      chipBg: "bg-orange-50 border-orange-200",
      chipText: "text-orange-700",
    };
  return {
    label: "Riesgo muy alto",
    chipBg: "bg-red-50 border-red-200",
    chipText: "text-red-700",
  };
}

function formatMxn(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
      return "bg-gf-surface-dim text-gf-text-muted border-gf-border";
  }
}

function statusChipColor(status: string): string {
  return status === "ACTIVE"
    ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
    : "bg-slate-200/80 text-slate-600 border border-slate-300 font-medium";
}

function formatWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function utilizationChipClasses(bandId: UtilizationBandId): {
  chipBg: string;
  chipText: string;
} {
  switch (bandId) {
    case "excelente":
      return {
        chipBg: "bg-emerald-50 border-emerald-200",
        chipText: "text-emerald-700",
      };
    case "muy_buena":
      return {
        chipBg: "bg-green-50 border-green-200",
        chipText: "text-green-700",
      };
    case "aceptable":
      return {
        chipBg: "bg-amber-50 border-amber-200",
        chipText: "text-amber-700",
      };
    case "atencion":
      return {
        chipBg: "bg-orange-50 border-orange-200",
        chipText: "text-orange-700",
      };
    case "critico":
      return {
        chipBg: "bg-red-50 border-red-200",
        chipText: "text-red-700",
      };
    case "muy_critico":
      return {
        chipBg: "bg-red-100 border-red-300",
        chipText: "text-red-800",
      };
  }
}

function UtilizationChip({ band }: { band: UtilizationBand }) {
  const { chipBg, chipText } = utilizationChipClasses(band.id);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipBg} ${chipText}`}
    >
      {band.label}
    </span>
  );
}

function utilizationRangeLabel(band: UtilizationBand): string {
  if (band.maxPercent == null) return `${band.minPercent}%+`;
  return `${band.minPercent}–${band.maxPercent}%`;
}

// ---------------------------------------------------------------------------
// MOP Behavior Component with Interactive Balloon Popover (Carita + Globo)
// ---------------------------------------------------------------------------

interface MopBehaviorInfo {
  iconType: "happy" | "neutral" | "sad" | "unknown";
  bgColor: string;
  textColor: string;
  label: string;
}

function getMopBehaviorInfo(credit: ParsedCreditBureauCredit): MopBehaviorInfo {
  const obs = credit.observationKeys ?? [];

  // Priority 1: Critical Risk Flags (Fraud, Identity Theft, Write-off, Quita)
  if (credit.hasFraudFlag || obs.includes("FD")) {
    return {
      iconType: "sad",
      bgColor: "bg-[#ff6b6b]",
      textColor: "text-white",
      label: "FRAUDE DETECTADO (FD)",
    };
  }
  if (credit.hasIdentityTheft || obs.includes("RI")) {
    return {
      iconType: "sad",
      bgColor: "bg-[#ff6b6b]",
      textColor: "text-white",
      label: "ROBO DE IDENTIDAD (RI)",
    };
  }
  if (credit.hasWriteOff || obs.includes("UP")) {
    return {
      iconType: "sad",
      bgColor: "bg-[#ff6b6b]",
      textColor: "text-white",
      label: "QUEBRANTO / CARTERA VENCIDA (UP)",
    };
  }
  if (credit.hasSettlementOrDiscount || obs.includes("LC") || obs.includes("LG")) {
    return {
      iconType: "sad",
      bgColor: "bg-[#ff6b6b]",
      textColor: "text-white",
      label: "PAGO CON QUITA (LC / LG)",
    };
  }

  // Priority 2: MOP Code Evaluation
  const mops = credit.mopCodes ?? [];
  const history = credit.paymentHistory ? credit.paymentHistory.replace(/\s/g, "") : "";
  const allCodes = mops.length > 0 ? mops : history.split("").filter((c) => /^[0-9U\-]$/.test(c));

  if (allCodes.length === 0) {
    return {
      iconType: "unknown",
      bgColor: "bg-gf-surface-dim",
      textColor: "text-gf-text-muted",
      label: "Cuenta sin información",
    };
  }

  // Check worst MOP code present
  const hasMop90Plus = allCodes.some((c) => ["05", "06", "07", "96", "97", "99", "5", "6", "7", "8", "9"].includes(c));
  if (hasMop90Plus || credit.hasSeriousDelinquency) {
    const worstCode = allCodes.find((c) => ["05", "06", "07", "96", "97", "99", "5", "6", "7", "8", "9"].includes(c)) ?? "05";
    return {
      iconType: "sad",
      bgColor: "bg-[#ff6b6b]",
      textColor: "text-white",
      label: `ATRASO MAYOR A 90 DÍAS (${worstCode.padStart(2, "0")})`,
    };
  }

  const hasMop60 = allCodes.some((c) => c === "04" || c === "4");
  if (hasMop60) {
    return {
      iconType: "neutral",
      bgColor: "bg-[#ff9800]",
      textColor: "text-white",
      label: "ATRASO DE 60 A 89 DÍAS (04)",
    };
  }

  const hasMop30 = allCodes.some((c) => c === "03" || c === "3");
  if (hasMop30) {
    return {
      iconType: "neutral",
      bgColor: "bg-[#ffd54f]",
      textColor: "text-gf-text",
      label: "ATRASO DE 30 A 59 DÍAS (03)",
    };
  }

  const hasMop02 = allCodes.some((c) => c === "02" || c === "2");
  if (hasMop02 || credit.hasLatePayments) {
    return {
      iconType: "neutral",
      bgColor: "bg-[#ffd54f]",
      textColor: "text-gf-text",
      label: "ATRASO DE 1 A 29 DÍAS (02)",
    };
  }

  const isCurrent = allCodes.some((c) => c === "01" || c === "1" || c === "0");
  if (isCurrent) {
    return {
      iconType: "happy",
      bgColor: "bg-[#99cc00]",
      textColor: "text-gf-text",
      label: "AL CORRIENTE (01)",
    };
  }

  return {
    iconType: "unknown",
    bgColor: "bg-gf-surface-dim",
    textColor: "text-gf-text-muted",
    label: "Cuenta sin información",
  };
}

function MopBehaviorBadge({ credit }: { credit: ParsedCreditBureauCredit }) {
  const info = getMopBehaviorInfo(credit);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block text-center select-none">
      <button
        type="button"
        onClick={() => setShowTooltip((prev) => !prev)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={info.label}
        className={`inline-flex items-center justify-center w-8 h-6.5 rounded-lg ${info.bgColor} ${info.textColor} shadow-2xs transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gf-primary cursor-pointer`}
      >
        {info.iconType === "happy" && <Smile className="h-4 w-4" />}
        {info.iconType === "neutral" && <Meh className="h-4 w-4" />}
        {info.iconType === "sad" && <Frown className="h-4 w-4" />}
        {info.iconType === "unknown" && <HelpCircle className="h-4 w-4" />}
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl z-30 pointer-events-none transition-all animate-in fade-in zoom-in-95">
          {info.label}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Header Card
// ---------------------------------------------------------------------------

function BuroHeader({ parsed }: { parsed: ParsedCreditBureau }) {
  const isProcessed =
    parsed.statusCode === "PROCESSED" ||
    parsed.statusCode === "DATA_EXTRACTED";

  return (
    <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-gf-text">Buró de crédito</h2>
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
        <span className="text-xs font-medium text-gf-text-muted bg-gf-surface px-3 py-1.5 rounded-lg border border-gf-border/60">
          Fecha consulta: {parsed.consultationDate}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. KPI Summary Bar (Score, Activos, Cerrados, Consultas 24m)
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
      // Stay in edit mode on error
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
      <div className="p-4 flex flex-col justify-between bg-blue-50/50 border-t sm:border-t-0 sm:border-l border-gf-border">
        <div className="flex items-center gap-1.5">
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
            className="w-16 rounded-lg border border-gf-border px-2 py-1 text-sm font-bold text-gf-text focus:border-blue-500 focus:outline-none bg-white"
          />
          <span className="text-xs text-gf-text-muted">consultas</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "··" : "✓ Guardar"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-gf-surface px-2 py-1 text-xs font-medium text-gf-text-muted hover:bg-gf-surface-dim disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex items-center justify-between bg-gf-surface/50 border-t sm:border-t-0 sm:border-l border-gf-border">
      <div>
        <div className="text-2xl font-bold text-gf-text">
          {displayValue}{" "}
          <span className="text-sm font-normal text-gf-text-muted">consultas</span>
        </div>
        <div className="text-xs text-gf-text-muted mt-0.5 flex items-center gap-1">
          {isManual && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700">
              Manual
            </span>
          )}
          <span>{subText}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleStartEdit}
        className="p-1.5 rounded-lg text-gf-text-muted hover:bg-white hover:text-gf-text transition-colors border border-transparent hover:border-gf-border"
        title="Editar consultas 24 meses"
      >
        <Edit2 className="h-4 w-4" />
      </button>
    </div>
  );
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

  const band =
    score != null && !parsed.scoreIsExcluded ? scoreBand(score) : null;
  const inquiriesEffective =
    parsed.inquiries24mEffective ?? parsed.numberOfInquiries;
  const globalUtil = computeGlobalUtilization(parsed.credits);

  return (
    <div className="bg-white border border-gf-border rounded-xl shadow-2xs overflow-hidden grid grid-cols-1 sm:grid-cols-4 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-gf-border">
      <div className="p-4 flex flex-col justify-between">
        <div className="text-2xl font-bold text-gf-text">
          {scoreIsNull ? "—" : score}
        </div>
        <div>
          <div className="text-xs font-bold text-gf-text-muted tracking-wider uppercase">
            Score
          </div>
          <div className="text-xs text-gf-text-muted mt-0.5">
            {scoreIsNull ? (
              "No disponible"
            ) : (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${band?.chipBg} ${band?.chipText}`}>
                {band?.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col justify-between">
        <div className="text-2xl font-bold text-gf-text">{s.activeCredits}</div>
        <div>
          <div className="text-xs font-bold text-gf-text-muted tracking-wider uppercase">
            activos
          </div>
          <div className="text-xs text-gf-text-muted mt-0.5">Créditos activos</div>
        </div>
      </div>

      <div className="p-4 flex flex-col justify-between">
        <div className="text-2xl font-bold text-gf-text">{s.closedCredits}</div>
        <div>
          <div className="text-xs font-bold text-gf-text-muted tracking-wider uppercase">
            cerrados
          </div>
          <div className="text-xs text-gf-text-muted mt-0.5">Créditos cerrados</div>
        </div>
      </div>

      <EditableInquiriesKpi
        effectiveValue={inquiriesEffective}
        isManual={parsed.inquiries24mManual != null}
        caseId={caseId}
        documentId={parsed.documentId}
        onSave={onInquiriesUpdate}
      />

      <div className="p-4 flex flex-col justify-between">
        <div className="text-2xl font-bold text-gf-text">{globalUtil.display}</div>
        <div>
          <div className="text-xs font-bold text-gf-text-muted tracking-wider uppercase">
            Utilización
          </div>
          <div className="text-xs text-gf-text-muted mt-0.5">
            {globalUtil.band ? (
              <UtilizationChip band={globalUtil.band} />
            ) : (
              "No disponible"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Diagnóstico Preliminar de Buró
// ---------------------------------------------------------------------------

function DiagnosisCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const r = parsed.riskSummary;

  let riskLevel: "Alto" | "Medio" | "Bajo" = "Bajo";
  let riskMessage = "Sin indicadores de riesgo detectados.";

  if (r) {
    if (r.hasWriteOff || r.hasFraudFlag || r.hasSeriousDelinquency) {
      riskLevel = "Alto";
      riskMessage = "Revisar comportamiento crediticio antes de continuar.";
    } else if (
      r.hasMinorDelinquency ||
      r.hasPreventiveKeys ||
      r.possibleHomonym
    ) {
      riskLevel = "Medio";
      riskMessage = "Se recomienda revisar el historial crediticio con atención.";
    }
  }

  const cardBg =
    riskLevel === "Alto"
      ? "bg-red-50/80 border-red-200 text-red-900"
      : riskLevel === "Medio"
        ? "bg-[#FFFDF0] border-[#FDE68A] text-amber-900"
        : "bg-emerald-50/80 border-emerald-200 text-emerald-900";

  const chipBg =
    riskLevel === "Alto"
      ? "bg-red-100 text-red-800 border-red-300"
      : riskLevel === "Medio"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-emerald-100 text-emerald-800 border-emerald-300";

  return (
    <div className={`rounded-xl border ${cardBg} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs`}>
      <div className="flex items-center gap-3">
        <Info className="h-5 w-5 shrink-0 opacity-80" />
        <div>
          <span className="text-sm font-bold">Diagnóstico preliminar de Buró: </span>
          <span className="text-xs">{riskMessage}</span>
        </div>
      </div>
      <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold ${chipBg}`}>
        Riesgo {riskLevel.toLowerCase()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Risk Chips Row
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
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const activeClass = chip.active
          ? chip.critical
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-orange-200 bg-orange-50 text-orange-800"
          : "border-gf-border bg-white text-gf-text-muted";

        return (
          <span
            key={chip.label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-2xs ${activeClass}`}
          >
            {chip.active ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            )}
            {chip.active ? chip.label : `Sin ${chip.label.toLowerCase()}`}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Credits Table Component (Bancarios vs No Bancarios)
// ---------------------------------------------------------------------------

function companyTypeLabel(value: string | null): string {
  if (!value) return "—";
  return value.replaceAll("L?NEA", "LÍNEA").replaceAll("CR?DITO", "CRÉDITO");
}

function formatTermDays(days: number | null | undefined): string {
  if (days == null) return "—";
  return `${days.toLocaleString("es-MX")} días`;
}

function CreditRow({
  credit,
  creditNumber,
  displayNumber,
  caseId,
  documentId,
  onPaymentDueUpdate,
  company = false,
}: {
  credit: ParsedCreditBureauCredit;
  creditNumber: number;
  displayNumber: number;
  caseId: string;
  documentId: string;
  onPaymentDueUpdate: (creditIndex: number, manualValue: number | null) => void;
  company?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isRisky =
    credit.hasWriteOff ||
    credit.hasFraudFlag ||
    credit.hasSeriousDelinquency;

  const isWarning = !isRisky && credit.hasLatePayments;
  const isClosed = credit.isClosed;

  const rowBg = isRisky
    ? "bg-red-50/50 hover:bg-red-50/80 border-l-4 border-l-red-500 font-medium"
    : isWarning
      ? "bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-400 font-medium"
      : isClosed
        ? "bg-slate-100/60 text-slate-500 opacity-65 hover:opacity-100 transition-opacity border-l-4 border-l-slate-300"
        : "bg-white hover:bg-emerald-50/30 border-l-4 border-l-emerald-500 font-medium";

  const effectiveForDisplay =
    credit.paymentDueAmountEffective ?? credit.paymentDueAmount ?? null;
  const utilization = computeRowUtilization(credit);
  const lastFour = maskLastFour(credit);

  async function handleSave() {
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

  return (
    <tr className={`border-b border-gf-border/60 transition-colors ${rowBg} text-xs`}>
      {/* # */}
      <td className="px-2 py-2.5 text-gf-text-muted font-semibold text-center w-7">
        {displayNumber}.
      </td>

      {/* Institución */}
      <td className="px-2.5 py-2.5 font-semibold text-gf-text">
        <div>{credit.institution ?? "—"}</div>
        {lastFour !== "—" && (
          <div className="text-[10px] font-mono font-medium text-gf-text-muted tracking-wide">
            {lastFour}
          </div>
        )}
      </td>

      {/* Tipo de crédito */}
      <td className="px-2.5 py-2.5">
        {company ? (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gf-text">
              {companyTypeLabel(credit.creditType)}
            </div>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classificationChipColor(credit.classification)}`}>
              {CLASSIFICATION_LABELS[credit.classification] ?? credit.classification}
            </span>
          </div>
        ) : (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classificationChipColor(credit.classification)}`}>
            {CLASSIFICATION_LABELS[credit.classification] ?? credit.classification}
          </span>
        )}
      </td>

      {/* Estado */}
      <td className="px-2.5 py-2.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChipColor(credit.status)}`}>
          {STATUS_LABELS[credit.status] ?? credit.status}
        </span>
      </td>

      {/* Saldo actual */}
      <td className="px-2.5 py-2.5 text-right font-mono text-xs font-medium text-gf-text">
        {formatMxn(credit.currentBalance)}
      </td>

      {company ? (
        <>
          <td className="px-2.5 py-2.5 text-right font-mono text-xs font-semibold text-gf-text">
            {formatMxn(credit.originalAmount ?? null)}
          </td>
          <td className="px-2.5 py-2.5 text-right font-mono text-xs text-gf-text">
            {formatTermDays(credit.termDays)}
          </td>
          <td className="px-2.5 py-2.5 text-center">
            <MopBehaviorBadge credit={credit} />
          </td>
        </>
      ) : (
        <>
      {/* Monto a pagar */}
      <td className="px-2.5 py-2.5 text-right">
        {isClosed ? (
          <span className="text-gf-text-muted font-mono text-xs">—</span>
        ) : editing ? (
          <div className="inline-flex items-center gap-1 justify-end">
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
              className="w-20 rounded border border-gf-border px-1.5 py-0.5 text-right font-mono text-xs text-gf-text focus:border-blue-500 focus:outline-none bg-white"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="p-1 rounded bg-gf-surface text-gf-text-muted hover:bg-gf-surface-dim disabled:opacity-50 border border-gf-border"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 justify-end">
            <span className="font-mono font-bold text-xs text-gf-text">
              {effectiveForDisplay != null ? formatMxn(effectiveForDisplay) : "—"}
            </span>
            <button
              type="button"
              onClick={handleStartEdit}
              className="p-1 text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim rounded transition-colors"
              title="Editar monto a pagar"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </td>

      {/* Límite / crédito */}
      <td className="px-2.5 py-2.5 text-right font-mono text-xs text-gf-text">
        {formatMxn(credit.creditLimit)}
      </td>

      {/* Utilización */}
      <td className="px-2.5 py-2.5 text-right">
        {utilization.percent == null || utilization.band == null ? (
          <span className="text-gf-text-muted font-mono text-xs">—</span>
        ) : (
          <div className="inline-flex items-center justify-end gap-1.5">
            <span className="font-mono text-xs font-medium text-gf-text">
              {utilization.display}
            </span>
            <UtilizationChip band={utilization.band} />
          </div>
        )}
      </td>

      {/* Comportamiento MOP (Carita + Globo) */}
      <td className="px-2.5 py-2.5 text-center">
        <MopBehaviorBadge credit={credit} />
      </td>
        </>
      )}
    </tr>
  );
}

function isBankingCredit(credit: ParsedCreditBureauCredit): boolean {
  return credit.classification !== "NON_BANK_SERVICE";
}

function CreditTableSection({
  title,
  credits,
  accent,
  caseId,
  documentId,
  onPaymentDueUpdate,
  company = false,
}: {
  title: string;
  credits: { credit: ParsedCreditBureauCredit; idx: number }[];
  accent: "red" | "tertiary";
  caseId: string;
  documentId: string;
  onPaymentDueUpdate: (creditIndex: number, manualValue: number | null) => void;
  company?: boolean;
}) {
  if (credits.length === 0) return null;

  const barBg = accent === "red" ? "bg-gf-red" : "bg-gf-tertiary";
  const pillBg = accent === "red" ? "bg-red-50 text-red-700 border-red-200" : "bg-sky-50 text-sky-700 border-sky-200";

  return (
    <div className="bg-white border border-gf-border rounded-xl overflow-hidden shadow-2xs">
      <div className="px-5 py-3.5 bg-gf-surface border-b border-gf-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-4 rounded-full ${barBg}`} />
          <h4 className="text-sm font-bold text-gf-text">{title}</h4>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${pillBg}`}>
          {credits.length} crédito{credits.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gf-surface/60 border-b border-gf-border text-[11px] font-bold text-gf-text-muted uppercase tracking-wider">
            <tr>
              <th className="px-2 py-2.5 text-center w-7">#</th>
              <th className="px-2.5 py-2.5">Institución</th>
              <th className="px-2.5 py-2.5">Tipo de crédito</th>
              <th className="px-2.5 py-2.5">Estado</th>
              <th className="px-2.5 py-2.5 text-right">Saldo actual</th>
              {company ? (
                <>
                  <th className="px-2.5 py-2.5 text-right">Crédito otorgado</th>
                  <th className="px-2.5 py-2.5 text-right">Plazo</th>
                  <th className="px-2.5 py-2.5 text-center">Comportamiento</th>
                </>
              ) : (
                <>
              <th className="px-2.5 py-2.5 text-right">Monto a pagar</th>
              <th className="px-2.5 py-2.5 text-right">Límite / crédito</th>
              <th className="px-2.5 py-2.5 text-right">Utilización</th>
              <th className="px-2.5 py-2.5 text-center">Comportamiento</th>
                </>
              )}
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
                company={company}
              />
            ))}
          </tbody>
        </table>
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

  const indexed = parsed.credits.map((credit, idx) => ({ credit, idx }));
  const bankingCredits = indexed.filter(({ credit }) => isBankingCredit(credit));
  const nonBankingCredits = indexed.filter(({ credit }) => !isBankingCredit(credit));

  return (
    <div className="space-y-5">
      <CreditTableSection
        title="Créditos Bancarios"
        credits={bankingCredits}
        accent="red"
        caseId={caseId}
        documentId={parsed.documentId}
        onPaymentDueUpdate={onPaymentDueUpdate}
        company={parsed.owner === "COMPANY"}
      />
      <CreditTableSection
        title="Créditos No Bancarios"
        credits={nonBankingCredits}
        accent="tertiary"
        caseId={caseId}
        documentId={parsed.documentId}
        onPaymentDueUpdate={onPaymentDueUpdate}
        company={parsed.owner === "COMPANY"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Leyenda de Comportamiento MOP (Sidebar)
// ---------------------------------------------------------------------------

function BuroUtilizationLegend() {
  return (
    <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gf-text-muted">
        Utilización de crédito
      </h4>
      <p className="text-xs text-gf-text-muted leading-relaxed">
        Porcentaje de saldo sobre límite en tarjetas revolventes abiertas. Cuentas cerradas o fuera de alcance muestran —.
      </p>

      <div className="space-y-2.5 pt-1 text-xs font-semibold">
        {UTILIZATION_BANDS.map((band) => (
          <div key={band.id} className="flex items-center gap-2.5">
            <UtilizationChip band={band} />
            <span className="text-gf-text">{utilizationRangeLabel(band)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuroBehaviorLegend() {
  return (
    <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gf-text-muted">
        Información sobre el comportamiento
      </h4>
      <p className="text-xs text-gf-text-muted leading-relaxed">
        El comportamiento de cada una de sus cuentas se traduce en un ícono en la columna de Comportamiento. Pasa el cursor o haz clic en el ícono para ver la clave detallada.
      </p>

      <div className="space-y-2.5 pt-1 text-xs font-semibold">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-6 rounded-lg bg-[#99cc00] text-gf-text flex items-center justify-center shadow-2xs shrink-0">
            <Smile className="h-4 w-4" />
          </div>
          <span className="text-gf-text">CUENTA AL CORRIENTE</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-6 rounded-lg bg-[#ffd54f] text-gf-text flex items-center justify-center shadow-2xs shrink-0">
            <Meh className="h-4 w-4" />
          </div>
          <span className="text-gf-text">ATRASO DE 1 A 89 DÍAS</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-6 rounded-lg bg-[#ff6b6b] text-white flex items-center justify-center shadow-2xs shrink-0">
            <Frown className="h-4 w-4" />
          </div>
          <span className="text-gf-text">ATRASADO MAYOR A 90 DÍAS, QUITA O QUEBRANTO</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Sidebar Derecha (Datos del Acreditado, Alertas y Leyenda)
// ---------------------------------------------------------------------------

function BorrowerInfoCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const b = parsed.borrower;
  const inquiries = parsed.inquiries24mEffective ?? parsed.numberOfInquiries;

  return (
    <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs space-y-4">
      <h4 className="text-sm font-bold text-gf-text border-b border-gf-border pb-2.5">
        Datos del acreditado
      </h4>

      {b ? (
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-gf-text-muted">Nombre</span>
            <span className="font-bold text-gf-text text-right">
              {b.fullName ?? "—"}
            </span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-gf-text-muted">RFC</span>
            <span className="font-mono font-medium text-gf-text">
              {b.rfc ?? "—"}
            </span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-gf-text-muted">Nacimiento</span>
            <span className="font-medium text-gf-text">
              {b.birthDate ?? "—"}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gf-text-muted">Sin datos del acreditado</p>
      )}

      {inquiries != null && (
        <div className="pt-2 border-t border-gf-border/60 flex justify-between items-center text-xs">
          <span className="text-gf-text-muted">Consultas 24m</span>
          <span className="font-bold text-gf-text">
            {inquiries}
          </span>
        </div>
      )}

      <p className="text-[10px] text-gf-text-muted leading-tight pt-1">
        Datos extraídos automáticamente; validar contra el reporte original.
      </p>
    </div>
  );
}

function CompactAlerts({ parsed }: { parsed: ParsedCreditBureau }) {
  if (parsed.alerts.length === 0) return null;

  return (
    <div className="bg-white border border-red-200 rounded-xl p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between border-b border-red-100 pb-2.5">
        <h4 className="text-sm font-bold text-gf-text">Alertas</h4>
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
          {parsed.alerts.length} alerta{parsed.alerts.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {parsed.alerts.slice(0, 6).map((alert, i) => {
          const isCritical = alert.severity === "CRITICAL";
          return (
            <div
              key={i}
              className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                isCritical
                  ? "bg-red-50 border-red-200 text-red-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              {alert.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main BuroTab Component
// ---------------------------------------------------------------------------

interface BuroTabProps {
  documents: Document[];
  caseId: string;
  /** Persona moral keeps one reporte on screen at a time. */
  showOwnerSwitch?: boolean;
}

export default function BuroTab({
  documents,
  caseId,
  showOwnerSwitch = false,
}: BuroTabProps) {
  const [owner, setOwner] = useState<ExtractionOwner>("COMPANY");
  const [parsed, setParsed] = useState(() =>
    parseBuro(
      showOwnerSwitch
        ? documents.filter((doc) => doc.owner === "COMPANY")
        : documents,
    ),
  );

  useEffect(() => {
    const next = showOwnerSwitch
      ? documents.filter((doc) => doc.owner === owner)
      : documents;
    setParsed(parseBuro(next));
  }, [documents, owner, showOwnerSwitch]);

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

  const emptyMessage = !parsed
    ? showOwnerSwitch
      ? owner === "COMPANY"
        ? "No hay reporte de buró de la persona moral. Cuando se procese el de la empresa, su lectura aparece aquí."
        : "No hay reporte de buró del accionista. Cuando se procese el de la persona física, su lectura aparece aquí."
      : "Los datos del buró de crédito se mostrarán aquí una vez que se suba y procese el reporte."
    : "El reporte de buró está cargado pero aún no ha sido procesado. Usa \"Procesar\" en el explorador de documentos para extraer los datos.";

  if (!parsed || !parsed.hasData) {
    return (
      <div className="space-y-5">
        {showOwnerSwitch && (
          <ExtractionOwnerSwitch owner={owner} onChange={setOwner} />
        )}
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showOwnerSwitch && (
        <ExtractionOwnerSwitch owner={owner} onChange={setOwner} />
      )}
      {/* ── Header ────────────────────────────────────────────────────── */}
      <BuroHeader parsed={parsed} />

      {/* ── Summary KPIs ──────────────────────────────────────────────── */}
      <KpiRow
        parsed={parsed}
        caseId={caseId}
        onInquiriesUpdate={handleInquiriesUpdate}
      />

      {/* ── Diagnostic ───────────────────────────────────────────────── */}
      <DiagnosisCard parsed={parsed} />

      {/* ── Risk Filter Chips ─────────────────────────────────────────── */}
      <RiskChips parsed={parsed} />

      {/* ── Main Body (Responsive Flex Layout with items-start) ──────── */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* Left Column: Tables */}
        <div className="flex-1 min-w-0 space-y-5">
          <CreditsTable
            parsed={parsed}
            caseId={caseId}
            onPaymentDueUpdate={handlePaymentDueUpdate}
          />
        </div>

        {/* Right Column / Stacked: Sidebar Cards */}
        <div className="w-full xl:w-80 shrink-0 space-y-5">
          <BorrowerInfoCard parsed={parsed} />
          <CompactAlerts parsed={parsed} />
          <BuroBehaviorLegend />
          <BuroUtilizationLegend />
        </div>
      </div>
    </div>
  );
}
