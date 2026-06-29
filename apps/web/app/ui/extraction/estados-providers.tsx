import type { ParsedBankStatementProvider } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface EstadosProvidersProps {
  providers: ParsedBankStatementProvider[];
}

/**
 * Horizontal-scrollable section showing possible payroll providers
 * detected across bank statements. Recurrence indicator:
 *  - green dot = recurring (Quincenal/Mensual)
 *  - amber dot = single deposit
 *  - gray dot = sporadic/unknown
 */
export default function EstadosProviders({
  providers,
}: EstadosProvidersProps) {
  return (
    <Card className="space-y-3.5 p-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gf-text">
          Posibles pagadoras recurrentes
        </span>
        <span className="text-xs text-gf-text-muted">
          · {providers.length} detectadas
        </span>
        {providers.length > 4 && (
          <span className="ml-auto rounded-md bg-gray-100 px-2 py-1 text-[10px] text-gf-text-muted">
            ← desplazar →
          </span>
        )}
      </div>

      {/* Scroll container */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {providers.map((p, i) => (
          <ProviderCard key={`${p.payerName}-${i}`} provider={p} />
        ))}
      </div>
    </Card>
  );
}

function ProviderCard({
  provider,
}: {
  provider: ParsedBankStatementProvider;
}) {
  const recurrence = provider.estimatedRecurrence ?? "";
  const isRecurring =
    /quincenal|mensual|semanal|bimensual/i.test(recurrence);
  const isOnce = /único|unico|una vez/i.test(recurrence);

  const dotColor = isRecurring
    ? "bg-green-500"
    : isOnce
      ? "bg-amber-500"
      : "bg-gray-400";

  const textColor = isRecurring
    ? "text-green-600"
    : isOnce
      ? "text-amber-600"
      : "text-gray-500";

  const frequencyLabel = recurrence || "Esporádico";

  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-2 rounded-lg bg-gf-bg p-3.5">
      {/* Status dot */}
      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />

      <div className="flex flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold text-gf-text leading-snug">
          {provider.payerName}
        </span>
        {provider.payerRfc && (
          <span className="text-[11px] text-gf-text-muted">
            RFC: {provider.payerRfc}
          </span>
        )}
        <span className={`text-xs font-medium ${textColor}`}>
          {frequencyLabel}
          {provider.amount != null
            ? ` · ${fmtCurrency(provider.amount)}`
            : ""}
        </span>
        {provider.depositDate && (
          <span className="text-[11px] text-gf-text-soft">
            {fmtShort(provider.depositDate)}
          </span>
        )}
      </div>
    </div>
  );
}

function fmtShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]} ${fmtMonth(m[2])} ${m[1]}`;
  return iso;
}

function fmtMonth(mm: string): string {
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
