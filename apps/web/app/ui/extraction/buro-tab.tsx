import type { Document } from "@/app/lib/definitions";
import type { ExtractionAlert } from "@/app/lib/extraction";
import {
  parseBuro,
  type ParsedCreditBureau,
  type ParsedCreditBureauCredit,
} from "@/app/lib/extraction";
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
  if (code === "0" || code === "") return "bg-green-100 text-green-700";
  if (code === "1")
    return "bg-green-100 text-green-700";
  if (code === "2")
    return "bg-yellow-100 text-yellow-700";
  if (code === "U" || code === "-") return "bg-gray-100 text-gray-500";
  return "bg-red-100 text-red-700";
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
    ? "bg-green-50 text-green-700 border-green-200"
    : "bg-gray-50 text-gray-500 border-gray-200";
}

// ---------------------------------------------------------------------------
// 1. Header
// ---------------------------------------------------------------------------

function BuroHeader({ parsed }: { parsed: ParsedCreditBureau }) {
  const isProcessed =
    parsed.statusCode === "PROCESSED" ||
    parsed.statusCode === "DATA_EXTRACTED";

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">
            Buró de crédito
          </h2>
          {isProcessed && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Procesado
            </span>
          )}
        </div>
        <p className="text-[13px] text-slate-500">
          Datos extraídos del Reporte de Buró de Crédito Especial
        </p>
      </div>

      <div className="flex items-center gap-3">
        {parsed.consultationDate && (
          <span className="text-[13px] text-slate-500">
            Consulta: {parsed.consultationDate}
          </span>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          Ver OCR
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. KPI Row
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "orange" | "red" | "neutral";
}) {
  const border =
    accent === "orange"
      ? "border-orange-200"
      : accent === "red"
        ? "border-red-200"
        : "border-slate-200";

  const textColor =
    accent === "orange"
      ? "text-orange-600"
      : accent === "red"
        ? "text-red-600"
        : "text-slate-800";

  return (
    <div
      className={`flex flex-1 flex-col justify-center gap-0.5 rounded-lg border bg-white px-3 py-2.5 ${border}`}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold ${textColor}`}>{value}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      {accent !== "neutral" && (
        <div className="flex items-center gap-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              accent === "orange" ? "bg-orange-500" : "bg-red-500"
            }`}
          />
          <span className={`text-[11px] ${textColor}`}>{sub}</span>
        </div>
      )}
      {accent === "neutral" && (
        <span className="text-[11px] text-slate-400">{sub}</span>
      )}
    </div>
  );
}

