import type { AnalysisRun, PmBankGateStatus } from "@/app/lib/definitions";
import { readPmGates } from "@/app/lib/pm-gates-view";
import Card from "@/app/ui/common/card";

const BANK_LABELS: Record<string, string> = {
  SANTANDER: "Santander",
  SCOTIABANK: "Scotiabank",
  BANORTE: "Banorte",
  HSBC: "HSBC",
  CITIBANAMEX: "Banamex",
};

const STATUS_LABELS: Record<PmBankGateStatus, string> = {
  VIABLE: "Viable",
  NOT_VIABLE: "No viable",
  INCOMPLETE: "Falta un dato",
};

export default function PmGatesCard({
  run,
}: {
  run: AnalysisRun | null;
}) {
  const gates = run ? readPmGates(run) : null;

  if (!gates) {
    return (
      <Card>
        <p className="text-sm text-gf-text-muted">
          {run
            ? "Este análisis no trae los candados de Persona Moral. Vuelve a analizar el expediente."
            : "Sin analizar. Ejecuta el análisis para ver qué banco pasa los candados."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gf-text">Candados por banco</h3>
        <p className="mt-1 text-xs text-gf-text-muted">
          El porcentaje y la antigüedad se evalúan al momento del análisis.
        </p>
      </div>

      {gates.identityLocks.length > 0 && (
        <ul className="space-y-2">
          {gates.identityLocks.map((lock) => (
            <li
              key={lock.code}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {lock.message}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        {gates.banks.map((bank) => (
          <li key={bank.bankCode} className="rounded-lg border border-gf-border px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gf-text">
                {BANK_LABELS[bank.bankCode] ?? bank.bankCode}
              </p>
              <span className={statusClass(bank.status)}>{STATUS_LABELS[bank.status]}</span>
            </div>
            {bank.locks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {bank.locks.map((lock) => (
                  <li key={lock.code} className="text-sm text-gf-text-muted">
                    {lock.message}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function statusClass(status: PmBankGateStatus): string {
  if (status === "VIABLE") {
    return "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800";
  }
  if (status === "NOT_VIABLE") {
    return "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800";
  }
  return "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900";
}
