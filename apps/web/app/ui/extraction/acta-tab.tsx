"use client";

import type { Document } from "@/app/lib/definitions";
import { formatDateDisplay } from "@/app/lib/extraction";
import {
  parseArticlesDocument,
  resolveVigentArticles,
  type ArticlesDocumentView,
} from "@/app/lib/articles-view";
import EmptyState from "@/app/ui/common/empty-state";

interface ActaTabProps {
  documents: Document[];
}

function money(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function percent(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

function show(value: string | null | undefined): string {
  return value && value.trim() !== "" ? value : "—";
}

export default function ActaTab({ documents }: ActaTabProps) {
  const processed = documents.filter((doc) => doc.documentStatus.code === "PROCESSED");
  const parsed = processed
    .map(parseArticlesDocument)
    .filter((doc): doc is ArticlesDocumentView => doc != null);
  const vigent = resolveVigentArticles(parsed);

  if (parsed.length === 0) {
    return (
      <EmptyState message="No hay un acta procesada todavía. Al procesar el acta constitutiva o una modificación de poderes, el cuadro accionario aparece aquí." />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gf-border bg-white p-5 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
          Participación vigente
        </p>
        <p className="mt-1 text-2xl font-bold text-gf-text">
          {percent(vigent.applicantSharePercentage)}
        </p>
        <p className="mt-1 text-sm text-gf-text">
          {vigent.applicantShareholderName ?? "Solicitante no identificado en el cuadro"}
          {vigent.legalName ? ` · ${vigent.legalName}` : ""}
        </p>
        <p className="mt-1 text-xs text-gf-text-muted">
          {vigent.sourceLabel
            ? `Tomada de ${vigent.sourceLabel}.`
            : "Sin cuadro accionario."}
        </p>
        {vigent.displacedByUnregisteredAmendment && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Hay una modificación con cuadro accionario sin fecha de inscripción. No sustituye el cuadro inscrito.
          </p>
        )}
      </section>

      {parsed.map((doc) => (
        <article key={doc.documentId} className="space-y-4 rounded-xl border border-gf-border bg-white p-5 shadow-xs">
          <header>
            <h3 className="text-base font-bold text-gf-text">{doc.title}</h3>
            <p className="text-xs text-gf-text-muted">{doc.originalName}</p>
          </header>

          {doc.isNonProfit && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              Asociación sin fines de lucro. Descarte: este tipo de sociedad no se acepta. El resto de la extracción sigue disponible.
            </p>
          )}

          {doc.alerts
            .filter((alert) => alert.code !== "ASOCIACION_SIN_FINES_DE_LUCRO")
            .map((alert) => (
              <p
                key={alert.code}
                className={
                  alert.severity === "CRITICAL"
                    ? "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                    : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                }
              >
                {alert.message}
              </p>
            ))}

          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Razón social" value={show(doc.legalName)} />
            <Field label="Régimen" value={show(doc.legalForm)} />
            <Field label="RFC" value={show(doc.rfc)} />
            <Field label="Número de escritura" value={show(doc.deedNumber)} />
            <Field label="Fecha de escritura" value={show(formatDateDisplay(doc.deedDate))} />
            <Field label="Notario" value={show(doc.notary)} />
            <Field label="Fecha de constitución" value={show(formatDateDisplay(doc.incorporationDate))} />
            <Field label="Fecha de asamblea" value={show(formatDateDisplay(doc.assemblyDate))} />
            <Field label="Administración" value={show(doc.administrationLabel)} />
            <Field
              label="Inscripción"
              value={[doc.registryFolio, formatDateDisplay(doc.registryDate), doc.registryPlace]
                .filter(Boolean)
                .join(" · ") || "—"}
            />
          </dl>

          {doc.shareholders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Cuadro accionario</caption>
                <thead className="text-xs uppercase text-gf-text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Accionista</th>
                    <th className="py-2 pr-3 font-semibold">Series</th>
                    <th className="py-2 pr-3 font-semibold">Valor nominal</th>
                    <th className="py-2 pr-3 font-semibold">Valor total</th>
                    <th className="py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.shareholders.map((row) => (
                    <tr key={row.name} className="border-t border-gf-border">
                      <td className="py-2 pr-3">
                        {row.name}
                        {row.relationshipToApplicant ? ` (${row.relationshipToApplicant})` : ""}
                      </td>
                      <td className="py-2 pr-3">{show(row.seriesLabel)}</td>
                      <td className="py-2 pr-3">{money(row.nominalValue)}</td>
                      <td className="py-2 pr-3">{money(row.totalValue)}</td>
                      <td className="py-2 font-semibold">{percent(row.percentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {doc.powers.length > 0 && (
            <ul className="space-y-1 text-sm text-gf-text">
              {doc.powers.map((power) => (
                <li key={power.holderName}>
                  {power.holderName}: {power.faculties}
                  {power.revoked ? " (revocado)" : ""}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gf-text-muted">{label}</dt>
      <dd className="text-sm text-gf-text">{value}</dd>
    </div>
  );
}
