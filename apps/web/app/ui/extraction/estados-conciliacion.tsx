import type { Document } from "@/app/lib/definitions";
import type { ParsedBankStatementDeposit } from "@/app/lib/extraction";
import { parsePayroll } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface EstadosConciliacionProps {
  allDeposits: ParsedBankStatementDeposit[];
  payrollDocs: Document[];
}

const TOLERANCE_PCT = 5;

/**
 * Sprint 2 — Conciliación PRELIMINAR con nómina.
 *
 * Compara depósitos de nómina detectados en estados de cuenta contra
 * ingresos netos de recibos de nómina. Los resultados son INFORMATIVOS;
 * las reglas financieras definitivas y la normalización de empleadores
 * se implementarán en Sprint 3.
 */
export default function EstadosConciliacion({
  allDeposits,
  payrollDocs,
}: EstadosConciliacionProps) {
  const payrollParsed = parsePayroll(payrollDocs);
  const payrollReceipts = payrollParsed.receipts.filter((r) => r.hasData);

  const totalDeposits = allDeposits.reduce(
    (sum, d) => sum + (d.amount ?? 0),
    0,
  );
  const totalNetIncome = payrollReceipts.reduce(
    (sum, r) => sum + (r.ingresoNeto ?? 0),
    0,
  );

  if (totalDeposits === 0 && totalNetIncome === 0) {
    return null;
  }

  const difference = totalDeposits - totalNetIncome;
  const diffPct =
    totalNetIncome > 0
      ? Math.abs((difference / totalNetIncome) * 100)
      : totalDeposits > 0
        ? 100
        : 0;
  const withinTolerance = diffPct <= TOLERANCE_PCT;

  // ── Per-employer breakdown (informative only) ─────────────────────────
  const employerMap = new Map<
    string,
    {
      employerName: string;
      employerRfc: string | null;
      totalDeposited: number;
      totalNetIncome: number;
    }
  >();

  for (const dep of allDeposits) {
    const key = dep.employerRfc ?? normalizeName(dep.employerName);
    if (!employerMap.has(key)) {
      employerMap.set(key, {
        employerName: dep.employerName ?? "Desconocido",
        employerRfc: dep.employerRfc,
        totalDeposited: 0,
        totalNetIncome: 0,
      });
    }
    employerMap.get(key)!.totalDeposited += dep.amount ?? 0;
  }

  for (const receipt of payrollReceipts) {
    if (!receipt.empleador) continue;
    const key =
      receipt.empleador.rfc !== "—"
        ? receipt.empleador.rfc
        : normalizeName(receipt.empleador.nombre);
    if (!employerMap.has(key)) {
      employerMap.set(key, {
        employerName: receipt.empleador.nombre,
        employerRfc:
          receipt.empleador.rfc !== "—" ? receipt.empleador.rfc : null,
        totalDeposited: 0,
        totalNetIncome: 0,
      });
    }
    employerMap.get(key)!.totalNetIncome += receipt.ingresoNeto ?? 0;
  }

  const employerRows = Array.from(employerMap.values()).filter(
    (e) => e.totalDeposited > 0 || e.totalNetIncome > 0,
  );

  // Detect potential duplicates (same normalized name, different key)
  const nameCounts = new Map<string, number>();
  for (const row of employerRows) {
    const norm = normalizeName(row.employerName);
    nameCounts.set(norm, (nameCounts.get(norm) ?? 0) + 1);
  }
  const hasNormalizationNeeded = Array.from(nameCounts.values()).some(
    (c) => c > 1,
  );

  return (
    <Card className="space-y-5 p-6">
      {/* ── Header — Sprint 2 scope ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-3.5 w-3.5 rounded-full bg-blue-400" />
        <span className="text-base font-semibold text-gf-text">
          Conciliación preliminar con nómina
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          Preliminar — requiere validación
        </span>
      </div>

      {/* ── Scope note ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-2.5">
        <p className="text-xs text-blue-700">
          Esta comparación es informativa. La conciliación definitiva y sus
          reglas financieras se implementarán en Sprint 3.
        </p>
      </div>

      <p className="text-[13px] text-gf-text-muted">
        Comparación entre depósitos de nómina detectados en estados de cuenta
        y los ingresos netos reportados en recibos de nómina procesados.
      </p>

      {/* ── Comparison cards — neutral styling ────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-gf-bg p-4">
          <span className="text-[11px] font-medium text-gf-text-muted">
            DEPÓSITOS DETECTADOS ({allDeposits.length} EE.CC.)
          </span>
          <p className="mt-1 text-2xl font-bold text-gf-text">
            {fmtCurrency(totalDeposits)}
          </p>
          <span className="text-xs text-gf-text-muted">
            {allDeposits.length} depósitos de nómina
          </span>
        </div>

        <div className="rounded-xl bg-gf-bg p-4">
          <span className="text-[11px] font-medium text-gf-text-muted">
            INGRESO NETO (RECIBOS NÓMINA)
          </span>
          <p className="mt-1 text-2xl font-bold text-gf-text">
            {fmtCurrency(totalNetIncome)}
          </p>
          <span className="text-xs text-gf-text-muted">
            {payrollReceipts.length} recibos procesados
          </span>
        </div>

        {/* Difference — neutral, no success/failure judgment */}
        <div className="rounded-xl bg-blue-50 p-4">
          <span className="text-[11px] font-medium text-blue-600">
            DIFERENCIA
          </span>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {difference >= 0 ? "+" : ""}
            {fmtCurrency(difference)}
          </p>
          <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
            {withinTolerance
              ? `${diffPct.toFixed(1)}% — dentro del margen de ${TOLERANCE_PCT}%`
              : `${diffPct.toFixed(1)}% — excede el margen de ${TOLERANCE_PCT}%`}
          </span>
        </div>
      </div>

      {/* ── Employer breakdown (informative, no conclusions) ──────────── */}
      {employerRows.length > 0 && (
        <>
          <hr className="border-gf-border" />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gf-text">
                Comparación por empleador
              </span>
              <span className="text-xs text-gf-text-muted">
                (matching preliminar — sujeto a normalización en Sprint 3)
              </span>
            </div>

            {/* Table header */}
            <div className="flex items-center gap-4 px-2 text-[11px] font-semibold text-gf-text-soft">
              <span className="w-44">EMPLEADOR</span>
              <span className="w-28 text-right">DEPÓSITOS</span>
              <span className="w-28 text-right">NÓMINA</span>
              <span className="w-20 text-right">DIF.</span>
              <span className="w-28 text-right">ESTADO</span>
            </div>

            {employerRows.map((row, i) => {
              const rowDiff = row.totalDeposited - row.totalNetIncome;
              const rowPct =
                row.totalNetIncome > 0
                  ? Math.abs((rowDiff / row.totalNetIncome) * 100)
                  : row.totalDeposited > 0
                    ? 100
                    : 0;
              const rowWithinTol = rowPct <= TOLERANCE_PCT;

              // Key without RFC means the employer was matched by name only
              const needsNormalization =
                !row.employerRfc || hasNormalizationNeeded;

              return (
                <div
                  key={`${row.employerRfc ?? row.employerName}-${i}`}
                  className="flex items-center gap-4 rounded-lg bg-gf-bg px-3 py-2.5 text-sm"
                >
                  {/* Employer name */}
                  <div className="w-44 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-semibold text-gf-text truncate">
                      {row.employerName}
                    </span>
                    <span className="text-[11px] text-gf-text-soft">
                      {row.employerRfc ?? "RFC no detectado"}
                    </span>
                  </div>

                  <span className="w-28 text-right text-sm font-semibold text-gf-text">
                    {fmtCurrency(row.totalDeposited)}
                  </span>
                  <span className="w-28 text-right text-sm font-semibold text-gf-text">
                    {fmtCurrency(row.totalNetIncome)}
                  </span>
                  <span className="w-20 text-right text-[13px] font-medium text-gf-text-muted">
                    {rowDiff >= 0 ? "+" : ""}
                    {fmtCurrency(rowDiff)}
                  </span>

                  {/* Status — neutral, preliminary */}
                  <span className="w-28 text-right rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                    {needsNormalization
                      ? "Pend. normalizar"
                      : rowWithinTol
                        ? `Var. ${rowPct.toFixed(1)}%`
                        : `Dif. ${rowPct.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Normalization note ────────────────────────────────────────── */}
      {hasNormalizationNeeded && (
        <div className="rounded-lg bg-blue-50/50 px-4 py-3">
          <p className="text-xs text-blue-700">
            Se detectaron empleadores con nombres similares que podrían
            corresponder a la misma entidad. La normalización de empleadores
            y el matching definitivo se implementarán en Sprint 3.
          </p>
        </div>
      )}

      {/* ── Discrepancy note — neutral wording ────────────────────────── */}
      {!withinTolerance && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="text-xs text-blue-700">
            Coincidencia pendiente de confirmar. La normalización final de
            empleadores y reglas definitivas de conciliación se implementarán
            en Sprint 3.
          </p>
        </div>
      )}
    </Card>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalize an employer name for loose matching (Sprint 2). */
function normalizeName(name: string | null | undefined): string {
  if (!name) return "desconocido";
  return name
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]/g, "")
    .trim();
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}