function KpiRow({ parsed }: { parsed: ParsedCreditBureau }) {
  const s = parsed.summary;
  const score = parsed.score;

  if (!s) return null;

  const band = score != null && !parsed.scoreIsExcluded
    ? scoreBand(score)
    : null;

  return (
    <div className="flex gap-2">
      {/* Score */}
      <KpiCard
        label="Score"
        value={score != null && !parsed.scoreIsExcluded ? `${score}` : "—"}
        sub={band ? band.label : "No disponible"}
        accent={
          band
            ? band.label.includes("alto") || band.label.includes("muy alto")
              ? "red"
              : band.label.includes("medio")
                ? "orange"
                : "neutral"
            : "neutral"
        }
      />
      {/* Activos */}
      <KpiCard
        label="activos"
        value={`${s.activeCredits}`}
        sub="Créditos activos"
      />
      {/* Cerrados */}
      <KpiCard
        label="cerrados"
        value={`${s.closedCredits}`}
        sub="Créditos cerrados"
      />
      {/* Consultas */}
      <KpiCard
        label="consultas"
        value={
          parsed.numberOfInquiries != null
            ? `${parsed.numberOfInquiries}`
            : "—"
        }
        sub="Últimos 24 meses"
      />
      {/* Alertas */}
      <KpiCard
        label="alertas"
        value={`${s.totalAlerts}`}
        sub={
          s.totalCritical > 0
            ? `${s.totalCritical} crítica${s.totalCritical !== 1 ? "s" : ""}`
            : "Sin alertas críticas"
        }
        accent="red"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Diagnosis Card
// ---------------------------------------------------------------------------

function DiagnosisCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const r = parsed.riskSummary;
  const score = parsed.score;
  const scoreIsExcluded = parsed.scoreIsExcluded;

  // Determine risk level
  let riskLevel: "Alto" | "Medio" | "Bajo" = "Bajo";
  let riskMessage = "";

  if (r) {
    if (r.hasWriteOff || r.hasFraudFlag || r.hasSeriousDelinquency) {
      riskLevel = "Alto";
      riskMessage = "Revisar comportamiento crediticio antes de continuar.";
    } else if (r.hasMinorDelinquency || r.hasPreventiveKeys || r.possibleHomonym) {
      riskLevel = "Medio";
      riskMessage = "Se recomienda revisar el historial crediticio con atención.";
    } else if (score != null && !scoreIsExcluded && score >= 600) {
      riskLevel = "Bajo";
      riskMessage = "Perfil crediticio sin señales graves de riesgo.";
    } else {
      riskLevel = "Bajo";
      riskMessage = "Sin indicadores de riesgo detectados.";
    }
  } else if (score != null && !scoreIsExcluded) {
    if (score < 500) {
      riskLevel = "Alto";
      riskMessage = "Score en zona de riesgo — requiere revisión.";
    } else if (score < 600) {
      riskLevel = "Medio";
      riskMessage = "Score bajo — revisar historial con atención.";
    } else {
      riskLevel = "Bajo";
      riskMessage = "Perfil crediticio saludable según score.";
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
    <div className={`rounded-lg border px-4 py-3 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-700">
          Diagnóstico preliminar de Buró
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chipColor}`}
        >
          Riesgo {riskLevel.toLowerCase()}
        </span>
      </div>
      <p className="text-[13px] text-slate-600">{riskMessage}</p>
      <p className="mt-1 text-[11px] text-slate-400">
        Cálculo de pasivos se realizará en Sprint 3 · Pasivo mensual preliminar pendiente de validación
      </p>
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

function CreditRow({ credit }: { credit: ParsedCreditBureauCredit }) {
  const isRisky =
    credit.hasWriteOff ||
    credit.hasFraudFlag ||
    credit.hasSeriousDelinquency;

  const isWarning =
    !isRisky && credit.hasLatePayments;

  const rowBg = isRisky
    ? "bg-red-50/60"
    : isWarning
      ? "bg-amber-50/40"
      : "";

  // Build MOP badges from mopCodes or paymentHistory
  const mopCodes = credit.mopCodes.length > 0
    ? credit.mopCodes
    : credit.paymentHistory
      ? credit.paymentHistory.slice(0, 8).split("")
      : [];

  return (
    <tr className={`border-b border-slate-100 ${rowBg} text-[13px]`}>
      {/* Institution */}
      <td className="py-2 pl-3 pr-1">
        <span className="font-medium text-slate-800">
          {credit.institution ?? "—"}
        </span>
      </td>

      {/* Type chip */}
      <td className="py-2 px-1">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${classificationChipColor(credit.classification)}`}
        >
          {CLASSIFICATION_LABELS[credit.classification] ??
            credit.classification}
        </span>
      </td>

      {/* Status chip */}
      <td className="py-2 px-1 text-center">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusChipColor(credit.status)}`}
        >
          {STATUS_LABELS[credit.status] ?? credit.status}
        </span>
      </td>

      {/* Saldo actual */}
      <td className="py-2 px-1 text-right font-mono text-[13px] tabular-nums text-gray-900">
        {formatMxn(credit.currentBalance)}
      </td>

      {/* Pago reportado */}
      <td className="py-2 px-1 text-right font-mono text-[13px] tabular-nums text-gray-900">
        {formatMxn(credit.amountToPay)}
      </td>

      {/* Límite */}
      <td className="py-2 px-1 text-right font-mono text-[13px] tabular-nums text-gray-900">
        {formatMxn(credit.creditLimit)}
      </td>

      {/* MOP */}
      <td className="py-2 px-1">
        <div className="flex flex-wrap gap-0.5">
          {mopCodes.length > 0
            ? mopCodes.map((code, i) => (
                <span
                  key={i}
                  className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-sm text-[10px] font-bold ${mopBadgeColor(code)}`}
                  title={`MOP ${code}`}
                >
                  {code}
                </span>
              ))
            : "—"}
          {credit.paymentHistory && credit.paymentHistory.length > 8 && (
            <span className="text-[10px] text-slate-400 ml-0.5">
              +{credit.paymentHistory.length - 8}
            </span>
          )}
        </div>
      </td>

      {/* Flags */}
      <td className="py-2 pl-1 pr-3">
        <div className="flex gap-0.5">
          {credit.hasWriteOff && (
            <span
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700"
              title="Quebranto"
            >
              Q
            </span>
          )}
          {credit.hasFraudFlag && (
            <span
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700"
              title="Fraude"
            >
              F
            </span>
          )}
          {credit.hasSeriousDelinquency && (
            <span
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-700"
              title="Mora grave"
            >
              M
            </span>
          )}
          {credit.hasLatePayments &&
            !credit.hasSeriousDelinquency && (
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-amber-100 text-[10px] font-bold text-amber-700"
                title="Atraso"
              >
                A
              </span>
            )}
          {!credit.hasLatePayments &&
            !credit.hasWriteOff &&
            !credit.hasFraudFlag &&
            !credit.hasSeriousDelinquency && (
              <span className="text-[11px] text-emerald-600">✓</span>
            )}
        </div>
      </td>
    </tr>
  );
}

function CreditsTable({ parsed }: { parsed: ParsedCreditBureau }) {
  if (parsed.credits.length === 0) return null;

  const activeCount = parsed.credits.filter(
    (c) => c.status === "ACTIVE",
  ).length;
  const closedCount = parsed.credits.filter(
    (c) => c.status === "CLOSED",
  ).length;

  return (
    <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Créditos ({parsed.credits.length})
        </h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
            {activeCount} activos
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="inline-block h-2 w-2 rounded-sm bg-slate-300" />
            {closedCount} cerrados
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium text-slate-500">
              <th className="py-2 pl-3 pr-1">Institución</th>
              <th className="py-2 px-1">Tipo</th>
              <th className="py-2 px-1 text-center">Estado</th>
              <th className="py-2 px-1 text-right">Saldo actual</th>
              <th className="py-2 px-1 text-right">Pago rep.</th>
              <th className="py-2 px-1 text-right">Límite</th>
              <th className="py-2 px-1">MOP</th>
              <th className="py-2 pl-1 pr-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {parsed.credits.map((credit, i) => (
              <CreditRow key={i} credit={credit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Borrower Info + Alerts (sidebar)
// ---------------------------------------------------------------------------

function BorrowerInfoCard({ parsed }: { parsed: ParsedCreditBureau }) {
  const b = parsed.borrower;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <h3 className="text-sm font-semibold text-slate-800 mb-2">
        Datos del acreditado
      </h3>

      {b ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">Nombre</span>
            <span className="text-[13px] font-medium text-slate-800">
              {b.fullName ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">RFC</span>
            <span className="text-[13px] font-mono text-slate-800">
              {b.rfc ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">Nacimiento</span>
            <span className="text-[13px] font-medium text-slate-800">
              {b.birthDate ?? "—"}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-slate-400">Sin datos del acreditado</p>
      )}

      {(parsed.consultationDate || parsed.numberOfInquiries != null) && (
        <>
          <hr className="my-2 border-slate-200" />
          <div className="flex flex-col gap-1.5">
            {parsed.consultationDate && (
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">
                  Fecha consulta
                </span>
                <span className="text-[13px] font-medium text-slate-800">
                  {parsed.consultationDate}
                </span>
              </div>
            )}
            {parsed.numberOfInquiries != null && (
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">
                  Consultas 24m
                </span>
                <span className="text-[13px] font-medium text-slate-800">
                  {parsed.numberOfInquiries}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-2 text-[10px] text-slate-400 leading-tight">
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
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Alertas
        </h3>
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
          {parsed.alerts.length} alerta{parsed.alerts.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {parsed.alerts.slice(0, 6).map((alert, i) => (
          <CompactAlertItem key={i} alert={alert} />
        ))}
        {parsed.alerts.length > 6 && (
          <button
            type="button"
            className="text-[11px] text-slate-400 hover:text-slate-600 mt-1"
          >
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
}

export default function BuroTab({ documents }: BuroTabProps) {
  const parsed = parseBuro(documents);

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
    <div className="flex flex-col gap-3">
      {/* 1. Header */}
      <BuroHeader parsed={parsed} />

      {/* 2. KPI Row */}
      <KpiRow parsed={parsed} />

      {/* 3. Diagnosis */}
      <DiagnosisCard parsed={parsed} />

      {/* 4. Risk Chips */}
      <RiskChips parsed={parsed} />

      {/* 5. Two-column: Table + Sidebar */}
      <div className="flex gap-3">
        <CreditsTable parsed={parsed} />
        <div className="flex w-64 shrink-0 flex-col gap-3">
          <BorrowerInfoCard parsed={parsed} />
          <CompactAlerts parsed={parsed} />
        </div>
      </div>
    </div>
  );
}
