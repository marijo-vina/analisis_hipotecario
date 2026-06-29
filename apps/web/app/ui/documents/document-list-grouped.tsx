import type { ReactNode } from "react";
import type { Document } from "@/app/lib/definitions";
import DataTable, { type Column } from "@/app/ui/common/data-table";
import StatusBadge from "@/app/ui/common/badge";
import DocumentActions from "./document-actions";

interface DocumentListGroupedProps {
  caseId: string;
  documents: Document[];
}

/**
 * DocumentListGrouped — agrupa documentos por tipo y renderiza una
 * sección compacta por cada categoría.
 *
 * Columnas por grupo: Archivo, Estatus, Fecha de carga, Acciones.
 * Sin columna "Tipo" porque el encabezado de sección ya lo indica.
 */
export default function DocumentListGrouped({
  caseId,
  documents,
}: DocumentListGroupedProps) {
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

  // ── Shared columns (no "Tipo" — the section header is the type) ─────
  const columns: Column<Document>[] = [
    {
      key: "originalName",
      header: "Archivo",
      render: (doc: Document): ReactNode => doc.originalName,
    },
    {
      key: "status",
      header: "Estatus",
      render: (doc: Document): ReactNode => (
        <StatusBadge
          code={doc.documentStatus.code}
          name={doc.documentStatus.name}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Fecha de carga",
      render: (doc: Document): ReactNode =>
        new Date(doc.createdAt).toLocaleDateString("es-MX", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (doc: Document): ReactNode => (
        <DocumentActions caseId={caseId} document={doc} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([code, docs]) => {
        // Use first doc's type name for the header
        const typeName = docs[0].documentType.name;

        return (
          <section key={code}>
            <h4 className="text-sm font-semibold text-gf-text mb-2 flex items-center gap-2">
              {typeName}
              <span className="inline-flex items-center rounded-full bg-gf-bg px-2 py-0.5 text-xs font-normal text-gf-text-muted">
                {docs.length}
              </span>
            </h4>
            <DataTable
              columns={columns}
              rows={docs}
              emptyMessage={`Sin documentos de tipo ${typeName}`}
            />
          </section>
        );
      })}
    </div>
  );
}
