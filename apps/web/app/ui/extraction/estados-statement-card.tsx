"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Building,
  User,
  Wallet,
  Calendar,
  Clock,
  ShieldCheck,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { showsDepositReviewQueue } from "@/app/lib/deposit-review";
import type { ParsedBankStatement } from "@/app/lib/extraction";
import { updateBankDepositClassification } from "@/app/actions/documents";

interface EstadosStatementCardProps {
  statement: ParsedBankStatement;
  isExpanded?: boolean;
  onToggle?: () => void;
}

/**
 * EstadosStatementCard — Tarjeta acordeón de estado de cuenta según Stitch / design.md.
 */
export default function EstadosStatementCard({
  statement,
  isExpanded,
  onToggle,
}: EstadosStatementCardProps) {
  const params = useParams();
  const caseId = (params?.id as string) || (statement as any).mortgageCaseId || "";

  const [deposits, setDeposits] = useState<any[]>(
    statement.financialDepuration?.cleanedDeposits || [],
  );
  const [summary, setSummary] = useState(
    statement.financialDepuration?.depurationSummary,
  );
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const visibleAlerts = statement.alerts.filter(
    (a) => a.code !== "BANK_FEWER_MONTHS_THAN_REQUIRED",
  );
  const criticalAlertCount = visibleAlerts.filter(
    (a) => a.severity === "CRITICAL",
  ).length;
  const warningAlertCount = visibleAlerts.length - criticalAlertCount;
  const visibleHasCritical = criticalAlertCount > 0;

  const [internalExpanded, setInternalExpanded] = useState<boolean>(false);
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded;
  const handleToggle = onToggle ?? (() => setInternalExpanded((prev) => !prev));

  async function handleClassification(
    index: number,
    classification: "VALID" | "TRASH",
  ) {
    if (loadingIndex !== null || !caseId || !statement.documentId) return;
    setLoadingIndex(index);

    const prevDeposits = [...deposits];
    const updated = [...deposits];
    const dep = { ...updated[index] };
    dep.classification = classification;
    dep.isHighImpactOutlier = false;
    if (classification === "VALID") {
      dep.validCategory = "CONFIRMED_BY_ANALYST";
      dep.trashCategory = undefined;
      dep.reason = "Aprobado manualmente por la asesora";
    } else {
      dep.trashCategory = "OTHER_NON_BUSINESS";
      dep.validCategory = undefined;
      dep.reason = "Descartado manualmente por la asesora";
    }
    updated[index] = dep;
    setDeposits(updated);

    // Recalcular métricas en memoria al instante
    let validTotal = 0;
    let trashTotal = 0;
    let validCount = 0;
    let trashCount = 0;
    let reviewCount = 0;

    for (const d of updated) {
      if (d.classification === "VALID") {
        validTotal += d.amount || 0;
        validCount++;
      } else if (d.classification === "TRASH") {
        trashTotal += d.amount || 0;
        trashCount++;
      } else {
        reviewCount++;
      }
    }

    setSummary((prev: any) =>
      prev
        ? {
            ...prev,
            totalValidIncome: Math.round(validTotal * 100) / 100,
            totalTrashDeposits: Math.round(trashTotal * 100) / 100,
            validDepositsCount: validCount,
            trashDepositsCount: trashCount,
            needsReviewCount: reviewCount,
          }
        : prev,
    );

    try {
      await updateBankDepositClassification(
        caseId,
        statement.documentId,
        index,
        classification,
      );
    } catch (err) {
      // Revertir en caso de error
      setDeposits(prevDeposits);
      console.error("Error al actualizar clasificación:", err);
    } finally {
      setLoadingIndex(null);
    }
  }

  const reviewQueueOpen = showsDepositReviewQueue(
    statement.financialDepuration?.integrityCheck?.status,
  );
  const bankBadge = getBankBadge(statement.bankName);
  const bankBg = bankBadge.bg;

  const periodLabel =
    statement.periodStart && statement.periodEnd
      ? `${fmtShort(statement.periodStart)} — ${fmtShort(statement.periodEnd)}`
      : statement.periodStart
        ? fmtShort(statement.periodStart)
        : "Sin periodo";

  const balanceIsNegative =
    statement.endingBalance != null && statement.endingBalance < 0;

  const isMonthClosed =
    statement.isClosedMonth ||
    (statement.periodEnd != null && new Date(statement.periodEnd) < new Date());

  const isError =
    statement.statusCode === "ERROR" ||
    statement.statusCode === "EXTRACTION_ERROR";
  const isPending =
    statement.statusCode === "UPLOADED" ||
    statement.statusCode === "PROCESSING";

  // ── Non-data state: show filename + status badge ─────────────────────
  if (!statement.hasData) {
    return (
      <div className="bg-white rounded-xl border border-gf-border shadow-2xs overflow-hidden">
        <div className="flex w-full items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gf-surface-dim text-gf-text-muted">
              <Building className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-gf-text truncate">
                {statement.originalName}
              </span>
              <span className="text-xs text-gf-text-muted">
                {statement.statusName}
              </span>
            </div>
          </div>

          <span
            className={
              isError
                ? "inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-semibold"
                : "inline-flex items-center gap-1 rounded-full bg-gf-surface-dim text-gf-text-muted border border-gf-border px-2.5 py-0.5 text-xs font-semibold"
            }
          >
            {isError ? (
              <>
                <AlertTriangle className="h-3 w-3 text-red-600" /> Error
              </>
            ) : isPending ? (
              <>
                <Clock className="h-3 w-3 animate-spin" /> Pendiente
              </>
            ) : (
              statement.statusName
            )}
          </span>
        </div>

        {isError && (
          <div className="border-t border-gf-border px-5 py-3 bg-red-50/50">
            <p className="text-xs text-red-700">
              La extracción de datos falló. Usa &quot;Reintentar extracción&quot; en el explorador de documentos para volver a intentarlo.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Data state: normal expandable card ───────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gf-border shadow-2xs overflow-hidden transition-all">
      {/* ── Header Row (Stitch Layout) ──────────────────────────────── */}
      <div
        onClick={handleToggle}
        className="px-5 py-4 bg-white hover:bg-gf-surface-dim/60 flex items-center justify-between cursor-pointer transition-colors select-none border-b border-gf-border/50"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={`min-w-10 h-10 px-1.5 rounded-xl ${bankBg} text-white flex items-center justify-center font-bold text-[10px] tracking-tight shrink-0 shadow-2xs`}
            title={statement.bankName ?? "Banco"}
          >
            {bankBadge.initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-gf-text truncate">
              {statement.originalName ?? statement.bankName ?? "Estado de cuenta"}
            </span>
            <span className="text-xs text-gf-text-muted">
              {statement.bankName ?? "Banco detectado"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            {criticalAlertCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-semibold">
                <AlertCircle className="h-3 w-3 text-red-600" />
                {criticalAlertCount} crítica{criticalAlertCount !== 1 ? "s" : ""}
              </span>
            )}
            {warningAlertCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                {warningAlertCount} advertencia
                {warningAlertCount !== 1 ? "s" : ""}
              </span>
            )}
            {statement.deposits.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {statement.deposits.length} dép.
              </span>
            )}
            <span
              className={
                isMonthClosed
                  ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold"
                  : "inline-flex items-center gap-1 rounded-full bg-gf-surface-dim text-gf-text-muted border border-gf-border px-2.5 py-0.5 text-xs font-semibold"
              }
            >
              {periodLabel} · {isMonthClosed ? "Cerrado" : "En curso"}
            </span>
          </div>

          <div className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-text hover:bg-gf-surface transition-colors">
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-200 ${
                expanded ? "rotate-180 text-gf-text" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Alertas visibles antes de expandir el desglose */}
      {!expanded && visibleAlerts.length > 0 && (
        <div className="px-5 py-3 border-b border-gf-border/50 space-y-2 bg-gf-surface/40">
          {visibleAlerts.map((alert) => {
            const isCrit = alert.severity === "CRITICAL";
            return (
              <div
                key={alert.code}
                className={
                  isCrit
                    ? "rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-800 flex items-start gap-2"
                    : "rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 flex items-start gap-2"
                }
              >
                {isCrit ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <p className="leading-relaxed">{alert.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Expanded Detail (Stitch Layout) ─────────────────────────── */}
      {expanded && (
        <div className="p-6 bg-white space-y-6">
          {/* 1. KPIs Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCell
              label="Saldo promedio"
              value={
                statement.averageBalance != null
                  ? fmtCurrency(statement.averageBalance)
                  : "—"
              }
              sub="MXN"
            />
            <MetricCell
              label="Saldo final"
              value={
                statement.endingBalance != null
                  ? fmtCurrency(statement.endingBalance)
                  : "—"
              }
              sub="MXN"
              danger={balanceIsNegative}
            />
            <MetricCell
              label={statement.financialDepuration ? "Ingreso válido" : "Depósitos nómina"}
              value={
                summary
                  ? fmtCurrency(summary.totalValidIncome)
                  : statement.financialDepuration?.depurationSummary
                  ? fmtCurrency(
                      statement.financialDepuration.depurationSummary
                        .totalValidIncome,
                    )
                  : String(statement.deposits.length)
              }
              sub={
                summary
                  ? `${summary.validDepositsCount} depósitos`
                  : statement.financialDepuration?.depurationSummary
                  ? `${statement.financialDepuration.depurationSummary.validDepositsCount} depósitos`
                  : "detectados"
              }
              accent={
                statement.financialDepuration
                  ? (summary?.validDepositsCount ??
                      statement.financialDepuration.depurationSummary
                        ?.validDepositsCount ??
                      0) > 0
                  : statement.deposits.length > 0
              }
            />
            <MetricCell
              label="Alertas"
              value={String(visibleAlerts.length)}
              sub={
                visibleHasCritical
                  ? "críticas"
                  : visibleAlerts.length > 0
                    ? "advertencias"
                    : "sin alertas"
              }
              danger={visibleHasCritical}
              warning={!visibleHasCritical && visibleAlerts.length > 0}
            />
          </div>

          {/* 2. Datos de la cuenta */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-gf-tertiary" />
              Datos de la cuenta
            </h4>
            <div className="bg-gf-surface p-4 rounded-xl border border-gf-border/60 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldCell label="Titular de la cuenta">
                  {statement.accountHolder ?? "—"}
                </FieldCell>
                <FieldCell label="RFC del titular">
                  {statement.accountHolderRfc ?? "—"}
                </FieldCell>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gf-border/40">
                <FieldCell label="Número de cuenta">
                  {statement.accountNumber
                    ? `**** ${statement.accountNumber.slice(-4)}`
                    : "—"}
                </FieldCell>
                <FieldCell label="CLABE interbancaria">
                  {statement.clabe ? maskClabe(statement.clabe) : "—"}
                </FieldCell>
                <FieldCell label="Tipo de cuenta">
                  {statement.isJointAccount === true
                    ? "Mancomunada"
                    : statement.isJointAccount === false
                      ? "Individual"
                      : "—"}
                </FieldCell>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gf-border/40">
                <FieldCell label="Periodo">
                  {periodLabel}
                </FieldCell>
                <FieldCell label="Fecha de corte">
                  {statement.cutoffDate
                    ? fmtShort(statement.cutoffDate)
                    : "—"}
                </FieldCell>
                <FieldCell label="Estado del mes">
                  <span
                    className={
                      isMonthClosed
                        ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold"
                        : "inline-flex items-center gap-1 rounded-full bg-gf-surface-dim text-gf-text-muted border border-gf-border px-2 py-0.5 text-[11px] font-semibold"
                    }
                  >
                    {isMonthClosed ? "Mes cerrado" : "En curso"}
                  </span>
                </FieldCell>
              </div>
            </div>
          </div>

          {/* 3. Alertas del estado de cuenta (antes del desglose) */}
          {visibleAlerts.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Alertas del estado de cuenta
              </h4>
              <div className="space-y-2">
                {visibleAlerts.map((alert) => {
                  const isCrit = alert.severity === "CRITICAL";
                  return (
                    <div
                      key={alert.code}
                      className={
                        isCrit
                          ? "rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-start gap-2.5"
                          : "rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800 flex items-start gap-2.5"
                      }
                    >
                      {isCrit ? (
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-bold">{alert.severity}</p>
                        <p className="mt-0.5 leading-relaxed">{alert.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Asalariado: solo nómina o patrón. PFAE: atípicos y rechazados. */}
          {(() => {
            const payrollOnly = statement.financialDepuration?.incomeMode === "PAYROLL";
            if (payrollOnly) {
              if (!deposits?.length) return null;
              return (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted flex items-center gap-1.5 mb-3">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Depósitos de nómina
                  </h4>
                  <div className="space-y-2.5">
                    {deposits.map((dep: any, i: number) => {
                      const dateParts = dep.date ? parseDateParts(dep.date) : null;
                      return (
                        <div
                          key={i}
                          className="rounded-xl p-3.5 flex items-center gap-3.5 border border-emerald-200/80 bg-gf-surface"
                        >
                          <div className="flex flex-col items-center justify-center w-11 text-center bg-white p-1.5 rounded-lg border border-gf-border/60 shrink-0">
                            <span className="text-[10px] font-bold text-gf-red uppercase">
                              {dateParts?.monthAbbr ?? "—"}
                            </span>
                            <span className="text-sm font-bold text-gf-text leading-tight">
                              {dateParts?.day ?? "—"}
                            </span>
                            <span className="text-[8px] text-gf-text-muted">
                              {dateParts?.year ?? "—"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-bold text-emerald-700">
                              {dep.amount != null ? `${fmtCurrency(dep.amount)} MXN` : "—"}
                            </span>
                            <span className="text-xs font-semibold text-gf-text uppercase line-clamp-1">
                              {dep.payerOrBeneficiaryName ?? dep.originalConcept ?? "—"}
                            </span>
                            {dep.originalConcept && (
                              <span className="text-[11px] text-gf-text-muted line-clamp-1">
                                Concepto: {dep.originalConcept}
                              </span>
                            )}
                            {dep.reason && (
                              <span className="text-[11px] text-emerald-700 font-medium">
                                {dep.reason}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const hasFlagged =
              deposits?.some(
                (dep: any) =>
                  dep.classification === "NEEDS_REVIEW" ||
                  dep.isHighImpactOutlier === true ||
                  dep.classification === "TRASH",
              ) ?? false;
            if (!hasFlagged) return null;
            return (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Movimientos y Depósitos Depurados
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(summary?.needsReviewCount ?? 0) > 0 && reviewQueueOpen && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold">
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                      {summary?.needsReviewCount} atípico{summary?.needsReviewCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(summary?.trashDepositsCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold">
                      {summary?.trashDepositsCount} descartados
                    </span>
                  )}
                </div>
              </div>

              {/* Banner explicativo si hay depósitos atípicos de alto impacto */}
              {(summary?.needsReviewCount ?? 0) > 0 && reviewQueueOpen && (
                <div className="mb-3.5 p-3 rounded-xl bg-amber-50/90 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900 shadow-2xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-amber-950">
                      Se detectaron {summary?.needsReviewCount} depósito(s) atípico(s) de alto impacto
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Representan una alta concentración del mes o montos extraordinarios. Puedes usar los botones de acción rápida <strong>Aprobar</strong> o <strong>Descartar</strong> en cada renglón.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {deposits.map((dep: any, i: number) => {
                  const dateParts = dep.date ? parseDateParts(dep.date) : null;
                  const isReview =
                    reviewQueueOpen &&
                    (dep.classification === 'NEEDS_REVIEW' || dep.isHighImpactOutlier === true);
                  const isTrash = dep.classification === 'TRASH';
                  const isValid = dep.classification === 'VALID' && !dep.isHighImpactOutlier;

                  // Solo mostrar advertencias/atípicos y rechazados
                  if (!isReview && !isTrash) return null;

                  return (
                    <div
                      key={i}
                      className={`rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border transition-all ${
                        isReview
                          ? "bg-amber-50/40 border-amber-300 hover:border-amber-400 shadow-2xs"
                          : isValid
                          ? "bg-gf-surface border-emerald-200/80 hover:border-emerald-300"
                          : "bg-gf-surface border-gf-border/60 hover:border-gf-border opacity-80"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Date badge */}
                        <div className="flex flex-col items-center justify-center w-11 text-center bg-white p-1.5 rounded-lg border border-gf-border/60 shrink-0">
                          <span className="text-[10px] font-bold text-gf-red uppercase">
                            {dateParts?.monthAbbr ?? "—"}
                          </span>
                          <span className="text-sm font-bold text-gf-text leading-tight">
                            {dateParts?.day ?? "—"}
                          </span>
                          <span className="text-[8px] text-gf-text-muted">
                            {dateParts?.year ?? "—"}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-sm font-bold ${
                              isReview
                                ? "text-amber-800 font-extrabold"
                                : isValid
                                ? "text-emerald-700"
                                : "text-gf-text-muted line-through"
                            }`}
                          >
                            {dep.amount != null ? `${fmtCurrency(dep.amount)} MXN` : "—"}
                          </span>
                          <span className="text-xs font-semibold text-gf-text uppercase line-clamp-1">
                            {dep.payerOrBeneficiaryName ?? dep.originalConcept ?? "—"}
                          </span>
                          {dep.originalConcept && (
                            <span className="text-[11px] text-gf-text-muted line-clamp-1">
                              Concepto: {dep.originalConcept}
                            </span>
                          )}
                          {isReview && dep.reason && (
                            <span className="text-[11px] text-amber-800 font-semibold flex items-center gap-1">
                              ⚠️ {dep.reason}
                            </span>
                          )}
                          {isTrash && dep.reason && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              Motivo de descarte: {dep.reason}
                            </span>
                          )}
                          {isValid && dep.validCategory === 'CONFIRMED_BY_ANALYST' && (
                            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              ✓ {dep.reason || "Aprobado manualmente por la asesora"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isReview ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={loadingIndex === i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassification(i, "VALID");
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                              title="Aprobar e incluir en el ingreso válido computable"
                            >
                              {loadingIndex === i ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Aprobar
                            </button>
                            <button
                              type="button"
                              disabled={loadingIndex === i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassification(i, "TRASH");
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 text-slate-700 hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                              title="Descartar del ingreso computable"
                            >
                              <X className="h-3.5 w-3.5" />
                              Descartar
                            </button>
                          </div>
                        ) : isValid ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold shadow-2xs">
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              {dep.validCategory === "CONFIRMED_BY_ANALYST"
                                ? "Aprobado (Manual)"
                                : "Ingreso Válido"}
                            </span>
                            <button
                              type="button"
                              disabled={loadingIndex === i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassification(i, "TRASH");
                              }}
                              className="text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:underline px-1 py-0.5 rounded cursor-pointer disabled:opacity-50 transition-colors"
                              title="Cambiar a descartado"
                            >
                              Descartar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold shadow-2xs">
                              Descartado ({getTrashCategoryLabel(dep.trashCategory)})
                            </span>
                            <button
                              type="button"
                              disabled={loadingIndex === i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassification(i, "VALID");
                              }}
                              className="text-[11px] font-medium text-slate-400 hover:text-emerald-700 hover:underline px-1 py-0.5 rounded cursor-pointer disabled:opacity-50 transition-colors"
                              title="Cambiar a ingreso válido"
                            >
                              Aprobar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {!statement.financialDepuration && statement.deposits.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Depósitos de nómina detectados
                </h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                  {statement.deposits.length} encontrado{statement.deposits.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-3">
                {statement.deposits.map((dep, i) => {
                  const dateParts = dep.date ? parseDateParts(dep.date) : null;
                  return (
                    <div
                      key={i}
                      className="bg-gf-surface rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-gf-border/60 hover:border-gf-border transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {/* Date badge */}
                        <div className="flex flex-col items-center justify-center w-12 text-center bg-white p-2 rounded-lg border border-gf-border/60 shrink-0">
                          <span className="text-[10px] font-bold text-gf-red uppercase">
                            {dateParts?.monthAbbr ?? "—"}
                          </span>
                          <span className="text-base font-bold text-gf-text leading-tight">
                            {dateParts?.day ?? "—"}
                          </span>
                          <span className="text-[9px] text-gf-text-muted">
                            {dateParts?.year ?? "—"}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <span className="text-base font-bold text-emerald-700">
                            {dep.amount != null
                              ? `${fmtCurrency(dep.amount)} MXN`
                              : "—"}
                          </span>
                          <span className="text-xs font-semibold text-gf-text uppercase">
                            {dep.employerName ?? dep.originalConcept ?? "—"}
                          </span>
                          {dep.originalConcept && (
                            <span className="text-[11px] text-gf-text-muted">
                              Concepto: {dep.originalConcept}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-semibold shadow-2xs">
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Concepto nómina
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  sub,
  danger,
  warning,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
  warning?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-gf-surface p-4 rounded-xl border border-gf-border/60 flex flex-col items-center justify-center text-center">
      <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider mb-1">
        {label}
      </span>
      <span
        className={`text-lg font-bold ${
          danger
            ? "text-red-600"
            : warning
              ? "text-amber-600"
              : accent
                ? "text-emerald-700"
                : "text-gf-text"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium text-gf-text-muted mt-0.5">
        {sub}
      </span>
    </div>
  );
}

function FieldCell({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`text-xs font-semibold text-gf-text ${
          mono ? "font-mono tracking-tight" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function parseDateParts(
  iso: string,
): { monthAbbr: string; day: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const months: Record<string, string> = {
    "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR",
    "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO",
    "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC",
  };
  return { monthAbbr: months[m[2]] ?? m[2], day: m[3], year: m[1] };
}

function fmtShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]} ${fmtMonthAbbr(m[2])} ${m[1]}`;
  return iso;
}

function fmtMonthAbbr(mm: string): string {
  const months: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };
  return months[mm] ?? mm;
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function maskClabe(clabe: string): string {
  if (clabe.length <= 8) return clabe;
  return clabe.slice(0, 4) + " **** " + clabe.slice(-4);
}

const TRASH_CATEGORY_LABELS: Record<string, string> = {
  OWN_TRANSFER: "Traspaso propio",
  LOAN_OR_CREDIT: "Préstamo / Crédito",
  INVESTMENT_WITHDRAWAL: "Inversión / Pagaré",
  REFUND_OR_REVERSAL: "Devolución / Reembolso",
  PERSONAL_ASSET_SALE: "Venta de activo personal",
  GAMBLING_OR_BETTING: "Apuestas / Casino",
  INFORMAL_FAMILY: "Concepto informal / Familiar",
  DOWN_PAYMENT_SAVING: "Ahorro / Enganche",
  RENT_WITHOUT_CSF_REGIME: "Renta sin régimen fiscal",
  OTHER_NON_BUSINESS: "No operativo / Eventual",
};

function getTrashCategoryLabel(category?: string | null): string {
  if (!category) return "No clasificado";
  return TRASH_CATEGORY_LABELS[category] || category;
}

/** Bank badge: recognizable initials (not a single first letter). */
function getBankBadge(bankName: string | null | undefined): {
  initials: string;
  bg: string;
} {
  const brands: Record<string, { initials: string; bg: string }> = {
    BBVA: { initials: "BBVA", bg: "bg-[#004481]" },
    Citibanamex: { initials: "BNMX", bg: "bg-[#003B71]" },
    Santander: { initials: "SAN", bg: "bg-[#EC0000]" },
    Banorte: { initials: "BTE", bg: "bg-[#D92534]" },
    HSBC: { initials: "HSBC", bg: "bg-[#DB0011]" },
    Scotiabank: { initials: "SCO", bg: "bg-[#EE3124]" },
    Azteca: { initials: "AZT", bg: "bg-[#1A1A1A]" },
    Inbursa: { initials: "INB", bg: "bg-[#003C71]" },
    Mifel: { initials: "MIF", bg: "bg-[#003B70]" },
    Banregio: { initials: "BRG", bg: "bg-[#FF6600]" },
    BanBajío: { initials: "BAJ", bg: "bg-[#00A651]" },
  };

  if (bankName && brands[bankName]) return brands[bankName];

  const fallback =
    (bankName ?? "?")
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "")
      .slice(0, 3)
      .toUpperCase() || "?";

  return { initials: fallback, bg: "bg-gf-red" };
}

