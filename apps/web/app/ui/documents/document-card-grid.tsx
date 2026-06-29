import type { Document } from "@/app/lib/definitions";
import StatusBadge from "@/app/ui/common/badge";
import DocumentActions from "./document-actions";

interface DocumentCardGridProps {
  caseId: string;
  documents: Document[];
}

/** Icono visual por tipo de documento */
function docTypeIcon(code: string): string {
  switch (code) {
    case "PAYROLL_RECEIPT":
      return "💰";
    case "INE":
      return "🪪";
    case "PASSPORT":
      return "📘";
    case "BANK_STATEMENT":
      return "🏦";
    case "CREDIT_BUREAU":
      return "📊";
    default:
      return "📄";
  }
}

/** Color sutil de fondo por tipo */
function docTypeAccent(code: string): string {
  switch (code) {
    case "PAYROLL_RECEIPT":
      return "border-l-gf-red";
    case "INE":
      return "border-l-blue-500";
    case "PASSPORT":
      return "border-l-indigo-500";
    case "BANK_STATEMENT":
      return "border-l-emerald-500";
    case "CREDIT_BUREAU":
      return "border-l-amber-500";
    default:
      return "border-l-gf-border";
  }
}

export default function DocumentCardGrid({
  caseId,
  documents,
}: DocumentCardGridProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-8 text-center text-sm text-gf-text-muted">
        No hay documentos cargados
      </div>
    );
  }

  // ── Group by document type ───────────────────────────────────────────
  const groups = new Map<string, Document[]>();
  for (const doc of documents) {
    const code = doc.documentType.code;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(doc);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([code, docs]) => {
        const typeName = docs[0].documentType.name;

        return (
          <section key={code}>
            <h4 className="text-sm font-semibold text-gf-text mb-3 flex items-center gap-2">
              <span aria-hidden="true">{docTypeIcon(code)}</span>
              {typeName}
              <span className="inline-flex items-center rounded-full bg-gf-bg px-2 py-0.5 text-xs font-normal text-gf-text-muted">
                {docs.length}
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className={`rounded-[var(--radius-md)] border border-gf-border border-l-4 ${docTypeAccent(code)} bg-gf-surface p-3 flex flex-col gap-2 transition-colors hover:border-gf-text-muted`}
                >
                  {/* ── File name ─────────────────────────────────── */}
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium text-gf-text truncate"
                      title={doc.originalName}
                    >
                      {doc.originalName}
                    </p>
                  </div>

                  {/* ── Status + date row ─────────────────────────── */}
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge
                      code={doc.documentStatus.code}
                      name={doc.documentStatus.name}
                    />
                    <time
                      className="text-xs text-gf-text-muted shrink-0"
                      dateTime={doc.createdAt}
                    >
                      {new Date(doc.createdAt).toLocaleDateString(
                        "es-MX",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </time>
                  </div>

                  {/* ── Actions ───────────────────────────────────── */}
                  <DocumentActions caseId={caseId} document={doc} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
